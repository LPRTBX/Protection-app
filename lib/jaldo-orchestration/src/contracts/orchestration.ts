import type { ActorRecord, Scope } from "./authority";
import type { EvidenceRecord } from "./evidence";
import type { MomentRecord } from "./events";

/**
 * Orchestration contracts: the coordination (one request and its plan of
 * independently authorised actions), each action's lifecycle, and the
 * commands that move it. Every record is plain JSON so JALDO Core can persist
 * it unchanged and replay it through the same pure functions.
 *
 * Lifecycle distinctions the kernel never collapses:
 * recognised ≠ approved · recommended ≠ authorised · prepared ≠ sent ·
 * sent ≠ received · received ≠ accepted · accepted ≠ completed ·
 * completed ≠ independently verified · confirmed ≠ proof that anyone is safe.
 */

export const ACTION_STATES = [
  "proposed",
  "awaiting_approval",
  "approved",
  /** Contract 1.1: approved, envelope frozen, dispatch intent committed — NOT sent. */
  "queued",
  "sent",
  "received",
  "accepted",
  "completed",
  "confirmed",
  "withdrawn",
  "not_approved",
  "declined",
  "unresolved",
] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const DEAD_STATES: readonly ActionState[] = ["withdrawn", "not_approved"];
export const CLOSED_STATES: readonly ActionState[] = ["confirmed", "declined", "withdrawn", "not_approved"];

export interface FrozenField {
  id: string;
  label: string;
  value: string;
}

/** Exactly what was disclosed to whom, why and on what authority — frozen at execution. */
export interface Disclosure {
  recipient: string;
  recipientLabel: string;
  purpose: string;
  authority: string;
  policy: { id: string; version: string };
  fields: FrozenField[];
  withheld: string[];
  at: string;
}

export interface Approval {
  by: ActorRecord;
  attested: boolean;
  /** `person` for a human approval; `standing-policy` when configured policy authorised it. */
  basis: "person" | "standing-policy";
  /** The configuration version the approval was given under; a different version makes it stale. */
  configVersion: string;
  at: string;
}

/**
 * `dispatch_uncertain`: an attempt may or may not have reached the recipient
 * (e.g. a timeout after sending). Never retried and never treated as sent
 * until a person records a reconciliation finding with evidence.
 */
export type GapKind = "no_recipient" | "recipient_unavailable" | "execution_failed" | "dispatch_uncertain";

export interface GovernedAction {
  id: string;
  typeId: string;
  state: ActionState;
  createdAt: string;
  /** Who prepared it: the holder, or the kernel under configured automation. */
  preparedBy: ActorRecord;
  fields: FrozenField[];
  recipient: string | null;
  gap: { kind: GapKind; at: string } | null;
  submitted: boolean;
  approval: Approval | null;
  disclosure: Disclosure | null;
  /** Execution attempts, each with its own idempotency key. */
  /** `queued` (contract 1.1) marks an attempt committed for dispatch whose outcome is not yet recorded. */
  attempts: { key: string; at: string; result: "queued" | "delivered" | "failed" | "uncertain"; reason: string | null; reference: string | null }[];
  sentAt: string | null;
  /** Historical acceptance. Never rewritten by a later capacity change. */
  acceptedAt: string | null;
  acceptedBy: { by: ActorRecord; attested: boolean } | null;
  noReask: boolean;
  declineReason: string | null;
  outcome: string | null;
  completedAt: string | null;
  confirmedBy: { by: ActorRecord; attested: boolean } | null;
  withdrawal: { at: string; reason: "holder" | "transfer" | "approval_revoked" | "plan_revised" } | null;
  heldBack: boolean;
  origin: string | null;
  recovers: string | null;
  /** Contract 1.2, only under `planVersioning`: the plan version this action belongs to. */
  planVersion?: number;
  /** Contract 1.2, only under `revalidatePrerequisites`: set when the recipient lost capacity after accepting. Never cleared: a renewed check is a new action. */
  capacityLostAt?: string;
  /** Contract 1.2: the subject's own reports on completed work, oldest first. Never alters any delivery field. */
  responses?: ResponseRecord[];
}

export interface ResponseRecord {
  responseId: string;
  effect: "satisfied" | "unsatisfied" | "deferred";
  at: string;
  by: ActorRecord;
  /** True when the subject's report replaced an earlier one (both are kept). */
  supersedes: boolean;
}

