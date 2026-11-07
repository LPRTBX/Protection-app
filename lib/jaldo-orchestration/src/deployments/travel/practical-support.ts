/**
 * Travel — practical support for a guest who asks for somewhere quiet and
 * practical help (fictional). A second configuration of the same kernel,
 * beside `travel-service-recovery`. It carries the reusable lifecycle only:
 * hotel copy, layout and presentation belong to the Travel application, which
 * maps these ids to its own wording. Nothing here is a hotel name, room or
 * image.
 *
 * What the configuration enforces (every rule below is a kernel primitive
 * switched on here, not Travel code):
 * - the guest agrees, separately for each recipient, to share exactly the
 *   fields each recipient would receive (`share-*`, approver `subject`);
 * - the duty lead approves the handover itself (`support-handover`, approver
 *   `holder`); the duty lead cannot approve a sharing action, and the guest
 *   cannot approve the handover;
 * - the handover can be approved only once the space check, the capacity check
 *   and the guest's agreement for the same recipient and covering the same
 *   fields exist in the same plan version (`approvalPrerequisites`,
 *   `planVersioning`, `sameRecipient`, `coversFields`);
 * - if a checked party loses capacity after accepting, release is refused and
 *   an unreleased approval is withdrawn (`revalidatePrerequisites`,
 *   `withdrawApprovalOnLoss`); the earlier records stay and the renewed check
 *   is a new action of the same type;
 * - a material plan change withdraws unsent work of the old version
 *   (`revisePlan`) and agreements and approvals are given again;
 * - the guest's own report on delivered support is recorded separately from
 *   delivery (`responses`); "still needs support" opens an owned follow-up
 *   (`followUpOutcomes`); no report is unknown, never "helped";
 * - deadlines are exact UTC instants (`deadlines`);
 * - independent facility repair is an informational link that never blocks
 *   support; an area safety clearance is a required link that blocks release
 *   of the handover (`linkKinds`).
 *
 * Roles here are responsibilities, not people. Whether a real person holds
 * one is decided by Core membership and grants, never by this file.
 */
