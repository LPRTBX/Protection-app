/**
 * Travel — guest service recovery (fictional). A third configuration of the
 * same kernel, used to demonstrate the One-Moment Orchestrator on a Travel
 * service-recovery interruption.
 *
 * Scenario: a guest asks for help after a missed connection. JALDO prepares
 * the plan: an update back to the guest (standing policy — nothing about them
 * leaves them), an airport transfer booking (the guest approves sharing their
 * own name, contact and arrival details) and a late check-out hold (the
 * guest-care contact approves; it carries no personal details). The transfer
 * partner accepts and then becomes unable to act; JALDO keeps the acceptance,
 * shows the unresolved responsibility and prepares a recovery to an
 * alternative partner, which needs the guest's fresh approval.
 *
 * Relationship to the Core WP1 Travel simulation (PR #83): that work drives
 * Core decisions and webhook actions over the HTTP API with a mock
 * connector; this is configuration for the shared kernel. Neither copies the
 * other, and a property manager role exists with no operation at all.
 */
export const TRAVEL_CONFIGURATION = {
  schema: "jaldo.orchestration.config",
  contract: "1",
  id: "travel-service-recovery",
  version: "1.0.0",
  vertical: "travel",
  label: "JALDO Travel — guest service recovery (fictional configuration)",
  dataStatus: "fictional",
  policies: [
    { id: "guest-care", version: "2026.3", label: "Guest care standard (fictional)", source: "Fictional hotel group standard" },
    { id: "guest-privacy", version: "2026.1", label: "Guest privacy notice (fictional)", source: "Fictional hotel group notice" },
    { id: "property-operations", version: "2026.2", label: "Property operations procedure (fictional)", source: "Fictional property procedure" },
  ],
  roles: [
    { id: "guest-care-contact", label: "Guest-care contact", operations: ["hold-request", "route-request", "prepare", "approve", "execute", "release-communication", "adopt-configuration", "view-holder"] },
    { id: "partner-liaison", label: "Partner liaison (records partner responses)", operations: ["record-party-response", "record-capacity"] },
    { id: "front-desk-intake", label: "Front desk intake", operations: ["prepare"] },
    { id: "execution-reconciler", label: "Execution reconciler (purpose-scoped; never the request holder)", operations: ["reconcile-execution"] },
    { id: "property-manager", label: "Property manager", operations: [] },
  ],
  parties: [
    { key: "guest", label: "The guest", kind: "subject", attestation: "forbidden" },
    { key: "transfer-partner", label: "Airport transfer partner (fictional)", kind: "service", attestation: "permitted" },
    { key: "alternative-transfer", label: "Alternative transfer partner (fictional)", kind: "service", attestation: "permitted" },
    { key: "front-office", label: "Front office (fictional)", kind: "unit", attestation: "permitted" },
  ],
  events: [
    { type: "guest.service-requested", purpose: "guest-service-recovery", maxClassification: "personal", context: ["who", "ask", "contact", "arrival"], effect: "open-request" },
    { type: "partner.capacity-changed", purpose: "partner-capacity", maxClassification: "internal", context: ["party", "status"], effect: "capacity-change" },
  ],
  request: {
    fields: [
      { id: "who", label: "Guest name" },
      { id: "ask", label: "What the guest asked for" },
      { id: "contact", label: "Preferred contact" },
      { id: "arrival", label: "Revised arrival" },
    ],
  },
  actions: [
    {
      id: "guest-update",
      ref: "UPD",
      label: "An update to the guest on what is being arranged",
      short: "Guest update",
      purpose: "Tell the guest what is being arranged and what needs their approval.",
      policy: "guest-care",
      recipient: "guest",
      approver: "holder",
      confirmer: "none",
      authority: { label: "Guest care standard: acknowledge every service request", text: "The update goes only to the guest who asked." },
      fields: [
        { id: "ask", label: "What you asked for", source: { requestField: "ask" } },
        { id: "next", label: "What happens next", source: { fixed: "We are arranging a transfer and holding your room. Nothing is shared with a partner without your approval. (Fictional example)" } },
      ],
      withheld: ["Any other guest", "Internal notes"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: true,
      evidenceRequired: ["approval.recorded", "disclosure.made"],
    },
    {
      id: "transfer-booking",
      ref: "TRF",
      label: "An airport transfer booking with the partner",
      short: "Transfer booking",
      purpose: "Ask the transfer partner to collect the guest on their revised arrival.",
      policy: "guest-privacy",
      recipient: "transfer-partner",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The guest's own approval for their own details", text: "Only the guest's name, contact and revised arrival are shared, and only if they approve." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
        { id: "arrival", label: "Revised arrival", source: { requestField: "arrival" } },
      ],
      withheld: ["The guest's booking history", "Room number", "Payment details"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "transfer-recovery",
      ref: "ALT",
      label: "A transfer booking with an alternative partner",
      short: "Alternative transfer",
      purpose: "Ask an alternative partner to collect the guest on their revised arrival.",
      policy: "guest-privacy",
      recipient: "alternative-transfer",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The guest's own approval for their own details", text: "A fresh approval is needed for this partner. No earlier approval is reused." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
        { id: "arrival", label: "Revised arrival", source: { requestField: "arrival" } },
      ],
      withheld: ["That another partner was booked first, or what became of it", "Room number", "Payment details"],
      proposableWhen: "recommendation",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "late-checkout-hold",
      ref: "HLD",
      label: "A late check-out hold on the guest's room",
      short: "Late check-out hold",
      purpose: "Ask the front office to hold the room for a late arrival.",
      policy: "property-operations",
      recipient: "front-office",
      approver: "holder",
      confirmer: "holder",
      authority: { label: "Property operations procedure", text: "The front office receives only the hold, not the reason." },
      fields: [{ id: "hold", label: "Hold", source: { fixed: "Hold the reserved room for a late arrival tonight. (Fictional example)" } }],
      withheld: ["The guest's request", "Any partner booking"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
  ],
  communications: [
    {
      id: "transfer-interrupted",
      to: "subject",
      purpose: "Tell the guest, from approved facts only, that the transfer partner can no longer collect them.",
      body: "{service} can no longer collect you. Nothing about you has been passed to anyone else. Another partner is available if you approve sharing your details with them. (Fictional example)",
      trigger: { evidence: "capacity.lost", actionType: "transfer-booking" },
    },
  ],
  declineReasons: [
    { id: "scope", label: "Outside what this partner provides" },
    { id: "capacity", label: "No capacity" },
  ],
  expectations: [
    {
      actionType: "late-checkout-hold",
      days: 1,
      label: "The front office is expected to confirm a room hold within a day.",
      justification: "The fictional property's operating procedure. An operational expectation only.",
    },
  ],
  recognition: {
    rules: ["capacity-lost-after-acceptance", "unavailable-before-acceptance", "expectation-passed"],
    plan: ["guest-update", "transfer-booking", "late-checkout-hold"],
    recovery: [{ forType: "transfer-booking", recoveryType: "transfer-recovery" }],
    reasoningLabel: "Deterministic configured rule (not live AI)",
    wording: {
      "capacity-lost-after-acceptance": {
        title: "The transfer partner accepted, but can no longer collect the guest",
        fact: "{recipient} accepted {short} ({ref}) and is now recorded as unable to act.",
        why: "An alternative partner can collect the guest, with the guest's fresh approval.",
        noPathway: { title: "The partner can no longer act, and no alternative is eligible", why: "No eligible partner is available. A person decides what happens next." },
        whoDecides: "The guest-care contact may propose; only the guest approves sharing their own details.",
        unknowns: ["Whether the partner will regain capacity in time"],
        alternatives: [{ label: "Rebooking silently with another partner", why: "The guest approves every disclosure of their own details." }],
        guidance: [{ text: "Keep the guest informed when an arranged service cannot go ahead.", source: "Guest care standard (fictional) 2026.3" }],
      },
      "unavailable-before-acceptance": {
        title: "The transfer partner could not take the booking",
        fact: "{recipient} became unable to act before accepting {short} ({ref}).",
        why: "An alternative partner can collect the guest, with the guest's fresh approval.",
        noPathway: { title: "The partner could not take the booking, and no alternative is eligible", why: "No eligible partner is available. A person decides what happens next." },
        whoDecides: "The guest-care contact may propose; only the guest approves.",
        unknowns: ["Whether the partner will regain capacity in time"],
        alternatives: [{ label: "Waiting for the partner", why: "The guest's arrival is time-bound." }],
        guidance: [{ text: "Do not share a guest's details with a partner without their approval.", source: "Guest privacy notice (fictional) 2026.1" }],
      },
      "expectation-passed": {
        title: "The front office has not confirmed the room hold",
        fact: "{short} ({ref}) was sent to {recipient} and the configured expectation has passed.",
        why: "The property's own expectation has passed. Nothing is chased automatically.",
        whoDecides: "The guest-care contact decides.",
        unknowns: ["Whether the hold is in place without being recorded"],
        alternatives: [{ label: "Escalating to the property manager", why: "A person decides; no role gains access by seniority." }],
        guidance: [{ text: "Room holds for late arrivals should be confirmed the same day.", source: "Property operations procedure (fictional) 2026.2" }],
      },
    },
  },
  execution: { maxAttempts: 2 },
  automation: {
    operations: ["deduplicate", "reconcile-status", "prepare-plan", "check-dependencies", "prepare-recovery", "prepare-communications", "execute-standing-authority"],
  },
  measures: {
    illustrativeMinutes: { "disclosure.made": 8, "acceptance.recorded": 3 },
    assumption: "Illustrative coordination minutes from a fictional scenario. Not time saved.",
  },
} as const;
