import { SPORT_CONFIGURATION } from "./configuration";

/**
 * Sport — safeguarding and integrity coordination (fictional). ADR-0037 D-7.
 *
 * The SAME kernel and the SAME parties and actions as `sport-integrity`, configured with SEPARATE
 * responsibilities: a safeguarding lead holds the request; integrity, operational and support
 * responses are each recorded by a different, purpose-scoped responsibility; reconciliation is a
 * responsibility of its own. Nobody holds more than one by configuration — each is granted per
 * coordination by the holder (persisted grants), within each Core role's eligibility ceiling.
 *
 * Configuration only: no code anywhere names this pathway.
 */
export const SPORT_SAFEGUARDING_CONFIGURATION = {
  ...SPORT_CONFIGURATION,
  id: "sport-safeguarding",
  version: "1.0.0",
  label: "JALDO Sport — safeguarding and integrity coordination (fictional configuration)",
  roles: [
    { id: "safeguarding-lead", label: "Safeguarding lead (holds the request)", operations: ["hold-request", "route-request", "prepare", "approve", "execute", "release-communication", "adopt-configuration", "view-holder"] },
    { id: "integrity-officer", label: "Integrity officer (records the integrity unit's responses)", operations: ["record-party-response"] },
    { id: "operations-coordinator", label: "Operations coordinator (records operational responses and capacity)", operations: ["record-party-response", "record-capacity"] },
    { id: "support-liaison", label: "Support liaison (records support services' responses and capacity)", operations: ["record-party-response", "record-capacity"] },
    { id: "intake", label: "Intake", operations: ["prepare"] },
    { id: "execution-reconciler", label: "Execution reconciler (purpose-scoped; never the request holder)", operations: ["reconcile-execution"] },
  ],
} as const;
