import type { DeploymentConfiguration } from "../contracts/config";
import type { Actor } from "../contracts/authority";
import type { EvidenceRecord } from "../contracts/evidence";
import type { CommandEnvelope, CoordinationState, Facts, RefusalCode } from "../contracts/orchestration";
import { runAnticipatoryCycle } from "./anticipation";
import { deriveAssuranceState, type AssuranceState } from "./assurance";
import { prepareCoordinationPlan, type CoordinationPlan } from "./plan";
import { ownerOf } from "./predicates";
import { recognise, type Recommendation } from "./recognition";
import { applyCommand, ingestEvent, openCoordination } from "./transitions";

/**
 * The One-Moment Orchestrator: the single entry point through which anything
 * that happens reaches JALDO OS.
 *
 * A trigger is a permitted event, a person's command, or a clock tick. The
 * orchestrator applies it through the kernel (where every authority,
 * disclosure and lifecycle rule lives), then lets the configured automation
 * do whatever safe work is now possible, and returns one report: what changed,
 * what JALDO did by itself, what it recognises, what it prepared, who must
 * act next, and what is unresolved.
 *
 * Guarantees, inherited from the kernel and asserted by tests:
 * - no new disclosure without the configured human authority (standing
 *   authority is validated never to disclose request data to a third party);
 * - no invented recipient — an unavailable or missing one is a visible gap;
 * - no fabricated completion — delivery, acceptance, completion and
 *   confirmation are separate records by separate parties, and an uncertain
 *   dispatch is never treated as sent;
 * - no reuse of an invalid approval — stale, revoked or other-recipient
 *   approvals never authorise execution, and recovery always needs fresh
 *   authority;
 * - quiet unless it adds value — a trigger with no effect writes nothing.
 */

export type Trigger =
  | { kind: "event"; event: unknown; actor: Actor; routing?: { destination: string } }
  | { kind: "command"; envelope: CommandEnvelope; actor: Actor }
  | { kind: "tick" };

export interface MomentReport {
  /** True when the trigger was a duplicate (same event key or command id) and changed nothing. */
  duplicate: boolean;
  /** True when nothing was recorded at all. */
  quiet: boolean;
  /** What the kernel did by itself under configured automation, in order. */
  automated: string[];
  /** Moments the holder can act on now (derived; reading records nothing). */
  recognised: Recommendation[];
  plan: CoordinationPlan;
  /** Who must act next, and on what. */
  awaitingHuman: { what: string; who: string }[];
  unresolved: AssuranceState["unresolvedResponsibilities"];
}

export type MomentResult =
  | { ok: true; state: CoordinationState; evidence: EvidenceRecord[]; report: MomentReport }
  | { ok: false; code: RefusalCode; message: string };

export function orchestrateMoment(
  config: DeploymentConfiguration,
  state: CoordinationState | null,
  trigger: Trigger,
  facts: Facts,
  cycleId: string,
): MomentResult {
  let s: CoordinationState;
  const evidence: EvidenceRecord[] = [];
  let duplicate = false;

  if (trigger.kind === "event" && state === null) {
    if (!trigger.routing) return { ok: false, code: "no_eligible_holder", message: "A new request needs an addressed holder. No substitute is chosen." };
    const r = openCoordination(config, trigger.event, trigger.routing, trigger.actor, facts);
    if (!r.ok) return r;
    s = r.state;
    evidence.push(...r.evidence);
  } else {
    if (state === null) return { ok: false, code: "not_found", message: "Not found." };
    s = state;
    if (trigger.kind === "event") {
      const r = ingestEvent(config, s, trigger.event, trigger.actor, facts);
      if (!r.ok) return r;
      duplicate = r.duplicate;
      s = r.state;
      evidence.push(...r.evidence);
    } else if (trigger.kind === "command") {
      const r = applyCommand(config, s, trigger.envelope, trigger.actor, facts);
      if (!r.ok) return r;
      duplicate = r.duplicate;
      s = r.state;
      evidence.push(...r.evidence);
    }
  }

  // A duplicate never triggers further work: the original delivery already did.
  const cycle = duplicate ? null : runAnticipatoryCycle(config, s, facts, cycleId);
  if (cycle) {
    s = cycle.state;
    evidence.push(...cycle.evidence);
  }
  const plan = cycle?.report.plan ?? prepareCoordinationPlan(config, s, facts);
  const assurance = deriveAssuranceState(config, s, evidence, facts);
  return {
    ok: true,
    state: s,
    evidence,
    report: {
      duplicate,
      quiet: evidence.length === 0,
      automated: cycle?.report.automated ?? [],
      recognised: recognise(config, s, facts, ownerOf(s)).active,
      plan,
      awaitingHuman: plan.awaitingHuman,
      unresolved: assurance.unresolvedResponsibilities,
    },
  };
}
