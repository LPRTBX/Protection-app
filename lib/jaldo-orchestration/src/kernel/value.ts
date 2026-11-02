import type { EvidenceKind, EvidenceRecord } from "../contracts/evidence";
import type { CoordinationState } from "../contracts/orchestration";

/**
 * Evidence of platform value — a measurement contract that keeps four kinds
 * of number apart and never invents one:
 *
 * 1. `measured` — counted or timed from recorded evidence and timestamps.
 * 2. `recorded-confirmation` — a party's own recorded confirmation.
 * 3. `self-reported` — a statement by a recipient or person; not verified.
 * 4. `forecast` — derived from a baseline; labelled by the baseline's own
 *    status, and `not-measurable` when no defensible baseline is supplied.
 *
 * There is deliberately no field for cost savings, prevented harm or risk
 * reduction: nothing recorded here can support those claims.
 */

const HUMAN_DECISIONS: readonly EvidenceKind[] = [
  "request.accepted",
  "request.routed",
  "approval.recorded",
  "approval.refused",
  "approval.revoked",
  "recommendation.dismissed",
  "dispatch.reconciled",
  "configuration.adopted",
  "communication.released",
];
const COORDINATION_STEPS: readonly EvidenceKind[] = ["action.proposed", "action.submitted", "approval.recorded", "execution.attempted", "disclosure.made"];
const FAILED_HANDOVERS: readonly EvidenceKind[] = ["decline.recorded", "execution.failed", "execution.uncertain", "capacity.lost"];

export interface Baseline {
  /** Where the number comes from (study, time-and-motion record, operator system export). */
  source: string;
  /** `measured`: observed in this organisation's own process. `assumed`: anything else. */
  status: "measured" | "assumed";
  /** Manual coordination steps a person performed per coordination before JALDO. */
  manualStepsPerCoordination: number;
  /** Minutes per manual coordination step, if it was measured. */
  minutesPerManualStep?: number;
}

type Duration = { actionId: string; ms: number; open: boolean };

export interface PlatformValue {
  measured: {
    basis: "measured";
    coordinationStepsAutomatic: number;
    coordinationStepsByPeople: number;
    humanDecisionsRequired: number;
    timeToAcceptance: Duration[];
    timeToConfirmedCompletion: Duration[];
    unresolvedResponsibilityDuration: Duration[];
    failedHandovers: number;
    recoveriesProposed: number;
    recoveriesDelivered: number;
  };
  recordedConfirmations: { basis: "recorded-confirmation"; count: number };
  selfReported: { basis: "self-reported"; recipientNoReask: number; note: "not independently verified" };
  forecast:
    | { basis: "not-measurable"; reason: string }
    | {
        basis: "estimate-against-measured-baseline" | "synthetic-forecast";
        baselineSource: string;
        humanCoordinationActionsAvoided: number;
        /** Only when the baseline itself measured minutes per step; otherwise null. Never money. */
        minutesReturned: number | null;
      };
}

const ms = (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime();

export function measurePlatformValue(state: CoordinationState, evidence: readonly EvidenceRecord[], now: Date, baseline?: Baseline): PlatformValue {
  const own = state.actions.filter((a) => !a.heldBack);
  const auto = (e: EvidenceRecord) => e.strength === "system-recorded" || e.strength === "standing-policy";
  const steps = evidence.filter((e) => COORDINATION_STEPS.includes(e.kind));
  const firstEvidence = (actionId: string, kinds: readonly EvidenceKind[]) => evidence.find((e) => e.actionId === actionId && kinds.includes(e.kind));

  const timeToAcceptance = own.filter((a) => a.sentAt && a.acceptedAt).map((a) => ({ actionId: a.id, ms: ms(a.sentAt!, a.acceptedAt!), open: false }));
  const timeToConfirmedCompletion = own
    .filter((a) => a.sentAt && a.state === "confirmed")
    .map((a) => ({ actionId: a.id, ms: ms(a.sentAt!, firstEvidence(a.id, ["confirmation.recorded"])?.at ?? now.toISOString()), open: false }));
  const unresolvedResponsibilityDuration = own.flatMap((a) => {
    const start = firstEvidence(a.id, ["responsibility.unresolved", "capacity.lost"]);
    if (!start) return [];
    const recovery = own.find((b) => b.recovers === a.id && b.sentAt !== null);
    const reconciled = firstEvidence(a.id, ["dispatch.reconciled", "action.rechecked"]);
    const end = recovery?.sentAt ?? reconciled?.at ?? null;
    return [{ actionId: a.id, ms: ms(start.at, end ?? now.toISOString()), open: end === null }];
  });
  const byPeople = steps.filter((e) => !auto(e)).length;

  let forecast: PlatformValue["forecast"];
  if (!baseline || !baseline.source.trim() || baseline.manualStepsPerCoordination <= 0) {
    forecast = { basis: "not-measurable", reason: "No defensible baseline was supplied, so nothing can be said about actions avoided or time returned." };
  } else {
    const avoided = Math.max(0, baseline.manualStepsPerCoordination - byPeople);
    forecast = {
      basis: baseline.status === "measured" ? "estimate-against-measured-baseline" : "synthetic-forecast",
      baselineSource: baseline.source,
      humanCoordinationActionsAvoided: avoided,
      minutesReturned: baseline.status === "measured" && baseline.minutesPerManualStep !== undefined ? avoided * baseline.minutesPerManualStep : null,
    };
  }

  return {
    measured: {
      basis: "measured",
      coordinationStepsAutomatic: steps.filter(auto).length,
      coordinationStepsByPeople: byPeople,
      humanDecisionsRequired: evidence.filter((e) => HUMAN_DECISIONS.includes(e.kind) && !auto(e)).length,
      timeToAcceptance,
      timeToConfirmedCompletion,
      unresolvedResponsibilityDuration,
      failedHandovers: evidence.filter((e) => FAILED_HANDOVERS.includes(e.kind)).length,
      recoveriesProposed: own.filter((a) => a.recovers !== null).length,
      recoveriesDelivered: own.filter((a) => a.recovers !== null && a.sentAt !== null).length,
    },
    recordedConfirmations: { basis: "recorded-confirmation", count: own.filter((a) => a.state === "confirmed").length },
    selfReported: { basis: "self-reported", recipientNoReask: own.filter((a) => a.noReask && a.acceptedAt !== null).length, note: "not independently verified" },
    forecast,
  };
}
