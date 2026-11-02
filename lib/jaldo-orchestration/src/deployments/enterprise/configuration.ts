/**
 * Enterprise — psychosocial workplace support (fictional). The portability
 * proof: the same kernel as Sport, configured differently.
 *
 * Scenario: an employee asks for workplace support. JALDO prepares the plan
 * without anyone choosing a workflow: guidance back to the employee (standing
 * policy — nothing about them leaves them), a referral to the employee
 * assistance provider (the employee must approve sharing their own details),
 * and a workload adjustment (the wellbeing contact approves; it waits until
 * the employee has acknowledged the guidance). The provider accepts and later
 * becomes unavailable; JALDO keeps the acceptance, shows the unresolved
 * responsibility and prepares a governed recovery to an independent
 * counselling service, which needs the employee's fresh approval.
 *
 * A manager role exists and is granted no operation at all: line management
 * never gains access to the employee's support information. Nothing here is
 * clinical; no health information is a field anywhere.
 */
export const ENTERPRISE_CONFIGURATION = {
  schema: "jaldo.orchestration.config",
  contract: "1",
  id: "enterprise-psychosocial",
  version: "1.0.0",
  vertical: "enterprise",
  label: "JALDO Enterprise — psychosocial workplace support (fictional configuration)",
  dataStatus: "fictional",
  policies: [
    { id: "psychosocial-procedure", version: "2026.1", label: "Psychosocial hazards procedure (fictional)", source: "Fictional organisation procedure" },
    { id: "employee-privacy", version: "2026.1", label: "Employee privacy standard (fictional)", source: "Fictional organisation standard" },
    { id: "adjustments", version: "2026.2", label: "Workplace adjustment procedure (fictional)", source: "Fictional organisation procedure" },
  ],
  roles: [
    { id: "wellbeing-contact", label: "Wellbeing contact", operations: ["hold-request", "route-request", "prepare", "approve", "execute", "release-communication", "adopt-configuration", "view-holder"] },
    { id: "provider-liaison", label: "Provider liaison (records provider responses)", operations: ["record-party-response", "record-capacity"] },
    { id: "people-intake", label: "People intake", operations: ["prepare"] },
    { id: "execution-reconciler", label: "Execution reconciler (purpose-scoped; never the request holder)", operations: ["reconcile-execution"] },
    { id: "line-manager", label: "Line manager", operations: [] },
  ],
  parties: [
    { key: "employee", label: "The employee", kind: "subject", attestation: "forbidden" },
    { key: "eap-provider", label: "Employee assistance provider (fictional)", kind: "service", attestation: "permitted" },
    { key: "counselling-service", label: "Independent counselling service (fictional)", kind: "service", attestation: "permitted" },
    { key: "people-operations", label: "People operations (fictional)", kind: "unit", attestation: "permitted" },
  ],
  events: [
    { type: "wellbeing.support-requested", purpose: "workplace-support", maxClassification: "personal", context: ["who", "ask", "contact"], effect: "open-request" },
    { type: "provider.capacity-changed", purpose: "provider-capacity", maxClassification: "internal", context: ["party", "status"], effect: "capacity-change" },
  ],
  request: {
    fields: [
      { id: "who", label: "Who is asking" },
      { id: "ask", label: "What was asked for" },
      { id: "contact", label: "Preferred contact" },
    ],
  },
  actions: [
    {
      id: "employee-guidance",
      ref: "GDE",
      label: "Guidance for the employee on available support",
      short: "Guidance for the employee",
      purpose: "Explain the support and adjustments available and what happens next.",
      policy: "psychosocial-procedure",
      recipient: "employee",
      approver: "holder",
      confirmer: "none",
      authority: { label: "Psychosocial hazards procedure: respond to every support request", text: "Guidance goes only to the employee who asked. Nothing about them is shared with anyone else." },
      fields: [
        { id: "ask", label: "What you asked for", source: { requestField: "ask" } },
        { id: "options", label: "Your options", source: { fixed: "A confidential conversation with the assistance provider, and a temporary workload adjustment if you want one. Nothing is shared without your approval. (Fictional example)" } },
      ],
      withheld: ["Any record about another employee", "Any line-management note"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: true,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "eap-referral",
      ref: "EAP",
      label: "A referral to the employee assistance provider",
      short: "Assistance referral",
      purpose: "Ask the employee assistance provider to offer the employee a confidential conversation.",
      policy: "employee-privacy",
      recipient: "eap-provider",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The employee's own approval for their own contact details", text: "Only the employee's name and preferred contact are shared, and only if they approve. The reason is never shared." },
      fields: [
        { id: "who", label: "Who is asking", source: { requestField: "who" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
      ],
      withheld: ["The reason for the request", "The employee's manager", "Any workplace adjustment"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "counselling-recovery",
      ref: "CNS",
      label: "A referral to an independent counselling service",
      short: "Counselling referral",
      purpose: "Ask an independent counselling service to offer the employee a conversation.",
      policy: "employee-privacy",
      recipient: "counselling-service",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The employee's own approval for their own contact details", text: "A fresh approval is needed for this service. No earlier approval is reused." },
      fields: [
        { id: "who", label: "Who is asking", source: { requestField: "who" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
      ],
      withheld: ["The reason for the request", "That an earlier referral existed, or what became of it"],
      proposableWhen: "recommendation",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "workplace-adjustment",
      ref: "ADJ",
      label: "An authorised temporary workload adjustment",
      short: "Workload adjustment",
      purpose: "Ask people operations to put an agreed, temporary workload adjustment in place.",
      policy: "adjustments",
      recipient: "people-operations",
      approver: "holder",
      confirmer: "subject",
      authority: { label: "Workplace adjustment procedure", text: "People operations receives only the adjustment, never the reason, any referral or any health information." },
      fields: [{ id: "adjustment", label: "Adjustment", source: { fixed: "Temporary reduction of on-call duties for four weeks. (Fictional example)" } }],
      withheld: ["The reason", "Any support referral", "Any health information"],
      proposableWhen: "always",
      outcomes: [{ id: "in-place", label: "Adjustment in place" }],
      prerequisites: [{ actionType: "employee-guidance", state: "accepted" }],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded", "confirmation.recorded"],
    },
  ],
  communications: [
    {
      id: "referral-interrupted",
      to: "subject",
      purpose: "Tell the employee, from approved facts only, that the provider can no longer help and that nothing has been shared further.",
      body: "{service} is no longer able to take your referral. Nothing about you has been passed on. Your wellbeing contact has another option ready, and nothing is shared without your approval. (Fictional example)",
      trigger: { evidence: "capacity.lost", actionType: "eap-referral" },
    },
  ],
  declineReasons: [
    { id: "scope", label: "Outside what this service provides" },
    { id: "capacity", label: "No capacity" },
    { id: "conflict", label: "Conflict of interest" },
  ],
  expectations: [
    {
      actionType: "workplace-adjustment",
      days: 3,
      label: "People operations is expected to take responsibility for an adjustment within three days.",
      justification: "The fictional organisation's adjustment procedure. An operational expectation only.",
    },
  ],
  recognition: {
    rules: ["capacity-lost-after-acceptance", "unavailable-before-acceptance", "expectation-passed"],
    plan: ["employee-guidance", "eap-referral", "workplace-adjustment"],
    recovery: [{ forType: "eap-referral", recoveryType: "counselling-recovery" }],
    reasoningLabel: "Deterministic configured rule (not live AI)",
    wording: {
      "capacity-lost-after-acceptance": {
        title: "The assistance provider accepted, but can no longer act",
        fact: "{recipient} accepted {short} ({ref}) and is now recorded as unable to act.",
        why: "An independent counselling service can offer a conversation, with the employee's fresh approval.",
        noPathway: { title: "The provider can no longer act, and no other service is eligible", why: "No eligible service is available. A person decides what happens next." },
        whoDecides: "The wellbeing contact may propose; only the employee approves sharing their own details.",
        unknowns: ["Whether the provider will regain capacity", "Whether the employee still wants a referral"],
        alternatives: [
          { label: "Silently choosing a replacement", why: "The employee approves every disclosure of their own details." },
          { label: "Telling the manager", why: "Line management is never told about support referrals." },
        ],
        guidance: [{ text: "Keep the employee informed if arranged support cannot go ahead.", source: "Psychosocial hazards procedure (fictional) 2026.1" }],
      },
      "unavailable-before-acceptance": {
        title: "The assistance provider could not take the referral",
        fact: "{recipient} became unable to act before accepting {short} ({ref}).",
        why: "An independent counselling service can offer a conversation, with the employee's fresh approval.",
        noPathway: { title: "The provider could not take the referral, and no other service is eligible", why: "No eligible service is available. A person decides what happens next." },
        whoDecides: "The wellbeing contact may propose; only the employee approves.",
        unknowns: ["Whether the provider will regain capacity"],
        alternatives: [{ label: "Waiting indefinitely", why: "The need stays unresolved while nobody can act." }],
        guidance: [{ text: "Do not forward an employee's details without their approval.", source: "Employee privacy standard (fictional) 2026.1" }],
      },
      "expectation-passed": {
        title: "People operations has not yet taken responsibility",
        fact: "{short} ({ref}) was sent to {recipient} and the configured expectation has passed.",
        why: "The organisation's own expectation has passed. Nothing is escalated automatically.",
        whoDecides: "The wellbeing contact decides what to do.",
        unknowns: ["Whether the adjustment is in place without being recorded"],
        alternatives: [{ label: "Escalating to the manager", why: "The manager is never told the reason; a person decides." }],
        guidance: [{ text: "Agreed adjustments should be confirmed in writing.", source: "Workplace adjustment procedure (fictional) 2026.2" }],
      },
    },
  },
  execution: { maxAttempts: 2 },
  automation: {
    operations: ["deduplicate", "reconcile-status", "prepare-plan", "check-dependencies", "prepare-recovery", "prepare-communications", "execute-standing-authority"],
  },
  measures: {
    illustrativeMinutes: { "disclosure.made": 15, "acceptance.recorded": 5 },
    assumption: "Illustrative coordination minutes from a fictional scenario. Not time saved.",
  },
} as const;
