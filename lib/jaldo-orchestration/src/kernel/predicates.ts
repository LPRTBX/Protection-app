import { actionTypeOf, expectationFor, type DeploymentConfiguration } from "../contracts/config";
import { DEAD_STATES, type CoordinationState, type Facts, type GovernedAction } from "../contracts/orchestration";

/**
 * Pure predicates shared by transitions, recognition, planning and assurance,
 * so a recommendation or plan can never disagree with what the kernel would
 * allow. Nothing here changes state.
 */

const DAY_MS = 86_400_000;

export const isLive = (a: GovernedAction) => !DEAD_STATES.includes(a.state);

export type Eligibility = { ok: true; key: string } | { ok: false };

/** Re-checked at proposal, submission, approval and execution. Ineligible is a visible gap — never a substitute. */
export function recipientEligible(config: DeploymentConfiguration, typeId: string, facts: Facts): Eligibility {
  const key = actionTypeOf(config, typeId).recipient;
  return facts.unavailable.has(key) ? { ok: false } : { ok: true, key };
}

export function recipientUnavailable(action: GovernedAction, facts: Facts): boolean {
  return action.recipient !== null && facts.unavailable.has(action.recipient);
}

export function isOverdue(config: DeploymentConfiguration, action: GovernedAction, facts: Facts): boolean {
  const e = expectationFor(config, action.typeId);
  if (!e || action.sentAt === null || !["sent", "received"].includes(action.state)) return false;
  return facts.now.getTime() - new Date(action.sentAt).getTime() >= e.days * DAY_MS;
}

/** A sent action whose recipient lost capacity after accepting (acceptance kept) or before accepting. */
export function interruption(
  action: GovernedAction,
  facts: Facts,
): "capacity-lost-after-acceptance" | "unavailable-before-acceptance" | null {
  if (action.sentAt === null || action.heldBack) return null;
  if (action.state === "accepted" && recipientUnavailable(action, facts)) return "capacity-lost-after-acceptance";
  if (action.state === "unresolved" && action.gap?.kind === "recipient_unavailable" && recipientUnavailable(action, facts)) {
    return "unavailable-before-acceptance";
  }
  return null;
}

/**
 * Unmet prerequisites for `typeId`, as `<actionType> <state>` strings.
 *
 * Default (1.1) behaviour: some live action of the prerequisite's type has reached the state. Contract 1.2 adds, per
 * configuration, strict validity for an action type that sets `revalidatePrerequisites`: the prerequisite must be in the
 * same plan version (under `planVersioning`) and its recipient must not have lost capacity since accepting. A renewed
 * check is a new action of the same type (see `propose`); the earlier one stays on record. A prerequisite entry may also
 * require the same recipient and covered fields.
 * `stage` selects the release prerequisites (default) or the approval prerequisites.
 */
export function unmetPrerequisites(
  config: DeploymentConfiguration,
  state: CoordinationState,
  typeId: string,
  candidate?: GovernedAction,
  stage: "approval" | "release" = "release",
): string[] {
  const order = ["accepted", "completed", "confirmed"];
  const type = actionTypeOf(config, typeId);
  const list = stage === "approval" ? (type.approvalPrerequisites ?? []) : type.prerequisites;
  const strict = type.revalidatePrerequisites === true;
  const version = candidate?.planVersion ?? state.planVersion ?? 1;
  return list
    .map((pre) => {
      const live = state.actions.filter((a) => a.typeId === pre.actionType && !a.heldBack && isLive(a));
      let nearMiss: string | null = null;
      const ok = live.some((a) => {
        const reached = a.state === "accepted" ? 0 : a.state === "completed" ? 1 : a.state === "confirmed" ? 2 : -1;
        if (reached < order.indexOf(pre.state)) return false;
        if (config.planVersioning && (a.planVersion ?? 1) !== version) { nearMiss = "it was recorded under an earlier plan version and must be renewed for this one"; return false; }
        if (strict && a.capacityLostAt) { nearMiss = "its recipient lost capacity after accepting, so a renewed check is needed (the earlier record is kept)"; return false; }
        if (candidate && pre.sameRecipient && actionTypeOf(config, a.typeId).recipient !== actionTypeOf(config, candidate.typeId).recipient) { nearMiss = "it was given for a different recipient"; return false; }
        if (candidate && pre.coversFields && !candidate.fields.every((f) => a.fields.some((g) => g.id === f.id && g.value === f.value))) { nearMiss = "it does not cover everything this action would share"; return false; }
        return true;
      });
      if (ok) return null;
      const label = `${actionTypeOf(config, pre.actionType).short} ${pre.state}`;
      return nearMiss ? `${label} (${nearMiss})` : label;
    })
    .filter((x): x is string => x !== null);
}

export function ownerOf(state: CoordinationState): string | null {
  return state.status === "owner_accepted" ? state.owner : null;
}

/** The member currently holding the request: the destination while awaiting acceptance, else the owner. */
export function holderOf(state: CoordinationState): string {
  return state.status === "awaiting_acceptance" ? state.destination : state.owner!;
}