export const TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION = {
  schema: "jaldo.orchestration.config",
  contract: "1",
  id: "travel-practical-support",
  version: "1.0.0",
  vertical: "travel",
  label: "JALDO Travel — practical guest support (fictional configuration)",
  dataStatus: "fictional",
  policies: [
    { id: "guest-care", version: "2026.3", label: "Guest care standard (fictional)", source: "Fictional hotel group standard" },
    { id: "guest-privacy", version: "2026.1", label: "Guest privacy notice (fictional)", source: "Fictional hotel group notice" },
    { id: "property-operations", version: "2026.2", label: "Property operations procedure (fictional)", source: "Fictional property procedure" },
  ],
  roles: [
    { id: "duty-lead", label: "Duty lead (holds the request, approves handovers)", operations: ["hold-request", "route-request", "prepare", "approve", "execute", "release-communication", "adopt-configuration", "view-holder"] },
    { id: "unit-liaison", label: "Unit liaison (records a unit's own responses)", operations: ["record-party-response", "record-capacity"] },
    { id: "front-desk-intake", label: "Front desk intake", operations: ["prepare"] },
    { id: "execution-reconciler", label: "Execution reconciler (purpose-scoped; never the request holder)", operations: ["reconcile-execution"] },
    { id: "property-lead", label: "Property lead", operations: [] },
  ],
  parties: [
    { key: "guest", label: "The guest", kind: "subject", attestation: "forbidden" },
    { key: "reception", label: "Reception (fictional)", kind: "unit", attestation: "permitted" },
    { key: "housekeeping", label: "Housekeeping (fictional)", kind: "unit", attestation: "permitted" },
    { key: "guest-services", label: "Guest services (fictional)", kind: "unit", attestation: "permitted" },
    { key: "duty-cover", label: "Duty cover (fictional)", kind: "unit", attestation: "permitted" },
    { key: "maintenance", label: "Maintenance (fictional)", kind: "unit", attestation: "permitted" },
  ],
  events: [
    { type: "guest.support-requested", purpose: "practical-support", maxClassification: "personal", context: ["who", "ask", "preferences", "contact"], effect: "open-request" },
    { type: "unit.capacity-changed", purpose: "unit-capacity", maxClassification: "internal", context: ["party", "status"], effect: "capacity-change" },
  ],
  request: {
    fields: [
      { id: "who", label: "Guest name" },
      { id: "ask", label: "What the guest asked for" },
      { id: "preferences", label: "What the guest said would help" },
      { id: "contact", label: "Preferred contact" },
    ],
  },
  planVersioning: true,
  changeReasons: [
    { id: "material-change", label: "The plan materially changed" },
    { id: "recipient-change", label: "A recipient changed" },
    { id: "capacity-change", label: "Capacity changed" },
    { id: "guest-request", label: "The guest asked for a change" },
  ],
  actions: [
    {
      id: "share-reception",
      ref: "SRC",
      label: "The guest's agreement to share their request with Reception",
      short: "Share with Reception",
      purpose: "Let Reception know what the guest asked for, so it can check space.",
      policy: "guest-privacy",
      recipient: "reception",
      approver: "subject",
      confirmer: "none",
      authority: { label: "The guest's own agreement for their own details", text: "Only what the guest chooses to share is shared, for this plan version only." },
      fields: [
        { id: "ask", label: "What the guest asked for", source: { requestField: "ask" } },
        { id: "preferences", label: "What the guest said would help", source: { requestField: "preferences" } },
      ],
      withheld: ["Contact details", "Any other guest", "Internal notes"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "share-guest-services",
      ref: "SGS",
      label: "The guest's agreement to share their request with Guest services",
      short: "Share with Guest services",
      purpose: "Let Guest services take responsibility for the practical support the guest asked for.",
      policy: "guest-privacy",
      recipient: "guest-services",
      approver: "subject",
      confirmer: "none",
      authority: { label: "The guest's own agreement for their own details", text: "Only what the guest chooses to share is shared, for this plan version only." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "ask", label: "What the guest asked for", source: { requestField: "ask" } },
        { id: "preferences", label: "What the guest said would help", source: { requestField: "preferences" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
      ],
      withheld: ["Any other guest", "Internal notes", "Anything about other work"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "share-duty-cover",
      ref: "SDC",
      label: "The guest's agreement to share their request with Duty cover",
      short: "Share with Duty cover",
      purpose: "Let Duty cover take responsibility when the first support contact cannot.",
      policy: "guest-privacy",
      recipient: "duty-cover",
      approver: "subject",
      confirmer: "none",
      authority: { label: "The guest's own agreement for their own details", text: "A fresh agreement is needed for this recipient. No earlier agreement is reused." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "ask", label: "What the guest asked for", source: { requestField: "ask" } },
        { id: "preferences", label: "What the guest said would help", source: { requestField: "preferences" } },
        { id: "contact", label: "Preferred contact", source: { requestField: "contact" } },
      ],
      withheld: ["That an earlier plan failed, unless the guest chooses to be told", "Internal notes"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "space-check",
      ref: "SPC",
      label: "A check that a quiet space is available",
      short: "Space check",
      purpose: "Ask Reception to confirm a quiet space is available for the plan.",
      policy: "property-operations",
      recipient: "reception",
      approver: "holder",
      confirmer: "none",
      authority: { label: "Property operations procedure", text: "Reception receives only the request to check space, nothing about the guest." },
      fields: [{ id: "check", label: "Check", source: { fixed: "Confirm a quiet space is available for the next 90 minutes. (Fictional example)" } }],
      withheld: ["The guest's request", "Any personal detail"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "capacity-check",
      ref: "CAP",
      label: "A check of staff capacity",
      short: "Capacity check",
      purpose: "Ask Housekeeping to confirm it has capacity to cover the plan's workload.",
      policy: "property-operations",
      recipient: "housekeeping",
      approver: "holder",
      confirmer: "none",
      authority: { label: "Property operations procedure", text: "Housekeeping receives only the workload question, nothing about the guest." },
      fields: [{ id: "check", label: "Check", source: { fixed: "Confirm capacity to reassign one waiting-area task. (Fictional example)" } }],
      withheld: ["The guest's request", "Preferences", "Any personal detail"],
      proposableWhen: "always",
      outcomes: [],
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
    {
      id: "support-handover",
      ref: "SUP",
      label: "The practical support handover to Guest services",
      short: "Support handover",
      purpose: "Hand the guest's practical support to Guest services, who accept it, deliver it and record delivery.",
      policy: "guest-care",
      recipient: "guest-services",
      approver: "holder",
      confirmer: "subject",
      authority: { label: "Guest care standard", text: "The duty lead approves the plan. The guest's own agreement for these exact details is a separate, earlier step." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "ask", label: "What the guest asked for", source: { requestField: "ask" } },
        { id: "preferences", label: "What the guest said would help", source: { requestField: "preferences" } },
      ],
      withheld: ["Contact details", "Anything about Housekeeping's work", "Internal notes"],
      proposableWhen: "always",
      outcomes: [],
      approvalPrerequisites: [
        { actionType: "space-check", state: "accepted" },
        { actionType: "capacity-check", state: "accepted" },
        { actionType: "share-guest-services", state: "accepted", sameRecipient: true, coversFields: true },
      ],
      prerequisites: [
        { actionType: "space-check", state: "accepted" },
        { actionType: "capacity-check", state: "accepted" },
        { actionType: "share-guest-services", state: "accepted", sameRecipient: true, coversFields: true },
      ],
      revalidatePrerequisites: true,
      withdrawApprovalOnLoss: true,
      responses: [
        { id: "helped", label: "Support helped", effect: "satisfied" },
        { id: "still-needs-support", label: "Still needs support", effect: "unsatisfied" },
        { id: "keep-pending", label: "Keep feedback pending", effect: "deferred" },
      ],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded"],
    },
    {
      id: "replacement-handover",
      ref: "RPL",
      label: "A replacement support handover to Duty cover",
      short: "Replacement handover",
      purpose: "Hand the guest's practical support to Duty cover after the first contact could not act.",
      policy: "guest-care",
      recipient: "duty-cover",
      approver: "holder",
      confirmer: "subject",
      authority: { label: "Guest care standard", text: "A fresh approval and a fresh agreement from the guest are needed. No earlier approval is reused." },
      fields: [
        { id: "who", label: "Guest name", source: { requestField: "who" } },
        { id: "ask", label: "What the guest asked for", source: { requestField: "ask" } },
        { id: "preferences", label: "What the guest said would help", source: { requestField: "preferences" } },
      ],
      withheld: ["Contact details", "That an earlier plan failed, unless the guest chose to be told", "Internal notes"],
      proposableWhen: "recommendation",
      outcomes: [],
      approvalPrerequisites: [
        { actionType: "space-check", state: "accepted" },
        { actionType: "capacity-check", state: "accepted" },
        { actionType: "share-duty-cover", state: "accepted", sameRecipient: true, coversFields: true },
      ],
      prerequisites: [
        { actionType: "space-check", state: "accepted" },
        { actionType: "capacity-check", state: "accepted" },
        { actionType: "share-duty-cover", state: "accepted", sameRecipient: true, coversFields: true },
      ],
      revalidatePrerequisites: true,
      withdrawApprovalOnLoss: true,
      responses: [
        { id: "helped", label: "Support helped", effect: "satisfied" },
        { id: "still-needs-support", label: "Still needs support", effect: "unsatisfied" },
        { id: "keep-pending", label: "Keep feedback pending", effect: "deferred" },
      ],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded"],
    },
    {
      id: "workload-instruction",
      ref: "WLD",
      label: "A workload instruction for Housekeeping",
      short: "Workload instruction",
      purpose: "Ask Housekeeping to reassign one waiting-area task within its confirmed capacity.",
      policy: "property-operations",
      recipient: "housekeeping",
      approver: "holder",
      confirmer: "holder",
      authority: { label: "Property operations procedure", text: "Housekeeping receives only the workload instruction, never anything about the guest." },
      fields: [{ id: "task", label: "Task", source: { fixed: "Reassign one waiting-area task within confirmed capacity. Keep unrelated repair work separate and open. (Fictional example)" } }],
      withheld: ["Everything about the guest", "The guest's preferences", "Any other work"],
      proposableWhen: "always",
      outcomes: [],
      approvalPrerequisites: [{ actionType: "capacity-check", state: "accepted" }],
      prerequisites: [{ actionType: "capacity-check", state: "accepted" }],
      revalidatePrerequisites: true,
      withdrawApprovalOnLoss: true,
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded"],
    },
  ],
  communications: [
    {
      id: "housekeeping-workload",
      to: "housekeeping",
      purpose: "Tell Housekeeping, from approved facts only, what workload it is being asked to take.",
      body: "A workload instruction was sent to you. It contains no information about any guest. (Fictional example)",
      trigger: { evidence: "disclosure.made", actionType: "workload-instruction" },
    },
    {
      id: "plan-agreed",
      to: "subject",
      purpose: "Tell the guest that support was accepted.",
      body: "{service} accepted your support request. Nothing more about you was shared than you agreed to. (Fictional example)",
      trigger: { evidence: "acceptance.recorded", actionType: "support-handover" },
    },
    {
      id: "plan-interrupted",
      to: "subject",
      purpose: "Tell the guest, from approved facts only, that the support contact can no longer act.",
      body: "{service} can no longer act on your support request. Nothing about you has been passed to anyone else. A replacement is available if you agree to share your details with them. (Fictional example)",
      trigger: { evidence: "capacity.lost", actionType: "support-handover" },
    },
  ],
  declineReasons: [
    { id: "scope", label: "Outside what this unit provides" },
    { id: "capacity", label: "No capacity" },
  ],
  expectations: [],
  deadlines: [
    {
      id: "handover-acceptance",
      label: "Guest services accept the handover within 20 minutes of release",
      justification: "A configured operating expectation for this fictional property. Passing it records a moment for the holder; it changes nothing by itself.",
      on: { action: "support-handover", from: "sent", until: "accepted" },
      afterMinutes: 20,
      audience: [],
    },
    {
      id: "guest-response-window",
      label: "The guest is asked for a response within 90 minutes of delivery",
      justification: "A configured window. No response is unknown and is never read as helped or not helped.",
      on: { response: "support-handover" },
      afterMinutes: 90,
      audience: [],
    },
    {
      id: "follow-up-review",
      label: "The holder reviews an open follow-up within 45 minutes",
      justification: "A configured expectation for follow-up after a guest reports the support did not help.",
      on: { followUp: true },
      afterMinutes: 45,
      audience: [],
    },
  ],
  followUpOutcomes: [
    { id: "reviewed-no-change", label: "Reviewed; no change needed" },
    { id: "new-plan-agreed", label: "A new plan is being agreed with the guest" },
    { id: "guest-declined-further", label: "The guest declined further support" },
  ],
  linkKinds: [
    {
      id: "facility-repair",
      label: "Facility repair",
      party: "maintenance",
      visibleTo: [],
      dependency: "informational",
      blocks: [],
    },
    {
      id: "area-safety-clearance",
      label: "Area safety clearance",
      party: "maintenance",
      visibleTo: [],
      dependency: "required",
      blocks: [{ actionType: "support-handover", at: "release" }, { actionType: "replacement-handover", at: "release" }],
    },
  ],
  recognition: {
    rules: ["capacity-lost-after-acceptance", "unavailable-before-acceptance", "deadline-passed"],
    plan: ["share-reception", "share-guest-services", "space-check", "capacity-check"],
    recovery: [
      { forType: "support-handover", recoveryType: "replacement-handover" },
    ],
    reasoningLabel: "Deterministic configured rule (not live AI)",
    wording: {
      "capacity-lost-after-acceptance": {
        title: "A unit accepted, but can no longer act",
        fact: "{recipient} accepted {short} ({ref}) and is now recorded as unable to act.",
        why: "The earlier acceptance stays on record. A renewed check, or a replacement with the guest's fresh agreement, is needed before anything depends on it.",
        noPathway: { title: "A unit can no longer act, and no renewal is eligible", why: "No eligible renewal is available. A person decides what happens next." },
        whoDecides: "The duty lead may propose a renewal. A replacement also needs the guest's own fresh agreement.",
        unknowns: ["Whether the unit will regain capacity in time"],
        alternatives: [{ label: "Releasing anyway on the earlier check", why: "A check that is no longer valid cannot support a release." }],
        guidance: [{ text: "Renew a check whose party lost capacity before relying on it.", source: "Property operations procedure (fictional) 2026.2" }],
      },
      "unavailable-before-acceptance": {
        title: "A unit could not take the request",
        fact: "{recipient} became unable to act before accepting {short} ({ref}).",
        why: "A renewed request or a replacement can follow, with fresh approval where the guest's details are involved.",
        noPathway: { title: "A unit could not take the request, and no alternative is eligible", why: "No eligible alternative is available. A person decides what happens next." },
        whoDecides: "The duty lead may propose; only the guest approves sharing their own details.",
        unknowns: ["Whether the unit will regain capacity in time"],
        alternatives: [{ label: "Waiting for the unit", why: "The guest is waiting." }],
        guidance: [{ text: "Do not share a guest's details with a unit without their agreement.", source: "Guest privacy notice (fictional) 2026.1" }],
      },
      "deadline-passed": {
        title: "A configured deadline has passed",
        fact: "{short} ({ref}) passed its deadline of {due} (UTC).",
        why: "The configured expectation for this step has passed. Nothing is chased or changed automatically.",
        whoDecides: "The duty lead decides: wait, reschedule the deadline with a reason, or cancel it.",
        unknowns: ["Whether the step is under way without being recorded"],
        alternatives: [{ label: "Rescheduling the deadline", why: "A person records a new time and a reason; the earlier time stays on record." }],
        guidance: [{ text: "Treat a missing response as unknown, not as agreement or refusal.", source: "Guest care standard (fictional) 2026.3" }],
      },
    },
  },
  execution: { maxAttempts: 2 },
  automation: {
    operations: ["deduplicate", "reconcile-status", "prepare-plan", "check-dependencies", "prepare-recovery", "prepare-communications"],
  },
  measures: {
    illustrativeMinutes: { "disclosure.made": 8, "acceptance.recorded": 3 },
    assumption: "Illustrative coordination minutes from a fictional scenario. Not time saved.",
  },
} as const;
