import { loadConfiguration, type DeploymentConfiguration } from "../contracts/config";
import { ENTERPRISE_CONFIGURATION } from "./enterprise/configuration";
import { SPORT_CONFIGURATION } from "./sport/configuration";
import { TRAVEL_CONFIGURATION } from "./travel/configuration";
import { TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION } from "./travel/practical-support";
import { SPORT_SAFEGUARDING_CONFIGURATION } from "./sport/safeguarding";
import { ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION } from "./enterprise/psychosocial-v11";

/**
 * Reference deployment configurations (fictional). Deployment modules depend
 * on the kernel's contracts; the kernel never imports them.
 */
export { ENTERPRISE_CONFIGURATION, SPORT_CONFIGURATION, TRAVEL_CONFIGURATION, TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION, SPORT_SAFEGUARDING_CONFIGURATION, ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION };
export * as sport from "./sport/stage5b-adapter";

export const REFERENCE_CONFIGURATIONS: Record<string, DeploymentConfiguration> = {
  [SPORT_CONFIGURATION.id]: loadConfiguration(SPORT_CONFIGURATION),
  [ENTERPRISE_CONFIGURATION.id]: loadConfiguration(ENTERPRISE_CONFIGURATION),
  [TRAVEL_CONFIGURATION.id]: loadConfiguration(TRAVEL_CONFIGURATION),
};

/**
 * Stage 6B.2 portability proof (ADR-0037 D-7): two further fictional configurations run by the SAME
 * kernel, bridge, store and worker. Keyed by `id@version` because Enterprise 1.1 shares its id.
 */
export const PORTABILITY_CONFIGURATIONS: Record<string, DeploymentConfiguration> = {
  [`${SPORT_SAFEGUARDING_CONFIGURATION.id}@${SPORT_SAFEGUARDING_CONFIGURATION.version}`]: loadConfiguration(SPORT_SAFEGUARDING_CONFIGURATION),
  [`${ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION.id}@${ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION.version}`]: loadConfiguration(ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION),
};

/**
 * Contract 1.2 reference configurations. Kept apart from `REFERENCE_CONFIGURATIONS` so existing suites that iterate that
 * map (and assume a day-scale expectation) are unaffected; a consumer opts in by id.
 */
export const CONTRACT_12_CONFIGURATIONS: Record<string, DeploymentConfiguration> = {
  [TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION.id]: loadConfiguration(TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION),
};
