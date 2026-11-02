/**
 * Governance and authority contracts.
 *
 * Authority is evaluated deny-by-default from an explicit actor context: who
 * the actor is, their Core role, their responsibilities in this deployment
 * (each a time-bound, revocable grant), and the organisation and deployment
 * they are scoped to. Nothing is implied by seniority, relationship, a link
 * or a role name alone, and there is no universal supervisor access.
 */

/** Kernel operations a deployment role may be granted. */
export const OPERATIONS = [
  "hold-request",
  "route-request",
  "prepare",
  "approve",
  "execute",
  "record-party-response",
  "record-capacity",
  "release-communication",
  "adopt-configuration",
  "view-holder",
  /** Purpose-scoped: record whether an uncertain dispatch was delivered, with evidence. Never implied by holding a request. */
  "reconcile-execution",
] as const;
export type Operation = (typeof OPERATIONS)[number];

/** Operations that change state; a read-only Core role may never perform them. */
export const WRITE_OPERATIONS: readonly Operation[] = OPERATIONS.filter((o) => o !== "view-holder");

export interface Scope {
  organisationId: string;
  deploymentId: string;
}

/** A responsibility grant. Expiry and revocation are evaluated on every use. */
export interface Grant {
  responsibility: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type CoreRole = "owner" | "operator" | "reviewer";

export type Actor =
  /** An authenticated JALDO Core member (Clerk identity + active `core_memberships` row, resolved server-side). */
  | { kind: "member"; id: string; coreRole: CoreRole; scope: Scope; grants: Grant[]; onBehalfOf?: string }
  /** A configured party acting through its own authenticated channel (Stage 6B on the server). */
  | { kind: "party"; key: string; scope: Scope; revokedAt?: string | null }
  /** The kernel itself, performing only configured, non-disclosing automation. */
  | { kind: "system"; scope: Scope };

export interface ActorRecord {
  kind: "member" | "party" | "system";
  id: string;
  onBehalfOf: string | null;
}

export type AuthorityOutcome = "allowed" | "denied" | "human_review_required";

export interface AuthorityDecision {
  outcome: AuthorityOutcome;
  /** Plain reasons; safe to show the actor. Never names another record. */
  reasons: string[];
  /** Who must still approve, when the outcome is `human_review_required`. */
  requiredApprovals: string[];
  /** The responsibility and policy versions the decision rests on, when allowed. */
  basis: { responsibility: string | null; configVersion: string; policyVersions: string[] } | null;
}
