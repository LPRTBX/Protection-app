import { loadConfiguration, type DeploymentConfiguration } from "../contracts/config";
import { ENTERPRISE_CONFIGURATION } from "./enterprise/configuration";
import { SPORT_CONFIGURATION } from "./sport/configuration";
import { TRAVEL_CONFIGURATION } from "./travel/configuration";

/**
 * Reference deployment configurations (fictional). Deployment modules depend
 * on the kernel's contracts; the kernel never imports them.
 */
export { ENTERPRISE_CONFIGURATION, SPORT_CONFIGURATION, TRAVEL_CONFIGURATION };
export * as sport from "./sport/stage5b-adapter";

export const REFERENCE_CONFIGURATIONS: Record<string, DeploymentConfiguration> = {
  [SPORT_CONFIGURATION.id]: loadConfiguration(SPORT_CONFIGURATION),
  [ENTERPRISE_CONFIGURATION.id]: loadConfiguration(ENTERPRISE_CONFIGURATION),
  [TRAVEL_CONFIGURATION.id]: loadConfiguration(TRAVEL_CONFIGURATION),
};
