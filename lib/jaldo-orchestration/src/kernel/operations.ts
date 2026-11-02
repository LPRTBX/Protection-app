import type { DeploymentConfiguration } from "../contracts/config";
import type { Actor } from "../contracts/authority";
import type { CoordinationState, Facts, FourChecks, TransitionResult } from "../contracts/orchestration";
import { ownerOf } from "./predicates";
import { recognise, type Recommendation } from "./recognition";
import { applyCommand } from "./transitions";

/**
 * Named domain operations of the loop
 * Recognise → Interpret → Recommend → Authorise → Coordinate → Execute →
 * Communicate → Evidence → Assure → Learn.
 *
 * Each is a thin, typed entry point over the single transition function
 * (`applyCommand`), so there is exactly one place where authority, state and
 * evidence rules live. The remaining operations — `evaluateAuthority`,
 * `evaluateGuidance`, `recommendAction`, `prepareCoordinationPlan`,
 * `recogniseInterruption`, `recommendRecovery`, `deriveAssuranceState` — are
 * exported directly from their modules.
 */

/** Recognise: the open moments the permitted facts support now (derived; reading records nothing). */
export function recogniseMoment(config: DeploymentConfiguration, state: CoordinationState, facts: Facts): Recommendation[] {
  return recognise(config, state, facts, ownerOf(state)).active;
}

/** Authorise: a person (holder, or the subject through their own channel) approves one action after four checks. */
export function approveAction(config: DeploymentConfiguration, state: CoordinationState, commandId: string, actionId: string, checks: FourChecks, actor: Actor, facts: Facts): TransitionResult {
  return applyCommand(config, state, { id: commandId, command: { type: "approve", actionId, checks } }, actor, facts);
}

/** Execute: authority, approval, prerequisites and recipient re-checked now; then one idempotent attempt through the executor port. */
export function executeAuthorisedAction(config: DeploymentConfiguration, state: CoordinationState, commandId: string, actionId: string, actor: Actor, facts: Facts): TransitionResult {
  return applyCommand(config, state, { id: commandId, command: { type: "execute", actionId } }, actor, facts);
}

/** Coordinate: the recipient's receipt, then its acceptance (three checks) or a decline with a configured reason. */
export function recordAcknowledgement(
  config: DeploymentConfiguration,
  state: CoordinationState,
  commandId: string,
  actionId: string,
  response: { type: "receive" } | { type: "accept"; checks: { scope: boolean; conflict: boolean; capacity: boolean }; noReask?: boolean } | { type: "decline"; reasonId: string },
  actor: Actor,
  facts: Facts,
): TransitionResult {
  return applyCommand(config, state, { id: commandId, command: { ...response, actionId } as never }, actor, facts);
}

export function recordCompletion(config: DeploymentConfiguration, state: CoordinationState, commandId: string, actionId: string, actor: Actor, facts: Facts, outcomeId?: string): TransitionResult {
  return applyCommand(config, state, { id: commandId, command: { type: "complete", actionId, ...(outcomeId ? { outcomeId } : {}) } }, actor, facts);
}

/** Confirmation is a person's record, not proof that anyone is safe. */
export function recordConfirmation(config: DeploymentConfiguration, state: CoordinationState, commandId: string, actionId: string, actor: Actor, facts: Facts): TransitionResult {
  return applyCommand(config, state, { id: commandId, command: { type: "confirm", actionId } }, actor, facts);
}
