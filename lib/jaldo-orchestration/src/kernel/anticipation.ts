import type { DeploymentConfiguration } from "../contracts/config";
import type { Actor } from "../contracts/authority";
import type { EvidenceRecord } from "../contracts/evidence";
import type { CoordinationState, Facts } from "../contracts/orchestration";
import { prepareCoordinationPlan, type CoordinationPlan } from "./plan";
import { ownerOf, unmetPrerequisites } from "./predicates";
import { applyCommand, reconcileMoments } from "./transitions";

/**
 * Anticipatory operation: JALDO completes permitted coordination work before
 * anyone has to work out what must be done, and stops at every authority
 * boundary.
 *
 * In one cycle the kernel, acting as `system` and only within the
 * configuration's `automation.operations`:
 * - reconciles status: records moments that became true because time passed
 *   (`reconcile-status`) — recognition only, nothing is decided;
 * - prepares the configured plan steps as proposals (`prepare-plan`) — a
 *   proposal discloses nothing;
 * - puts each prepared step forward: steps with standing authority become
 *   authorised by policy, all others wait for the configured human approver;
 * - executes standing-authority steps whose prerequisites are met
 *   (`execute-standing-authority`, `check-dependencies`) — these never
 *   disclose request details to anyone but the person;
 * - leaves everything else — approvals, consent, acceptance, confirmation,
 *   recovery adoption, communication release, dismissal — to people.
 *
 * Quiet unless it adds value: a cycle with nothing to do writes nothing and
 * reports `quiet: true`. It creates no alert or notification of its own.
 */

export interface CycleReport {
  quiet: boolean;
  automated: string[];
  plan: CoordinationPlan;
}

export function runAnticipatoryCycle(
  config: DeploymentConfiguration,
  state: CoordinationState,
  facts: Facts,
  cycleId: string,
): { state: CoordinationState; evidence: EvidenceRecord[]; report: CycleReport } {
  const system: Actor = { kind: "system", scope: state.scope };
  const auto = new Set(config.automation.operations);
  let s = state;
  const evidence: EvidenceRecord[] = [];
  const automated: string[] = [];
  let n = 0;
  const run = (command: Parameters<typeof applyCommand>[2]["command"], note: string) => {
    const r = applyCommand(config, s, { id: `${cycleId}:${++n}`, command }, system, facts);
    if (r.ok && !r.duplicate) {
      s = r.state;
      evidence.push(...r.evidence);
      automated.push(note);
      return true;
    }
    return false;
  };

  if (auto.has("reconcile-status")) {
    const r = reconcileMoments(config, s, facts);
    if (r.ok && r.evidence.length > 0) {
      s = r.state;
      evidence.push(...r.evidence);
      automated.push(`Recorded ${r.evidence.length} newly recognised moment(s)`);
    }
  }
  if (ownerOf(s) !== null) {
    if (auto.has("prepare-plan")) {
      for (const typeId of config.recognition.plan) {
        const live = s.actions.some((a) => a.typeId === typeId && !a.heldBack && !["withdrawn", "not_approved"].includes(a.state));
        const once = s.actions.some((a) => a.typeId === typeId && !a.heldBack); // never re-prepare work a person withdrew or refused
        if (!live && !once) run({ type: "propose", actionType: typeId }, `Prepared ${typeId}`);
      }
      for (const a of s.actions.filter((x) => x.state === "proposed" && x.preparedBy.kind === "system" && !x.heldBack)) {
        run({ type: "submit", actionId: a.id }, `Put ${a.id} forward for its configured authority`);
      }
    }
    if (auto.has("execute-standing-authority") && auto.has("check-dependencies")) {
      for (const a of s.actions.filter((x) => x.state === "approved" && x.approval?.basis === "standing-policy" && !x.heldBack)) {
        if (unmetPrerequisites(config, s, a.typeId).length === 0) run({ type: "execute", actionId: a.id }, `Executed ${a.id} under standing policy`);
      }
    }
  }
  const plan = prepareCoordinationPlan(config, s, facts);
  return { state: s, evidence, report: { quiet: automated.length === 0, automated, plan } };
}
