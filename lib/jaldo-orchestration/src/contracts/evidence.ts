import type { ActorRecord } from "./authority";

/**
 * Evidence records. Every kernel transition writes typed, append-only
 * evidence with an explicit audience, provenance and a strength label.
 * Evidence is what was recorded — it is not an access log, and a
 * confirmation is a person's record, not proof that anyone is safe.
 */

export const EVIDENCE_KINDS = [
  "event.recorded",
  "moment.recognised",
  "request.opened",
  "request.accepted",
  "request.routed",
  "action.proposed",
  "action.submitted",
  "action.withdrawn",
  "action.rechecked",
  "approval.recorded",
  "approval.refused",
  "approval.revoked",
  "authority.stale",
  "configuration.adopted",
  "disclosure.made",
  "execution.attempted",
  "execution.failed",
  "execution.uncertain",
  "dispatch.reconciled",
  "receipt.recorded",
  "acceptance.recorded",
  "decline.recorded",
  "completion.recorded",
  "confirmation.recorded",
  "responsibility.unresolved",
  "capacity.lost",
  "recommendation.dismissed",
  "recovery.proposed",
  "communication.released",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * How strong a record is, stated plainly:
 * - `system-recorded`: the kernel recorded a state change it made itself;
 * - `actor-recorded`: an authenticated member recorded their own act;
 * - `party-recorded`: a party recorded its own act through its own channel;
 * - `attested`: a member recorded a party's act on the party's behalf;
 * - `standing-policy`: authorised by configured standing policy, not a person.
 * None of these is independent verification.
 */
export const EVIDENCE_STRENGTHS = ["system-recorded", "actor-recorded", "party-recorded", "attested", "standing-policy"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export interface EvidenceRecord {
  /** Consecutive per coordination, from 1. */
  sequence: number;
  kind: EvidenceKind;
  actionId: string | null;
  /** `holder` or `party:<key>`. Nobody not named sees the record. */
  audience: string[];
  text: string;
  /** What a recipient is shown instead of `text`: no internal reference to anything else. */
  recipientText: string | null;
  actor: ActorRecord | null;
  strength: EvidenceStrength;
  provenance: {
    contractVersion: string;
    configId: string;
    configVersion: string;
    command: string | null;
    commandId: string | null;
    eventId: string | null;
  };
  at: string;
}
