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

/** Unmet prerequisites for executing `action`, as `<actionType> <state>` strings. */
export function unmetPrerequisites(config: DeploymentConfiguration, state: CoordinationState, typeId: string): string[] {
  const order = ["accepted", "completed", "confirmed"];
  return actionTypeOf(config, typeId)
    .prerequisites.filter((pre) => {
      const live = state.actions.filter((a) => a.typeId === pre.actionType && !a.heldBack && isLive(a));
      return !live.some((a) => {
        const reached = a.state === "accepted" ? 0 : a.state === "completed" ? 1 : a.state === "confirmed" ? 2 : -1;
        return reached >= order.indexOf(pre.state);
      });
    })
    .map((pre) => `${actionTypeOf(config, pre.actionType).short} ${pre.state}`);
}

export function ownerOf(state: CoordinationState): string | null {
  return state.status === "owner_accepted" ? state.owner : null;
}

/** The member currently holding the request: the destination while awaiting acceptance, else the owner. */
export function holderOf(state: CoordinationState): string {
  return state.status === "awaiting_acceptance" ? state.destination : state.owner!;
}
