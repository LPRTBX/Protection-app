import { ENTERPRISE_CONFIGURATION } from "./configuration";

/**
 * Enterprise — psychosocial workplace support 1.1 (fictional). ADR-0037 D-7.
 *
 * Adds a work health and safety (WHS) unit with its own responsibility, and a hazard review that
 * discloses NO personal field at all — only a fixed description of the hazard. The same kernel, the
 * same contracts; only configuration differs: a different party, a different disclosure shape and a
 * different confirmer (the holder, not the employee).
 */
const base = ENTERPRISE_CONFIGURATION;

export const ENTERPRISE_PSYCHOSOCIAL_V11_CONFIGURATION = {
  ...base,
  version: "1.1.0",
  label: "JALDO Enterprise — psychosocial workplace support with WHS (fictional configuration)",
  roles: [
    ...base.roles,
    { id: "whs-liaison", label: "WHS liaison (records the WHS unit's responses)", operations: ["record-party-response", "record-capacity"] },
  ],
  parties: [...base.parties, { key: "whs", label: "Work health and safety (fictional)", kind: "unit", attestation: "permitted" }],
  actions: [
    ...base.actions,
    {
      id: "whs-hazard-review",
      ref: "WHS",
      label: "A WHS review of a reported psychosocial hazard",
      short: "WHS hazard review",
      purpose: "Ask WHS to review a psychosocial hazard in the work area, without identifying anyone.",
      policy: "psychosocial-procedure",
      recipient: "whs",
      approver: "holder",
      confirmer: "holder",
      authority: { label: "Psychosocial hazards procedure: hazard review", text: "WHS receives only a description of the hazard. It never receives who asked, what they asked for, or how to contact them." },
      fields: [{ id: "hazard", label: "Reported hazard", source: { fixed: "Sustained high workload reported in one team. (Fictional example)" } }],
      withheld: ["Who asked", "What was asked for", "Any contact detail", "Any support referral"],
      proposableWhen: "always",
      outcomes: [{ id: "reviewed", label: "Hazard reviewed" }],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded", "confirmation.recorded"],
    },
  ],
} as const;
