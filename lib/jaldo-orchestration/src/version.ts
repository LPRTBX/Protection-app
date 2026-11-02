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
export const JALDO_ORCHESTRATION_CONTRACT_VERSION = "1.0.0";

export const JALDO_ORCHESTRATION_CONTRACT_MAJOR = JALDO_ORCHESTRATION_CONTRACT_VERSION.split(".")[0];

export function isSupportedContractMajor(major: string): boolean {
  return major === JALDO_ORCHESTRATION_CONTRACT_MAJOR;
}