/** A deadline instance. `dueAt` is an absolute UTC instant; expiry is `now >= dueAt`. */
export interface DeadlineRecord {
  id: string;
  defId: string;
  subject: { kind: "action"; actionId: string } | { kind: "follow-up"; followUpId: string };
  setAt: string;
  dueAt: string;
  status: "open" | "met" | "cancelled";
  closedAt: string | null;
  /** On `met`: whether it was met at or after `dueAt`. */
  late: boolean | null;
  history: { at: string; kind: "set" | "rescheduled" | "met" | "cancelled"; from: string | null; to: string | null; reasonId: string | null }[];
}

/** The review obligation a subject's "unsatisfied" report opens. Owned by whoever holds the request. */
export interface FollowUpRecord {
  id: string;
  actionId: string;
  responseId: string;
  openedAt: string;
  openedOwner: string | null;
  status: "open" | "closed";
  closedAt: string | null;
  outcomeId: string | null;
}

/** Work that exists independently of this coordination, tracked by an opaque reference. */
export interface LinkRecord {
  id: string;
  kindId: string;
  reference: string;
  status: "open" | "resolved" | "unknown";
  openedAt: string;
  updatedAt: string;
  updatedBy: ActorRecord;
  withdrawn: boolean;
}

export interface CoordinationState {
  contractVersion: string;
  scope: Scope;
  config: { id: string; version: string };
  /** The subject's permitted request fields, frozen when the coordination opened. */
  request: FrozenField[];
  status: "awaiting_acceptance" | "owner_accepted";
  destination: string;
  owner: string | null;
  routedFrom: string[];
  actions: GovernedAction[];
  moments: MomentRecord[];
  released: { templateId: string; actionId: string; at: string }[];
  /** `<idempotencyKey>=<content fingerprint>` of events already applied; a reused key with different content is refused. */
  processedEvents: string[];
  processedCommands: string[];
  /** Number of evidence records written so far. */
  sequence: number;
  /** Contract 1.2, only under `planVersioning`. */
  planVersion?: number;
  /** Contract 1.2, only for configurations that define `deadlines`. */
  deadlines?: DeadlineRecord[];
  /** Contract 1.2: obligations opened by an "unsatisfied" subject response. */
  followUps?: FollowUpRecord[];
  /** Contract 1.2, only for configurations that define `linkKinds`. */
  links?: LinkRecord[];
}

/** Contract 1.1: the outcome of a queued attempt, as recorded by the host's dispatcher. */
export type DispatchResult = ExecutionResult | { status: "cancelled"; reason: string };

/** Outcome of one execution attempt, reported by an injected executor. */
export type ExecutionResult =
  | { status: "delivered"; reference: string | null }
  /** Known not to have been delivered (e.g. refused before sending). */
  | { status: "failed"; reason: string; retryable: boolean }
  /** Outcome unknown (e.g. timeout after sending). The disclosure may have happened. */
  | { status: "uncertain"; reason: string };

/**
 * The execution port. Implementations must be idempotent per `key`: the same
 * key must never cause a second delivery. The default records the
 * disclosure and delivers nothing (simulation).
 */
export type Executor = (request: {
  key: string;
  actionId: string;
  actionType: string;
  recipient: string;
  disclosure: Disclosure;
}) => ExecutionResult;

/** Facts from outside the coordination that the kernel reads but never owns. */
export interface Facts {
  now: Date;
  /** Party keys currently recorded as unable to act. */
  unavailable: ReadonlySet<string>;
  /** Members currently eligible to hold this request (active, authorised, not conflicted). */
  eligibleHolders?: readonly string[];
  executor?: Executor;
  /**
   * Contract 1.1: `"queue"` — the host commits a durable dispatch intent instead of executing inline.
   * `execute` then moves the action to `queued`; the outcome arrives later via `recordDispatchResult`.
   */
  dispatch?: "inline" | "queue";
}

export type FourChecks = { recipient: boolean; purpose: boolean; fields: boolean; authority: boolean };

