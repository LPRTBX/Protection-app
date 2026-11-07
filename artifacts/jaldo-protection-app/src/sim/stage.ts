import type { GovernedAction } from "@workspace/jaldo-orchestration";

/**
 * The lifecycle words people see. This is a READ-ONLY NAMING of kernel facts, not a state machine: it adds no state, no
 * transition and no rule, and it is derived on every read from the kernel's action record.
 *
 *   proposed      a person has not yet authorised it (kernel: proposed, awaiting_approval)
 *   approved      a named person authorised it; nothing has been sent (kernel: approved, no attempt yet)
 *   waiting       approved, and held by a prerequisite the kernel has not seen met. NOT a durable queue
 *   retry         approved; an attempt failed and was recorded; a retry is available. Nothing is recorded as sent. NOT a queue
 *   sent          recorded as delivered to the other system. Sending is not receipt
 *   acknowledged  the other system received it ("received") or accepted responsibility ("accepted"). Neither is completion
 *   applied       the other system REPORTS it done. A report is not a check
 *   confirmed     a simulated read-back recorded in this demo matched, and a named person recorded the confirmation
 *   unresolved    a gap a person must decide on (kernel: unresolved, declined, or accepted-then-interrupted)
 *
 * A queued action remains in the approved track position: its dispatch is committed, but delivery is not recorded.
 * Confirmed is not proof of wellbeing, reduced harm or operator compliance.
 */
export const STAGES = ["proposed", "approved", "waiting", "retry", "sent", "acknowledged", "applied", "confirmed", "unresolved"] as const;
export type Stage = (typeof STAGES)[number] | "closed";

export interface StageView {
  stage: Stage;
  /** The words shown to people. */
  label: string;
  /** One plain sentence on what is and is not known. */
  detail: string;
  /** Marks every case where something is authorised or sent but not accepted. */
  notYetAccepted: boolean;
}

export const STAGE_LABEL: Record<Stage, string> = {
  proposed: "Proposed",
  approved: "Approved",
  waiting: "Approved — waiting for prerequisite",
  retry: "Retry available — not sent",
  sent: "Sent",
  acknowledged: "Acknowledged",
  applied: "Applied — reported by the system",
  confirmed: "Confirmed — simulated read-back",
  unresolved: "Unresolved",
  closed: "Closed",
};

/** The six positions on the lifecycle track. `waiting` and `retry` sit at Approved: nothing has been sent. */
export const TRACK = ["proposed", "approved", "sent", "acknowledged", "applied", "confirmed"] as const;
export type TrackStage = (typeof TRACK)[number];
export const TRACK_LABEL: Record<TrackStage, string> = {
  proposed: "Proposed",
  approved: "Approved",
  sent: "Sent",
  acknowledged: "Received / accepted",
  applied: "Applied (reported)",
  confirmed: "Confirmed (simulated read-back)",
};
export const trackSlot = (s: Stage): TrackStage | null => (s === "waiting" || s === "retry" ? "approved" : (TRACK as readonly string[]).includes(s) ? (s as TrackStage) : null);

export function stageOf(a: GovernedAction, ctx: { waitingFor: readonly string[]; recipientUnavailable: boolean; maxAttempts: number }): StageView {
  const mk = (stage: Stage, detail: string, notYetAccepted = false, label?: string): StageView => ({ stage, label: label ?? STAGE_LABEL[stage], detail, notYetAccepted });
  switch (a.state) {
    case "proposed":
      return mk("proposed", "Prepared for a person to review. Nothing is approved or sent.");
    case "awaiting_approval":
      return mk("proposed", "Waiting for a named person to approve it. Nothing is sent.");
    case "approved": {
      if (ctx.waitingFor.length > 0) return mk("waiting", `Approved, and not sent. It cannot be sent until: ${ctx.waitingFor.join("; ")}.`);
      if (a.attempts.length > 0) return mk("retry", `Approved. Attempt ${a.attempts.length} of ${ctx.maxAttempts} did not go through, so another attempt is available. Nothing is recorded as sent.`);
      return mk("approved", "A named person authorised it. It has not been sent.");
    }
    case "queued":
      return mk("approved", "Approved and queued for dispatch. The dispatch outcome has not been recorded; nothing is recorded as sent.", false, "Approved — dispatch pending");
    case "sent":
      return mk("sent", "Recorded as delivered. The other system has not said it received it.", true);
    case "received":
      return mk("acknowledged", "The other system RECEIVED it. It has not accepted responsibility.", true, "Acknowledged — received");
    case "accepted":
      return ctx.recipientUnavailable
        ? mk("unresolved", "Accepted, but the system can no longer act. The acceptance is kept as recorded; the need is open.")
        : mk("acknowledged", "The other system ACCEPTED responsibility. It has not reported the work done.", false, "Acknowledged — accepted");
    case "completed":
      return mk("applied", "The system reports it done. That is a report, not a check. Not confirmed.");
    case "confirmed":
      return mk("confirmed", "A simulated read-back recorded in this demo matched, and a named person recorded it. Not proof of wellbeing, reduced harm or operator compliance.");
    case "unresolved":
      return mk(
        "unresolved",
        a.gap?.kind === "dispatch_uncertain"
          ? "The outcome of a send is unknown. It may have arrived. It is not retried until a person reconciles it."
          : a.gap?.kind === "execution_failed"
            ? "Every permitted attempt failed. A person decides what happens next."
            : "No system can act on this. A person decides what happens next.",
      );
    case "declined":
      return mk("unresolved", "The other system declined it. A person decides what happens next.");
    case "withdrawn":
      return { stage: "closed", label: "Withdrawn", detail: "A person withdrew it before anything was sent.", notYetAccepted: false };
    case "not_approved":
      return { stage: "closed", label: "Not approved", detail: "A person decided not to approve it. Nothing was sent.", notYetAccepted: false };
  }
}

/** The furthest lifecycle position an action has reached, from what the kernel recorded. Used only to draw the track. */
export function reachedStage(a: GovernedAction): TrackStage {
  if (a.confirmedBy) return "confirmed";
  if (a.completedAt) return "applied";
  if (a.acceptedAt || a.state === "received") return "acknowledged";
  if (a.sentAt) return "sent";
  if (a.approval) return "approved";
  return "proposed";
}
