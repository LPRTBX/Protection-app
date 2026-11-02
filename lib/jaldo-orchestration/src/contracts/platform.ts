/**
 * JALDO OS platform interfaces: the seven engines and exactly which kernel
 * operations and contracts each one owns. Every engine is versioned
 * independently of the others (all start at 1.0.0 with contract 1.0.0) and is
 * industry-neutral. Tests assert that every listed operation is exported, and
 * that every exported kernel operation belongs to exactly one engine — so
 * nothing is orphaned and nothing has two owners.
 *
 * `status` is honest: `implemented` (kernel and tests exist), `partial`
 * (some of the engine's responsibilities are future work, listed in
 * `future`), never "planned" for anything presented as working.
 */

export type EngineId = "moment-intelligence" | "bxos" | "bx-nexus" | "bx-vector" | "bx-comms" | "bx-intelligence" | "bx-grid";

export interface EngineInterface {
  id: EngineId;
  name: string;
  version: string;
  status: "implemented" | "partial";
  responsibility: string;
  /** Exported kernel functions owned by this engine. */
  operations: readonly string[];
  /** Commands (by `Command.type`) this engine's rules govern. */
  commands: readonly string[];
  /** Contract types it defines or owns. */
  contracts: readonly string[];
  /** The existing JALDO Core records it is anchored to through the bridge. */
  coreAnchors: readonly string[];
  /** Responsibilities that are explicitly not built yet. */
  future: readonly string[];
}

export const PLATFORM_INTERFACES: readonly EngineInterface[] = [
  {
    id: "moment-intelligence",
    name: "Moment Intelligence",
    version: "1.0.0",
    status: "implemented",
    responsibility: "Permitted events, recognition, context, provenance and explainable recommendations.",
    operations: ["admitEvent", "eventFingerprint", "classificationRank", "openCoordination", "ingestEvent", "recogniseMoment", "recognise", "activeRecommendation", "syncMoments", "reconcileMoments", "evaluateGuidance", "recommendAction", "fieldsFor"],
    commands: ["dismissRecommendation"],
    contracts: ["EventEnvelope", "MomentRecord", "Recommendation", "Observation", "Recognition", "Classification"],
    coreAnchors: ["core_signals", "core_context_snapshots"],
    future: ["AI-assisted interpretation, only through core_ai_recommendations governance"],
  },
  {
    id: "bxos",
    name: "BXOS",
    version: "1.0.0",
    status: "partial",
    responsibility: "Policy configuration, human authority, permissions, consent and decision records.",
    operations: ["evaluateAuthority", "evaluateExecutionAuthority", "partyMayAct", "grantActive", "approveAction", "isMemberSelf", "actorRecord", "strengthOf"],
    commands: ["acceptRequest", "approve", "refuse", "revokeApproval"],
    contracts: ["Actor", "Grant", "AuthorityDecision", "Operation", "Approval"],
    coreAnchors: ["core_memberships", "core_decisions"],
    future: ["Per-member responsibility grants in Core (gap G2)", "Party channel for subjects and services (gap G5)", "Consent records beyond per-action approval"],
  },
  {
    id: "bx-nexus",
    name: "BX Nexus",
    version: "1.0.0",
    status: "implemented",
    responsibility: "Orchestration plans, dependencies, routing, responsibility and recovery.",
    operations: ["prepareCoordinationPlan", "orchestrateMoment", "runAnticipatoryCycle", "applyCommand", "adoptConfiguration", "recommendRecovery", "recogniseInterruption", "unmetPrerequisites", "holderOf", "ownerOf", "recipientEligible", "isLive"],
    commands: ["routeRequest", "propose", "submit", "withdraw", "recheck"],
    contracts: ["CoordinationState", "GovernedAction", "CoordinationPlan", "PlanStep", "Trigger", "MomentReport", "CommandEnvelope"],
    coreAnchors: ["core_signals (coordination identity)", "core_evidence (checkpoints)"],
    future: ["Atomic single-transaction persistence (gap G3)"],
  },
  {
    id: "bx-vector",
    name: "BX Vector",
    version: "1.0.0",
    status: "partial",
    responsibility: "Permitted execution, idempotency, dispatch uncertainty, completion and confirmation.",
    operations: ["executeAuthorisedAction", "recordAcknowledgement", "recordCompletion", "recordConfirmation", "recordOnlyExecutor", "interruption", "recipientUnavailable", "isOverdue"],
    commands: ["execute", "receive", "accept", "decline", "complete", "confirm", "reconcileDispatch"],
    contracts: ["Executor", "ExecutionResult", "Disclosure", "GapKind"],
    coreAnchors: ["core_actions (commandKey, dispatchOutcome — Core WP3)", "core_action_findings (Core WP5)"],
    future: ["Transactional outbox, retries with backoff, reconciliation jobs, dead-letter handling", "Execution beyond webhooks (gap G4)"],
  },
  {
    id: "bx-comms",
    name: "BX Comms",
    version: "1.0.0",
    status: "partial",
    responsibility: "Governed communications and recipient-specific disclosure.",
    operations: ["recipientView", "subjectView", "holderView", "triggerHolds", "subjectConcerned"],
    commands: ["releaseCommunication"],
    contracts: ["RecipientAction", "SubjectView", "HolderView", "CommunicationIntent"],
    coreAnchors: ["core_evidence (released communications)"],
    future: ["Delivery channels with consent and safe-contact rules", "Role-group broadcasts (one general note to every member of a role)"],
  },
  {
    id: "bx-intelligence",
    name: "BX Intelligence",
    version: "1.0.0",
    status: "partial",
    responsibility: "Evidence, operational learning, evaluated AI recommendations and authorised programme improvement.",
    operations: ["deriveAssuranceState", "followThrough", "measures", "measurePlatformValue"],
    commands: [],
    contracts: ["EvidenceRecord", "EvidenceKind", "EvidenceStrength", "AssuranceState", "Measures", "PlatformValue"],
    coreAnchors: ["core_evidence", "core_outcomes", "core_learnings (not written)", "core_ai_recommendations (unchanged)"],
    future: ["Learning inputs from verified outcomes (gap G7)", "Independent verification of outcomes"],
  },
  {
    id: "bx-grid",
    name: "BX Grid",
    version: "1.0.0",
    status: "partial",
    responsibility: "Versioned deployment configuration, connector selection, installation and upgrade controls.",
    operations: ["loadConfiguration", "actionTypeOf", "partyOf", "subjectOf", "expectationFor", "policyOf", "isSupportedContractMajor"],
    commands: [],
    contracts: ["DeploymentConfiguration", "ActionTypeDefinition", "PartyDefinition", "EventTypeDefinition", "EngineInterface"],
    coreAnchors: ["core_playbook_versions (published configuration)", "core_integrations (connector selection by integrationKey)"],
    future: ["Signed configuration packages", "Installation and upgrade workflow with approval", "Connector catalogue"],
  },
];

export function engineFor(operation: string): EngineInterface | null {
  return PLATFORM_INTERFACES.find((e) => e.operations.includes(operation)) ?? null;
}