export type Command =
  | { type: "acceptRequest"; checks: { authority: boolean; noConflict: boolean; capacity: boolean } }
  | { type: "routeRequest"; to: string; checks: FourChecks }
  | { type: "propose"; actionType: string; fromRecommendation?: string }
  | { type: "dismissRecommendation"; recommendationId: string }
  | { type: "submit"; actionId: string }
  | { type: "withdraw"; actionId: string }
  | { type: "approve"; actionId: string; checks: FourChecks }
  | { type: "refuse"; actionId: string }
  | { type: "revokeApproval"; actionId: string }
  | { type: "execute"; actionId: string }
  | { type: "receive"; actionId: string }
  | { type: "accept"; actionId: string; checks: { scope: boolean; conflict: boolean; capacity: boolean }; noReask?: boolean }
  | { type: "decline"; actionId: string; reasonId: string }
  | { type: "complete"; actionId: string; outcomeId?: string }
  | { type: "confirm"; actionId: string }
  | { type: "recheck"; actionId: string }
  /**
   * Contract 1.1, system only: the recorded outcome of a queued attempt. `cancelled` means it was never
   * sent (authority, channel or state changed before dispatch): the action returns to `approved`.
   */
  | { type: "recordDispatchResult"; actionId: string; key: string; result: DispatchResult }
  | { type: "releaseCommunication"; templateId: string; actionId: string }
  /** Contract 1.2. A material change: unsent work of the old version is withdrawn and approvals do not carry over. */
  | { type: "revisePlan"; reasonId: string }
  /** Contract 1.2. The subject's own report on completed work, by configured response id. */
  | { type: "recordResponse"; actionId: string; responseId: string }
  | { type: "closeFollowUp"; followUpId: string; outcomeId: string }
  /** Contract 1.2. `dueAt` is an absolute UTC instant (ISO 8601 with `Z`) strictly after now. */
  | { type: "rescheduleDeadline"; deadlineId: string; dueAt: string; reasonId: string }
  | { type: "cancelDeadline"; deadlineId: string; reasonId: string }
  | { type: "linkWork"; kindId: string; reference: string; status: "open" | "unknown" }
  | { type: "recordLinkStatus"; linkId: string; status: "open" | "resolved" }
  | { type: "withdrawLink"; linkId: string }
  /** A person records, with an evidence reference, whether an uncertain dispatch was delivered. */
  | {
      type: "reconcileDispatch";
      actionId: string;
      finding: "verified_delivered" | "verified_not_delivered";
      /** An identifier in the receiving system (not a link). */
      evidenceReference: string;
      /**
       * The reconciler's own account of what the evidence shows (10–2000
       * characters). Required, never copied into kernel evidence (which is
       * immutable); an adapter passes it to a redactable store.
       */
      account: string;
      /**
       * Where the authority comes from (Stage 6A decision D4):
       * - `purpose-grant`: a member holding the purpose-scoped
       *   `reconcile-execution` responsibility who is NOT the request holder;
       * - `core-finding`: an organisation owner's Core action finding already
       *   recorded under ADR-0034 by the adapter. Never accepted from a client.
       */
      basis: { kind: "purpose-grant" } | { kind: "core-finding"; findingId: string };
    };

export const COMMAND_TYPES: readonly Command["type"][] = [
  "acceptRequest", "routeRequest", "propose", "dismissRecommendation", "submit", "withdraw", "approve",
  "refuse", "revokeApproval", "execute", "receive", "accept", "decline", "complete", "confirm", "recheck",
  "releaseCommunication", "reconcileDispatch",
  "revisePlan", "recordResponse", "closeFollowUp", "rescheduleDeadline", "cancelDeadline", "linkWork", "recordLinkStatus", "withdrawLink",
];

/** A command with its own identity, so a duplicate delivery has no second effect. */
export interface CommandEnvelope {
  id: string;
  command: Command;
  /** Optimistic concurrency: refused if the coordination has moved on. */
  expectedSequence?: number;
}

export type RefusalCode =
  | "not_found"
  | "not_permitted"
  | "invalid_state"
  | "checks_required"
  | "already_open"
  | "not_recommended"
  | "reason_required"
  | "no_eligible_holder"
  | "dependency_unmet"
  | "stale_authority"
  | "stale_sequence"
  | "configuration_mismatch"
  | "event_not_permitted"
  | "idempotency_conflict";

export type TransitionResult =
  | { ok: true; duplicate: boolean; state: CoordinationState; evidence: EvidenceRecord[] }
  | { ok: false; code: RefusalCode; message: string };
