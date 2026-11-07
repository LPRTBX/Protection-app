/**
 * The JALDO OS orchestration contract version.
 *
 * Semantic versioning applies to the *contract*, not to any deployment
 * configuration:
 * - major: a state, command, refusal, authority or projection rule changes
 *   meaning, so a coordination recorded under the old major cannot be
 *   replayed unchanged;
 * - minor: something is added and every existing configuration and record
 *   keeps its meaning;
 * - patch: no observable contract effect.
 *
 * A configuration names the contract major it was reviewed against
 * (`contract: "1"`) and is refused under any other. Every coordination
 * records the full version it was created under.
 */
/**
 * 1.1.0 (ADR-0037 D-2, minor): queued execution — `facts.dispatch = "queue"` makes `execute` queue the
 * action (new state `queued`) and the system command `recordDispatchResult` records the real outcome.
 * Without that fact every 1.0 behaviour is unchanged.
 */
/**
 * 1.2.0 (minor, additive; every rule below is opt-in by configuration, so a 1.1 configuration behaves exactly as before):
 * - plan versions (`planVersioning`) with `revisePlan`, and prerequisites bound to the same plan version, recipient and fields;
 * - approval-time prerequisites (`approvalPrerequisites`) and prerequisite revalidation (`revalidatePrerequisites`,
 *   `withdrawApprovalOnLoss`);
 * - time-sensitive deadlines (`deadlines`) with `rescheduleDeadline` / `cancelDeadline` and the `deadline-passed` rule;
 * - subject responses to completed work (`responses`) with owned follow-up (`closeFollowUp`), separate from delivery evidence;
 * - linked work (`linkKinds`): informational links and required dependencies that block named transitions.
 */
export const JALDO_ORCHESTRATION_CONTRACT_VERSION = "1.2.0";

export const JALDO_ORCHESTRATION_CONTRACT_MAJOR = JALDO_ORCHESTRATION_CONTRACT_VERSION.split(".")[0];

export function isSupportedContractMajor(major: string): boolean {
  return major === JALDO_ORCHESTRATION_CONTRACT_MAJOR;
}
