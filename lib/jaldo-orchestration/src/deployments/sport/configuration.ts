/**
 * Sport — Sports Integrity deployment configuration (fictional).
 *
 * Derived from the Stage 5A/5B reference behaviour in
 * `LPRTBX/JALDO-Sports-Integrity` (PR #16, merged at `94b8567`):
 * `docs/content/coordination-v1.json` and `intelligence-v1.json`. Only the
 * coordination configuration is carried over — no prototype UI, journey,
 * policy text or learning content. Every party and service is fictional;
 * policy rows are the prototype's provisional mapping rows, not adopted policy.
 *
 * Automation is deliberately narrow: the holder adopts the first response
 * (as in Stage 5B), nothing has standing authority, and the kernel only
 * reconciles status, checks dependencies and prepares recovery and messages.
 *
 * Not carried over (needs specialist review before any real use): the
 * athlete offer (a young person's own choices), any rule about telling or not
 * telling a parent, contacting a child, reporting duties and emergency
 * exceptions.
 */
export const SPORT_CONFIGURATION = {
  schema: "jaldo.orchestration.config",
  contract: "1",
  id: "sport-integrity",
  version: "1.0.0",
  vertical: "sport",
  label: "JALDO Sports Integrity (fictional configuration)",
  dataStatus: "fictional",
  policies: [
    { id: "member-protection", version: "provisional-m17-m19", label: "Member protection policy (fictional mapping)", source: "Provisional NIF source mapping rows M17-M19 (prototype)" },
    { id: "support-continuity", version: "provisional-m20-m21", label: "Support continuity (fictional mapping)", source: "Provisional rows M20-M21 (prototype; source site unreachable)" },
    { id: "club-operations", version: "fictional-1", label: "Club operating procedure (fictional)", source: "Fictional organisation procedure" },
  ],
  roles: [
    { id: "integrity-contact", label: "Integrity contact", operations: ["hold-request", "route-request", "prepare", "approve", "execute", "release-communication", "adopt-configuration", "view-holder"] },
    { id: "service-liaison", label: "Service liaison (records service responses)", operations: ["record-party-response", "record-capacity"] },
    { id: "intake", label: "Intake recorder", operations: ["prepare"] },
    { id: "execution-reconciler", label: "Execution reconciler (purpose-scoped; never the request holder)", operations: ["reconcile-execution"] },
  ],
  parties: [
    { key: "parent", label: "The parent or carer", kind: "subject", attestation: "forbidden" },
    { key: "integrity-review", label: "Second integrity contact (fictional)", kind: "unit", attestation: "permitted" },
    { key: "wellbeing", label: "Harbour Wellbeing Service (fictional)", kind: "service", attestation: "permitted" },
    { key: "support-person", label: "Support-person service (fictional)", kind: "service", attestation: "permitted" },
    { key: "operations", label: "Club Operations (fictional)", kind: "unit", attestation: "permitted" },
  ],
  events: [
    { type: "support.requested", purpose: "coordinate-support", maxClassification: "personal", context: ["who", "ask", "contact", "not-asked"], effect: "open-request" },
    { type: "party.capacity-changed", purpose: "service-capacity", maxClassification: "internal", context: ["party", "status"], effect: "capacity-change" },
  ],
  request: {
    fields: [
      { id: "who", label: "Who is asking" },
      { id: "ask", label: "What was asked for" },
      { id: "contact", label: "Contact arrangement" },
      { id: "not-asked", label: "What is not being asked" },
    ],
  },
  actions: [
    {
      id: "parent-guidance",
      ref: "GDE",
      label: "Guidance for the parent on what happens next",
      short: "Guidance for the parent",
      purpose: "Explain to the parent, in plain language, what happens next and who can help.",
      recipient: "parent",
      approver: "holder",
      confirmer: "subject",
      authority: { label: "The holder's accepted responsibility for the request", text: "Guidance goes only to the person who asked. Nothing about anyone else is included." },
      fields: [
        { id: "ask", label: "What was asked for", source: { requestField: "ask" } },
        { id: "next", label: "What happens next", source: { fixed: "A safeguarding contact has accepted your request and will explain the options available. (Fictional example)" } },
      ],
      withheld: ["Any other action, including any review", "Any record about another person"],
      proposableWhen: "always",
      outcomes: [],
      policy: "member-protection",
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made"],
    },
    {
      id: "parent-support",
      ref: "SUP",
      label: "A support request for the parent's own wellbeing",
      short: "Support for the parent",
      purpose: "Ask a support service to consider helping the parent with how this is affecting them.",
      recipient: "wellbeing",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The parent's own consent for their own details", text: "Only the parent's own details are shared, and only if the parent approves. No consent is taken or implied for anyone else." },
      fields: [
        { id: "who", label: "Who is asking", source: { requestField: "who" } },
        { id: "ask", label: "What was asked for", source: { fixed: "I would like to talk to someone about how this is affecting me. (Fictional example)" } },
        { id: "contact", label: "Contact arrangement", source: { requestField: "contact" } },
      ],
      withheld: ["The parent's child", "Any adult in a coaching role", "That a request for guidance exists", "Any other action, including any review", "The parent's wider history"],
      proposableWhen: "always",
      outcomes: [],
      policy: "support-continuity",
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "support-recovery",
      ref: "OPT",
      label: "A support request for the parent's own options",
      short: "Support options for the parent",
      purpose: "Ask a support service to consider helping the parent understand their options.",
      recipient: "support-person",
      approver: "subject",
      confirmer: "subject",
      authority: { label: "The parent's own consent for their own details", text: "Only the parent's own details are shared, and only if the parent approves this request. No earlier approval is reused." },
      fields: [
        { id: "who", label: "Who is asking", source: { requestField: "who" } },
        { id: "ask", label: "What was asked for", source: { fixed: "I would like help understanding my options. (Fictional example)" } },
        { id: "contact", label: "Contact arrangement", source: { requestField: "contact" } },
      ],
      withheld: ["The parent's child", "Any adult in a coaching role", "That a request for guidance exists", "Any other action, including any review", "That an earlier support request exists, or what became of it"],
      proposableWhen: "recommendation",
      outcomes: [],
      policy: "support-continuity",
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "confirmation.recorded"],
    },
    {
      id: "review",
      ref: "REV",
      label: "Consideration by a second integrity contact",
      short: "Review consideration",
      purpose: "Ask a second integrity contact to consider whether the adopted policy's review step applies. Not an investigation and not a finding.",
      recipient: "integrity-review",
      approver: "holder",
      confirmer: "holder",
      authority: { label: "The adopted policy's review step (provisional mapping)", text: "The holder may ask for consideration. No breach is assumed and nobody is asked to gather evidence." },
      fields: [
        { id: "ask", label: "What was asked for", source: { requestField: "ask" } },
        { id: "not-asked", label: "What is not being asked", source: { requestField: "not-asked" } },
      ],
      withheld: ["The parent's identity unless they chose to share their name", "Any support request"],
      proposableWhen: "always",
      outcomes: [
        { id: "no-further-step", label: "No further step under the policy (fictional)" },
        { id: "practice-note", label: "A general practice note is appropriate (fictional)" },
        { id: "refer-on", label: "Refer to the policy's formal process (fictional)" },
      ],
      policy: "member-protection",
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded", "completion.recorded"],
    },
    {
      id: "ops-instruction",
      ref: "OPS",
      label: "An operational supervision arrangement",
      short: "Operations instruction",
      purpose: "Ask Club Operations to put a general supervision arrangement in place for sessions.",
      recipient: "operations",
      approver: "holder",
      confirmer: "none",
      authority: { label: "The organisation's operating procedure (fictional)", text: "Operations receives only the arrangement, never a person, a reason or a request." },
      fields: [{ id: "arrangement", label: "Arrangement", source: { fixed: "Two adults present at all junior sessions until further notice. (Fictional example)" } }],
      withheld: ["Any person", "The reason", "Any other action"],
      proposableWhen: "always",
      outcomes: [],
      policy: "club-operations",
      prerequisites: [],
      standingAuthority: false,
      evidenceRequired: ["approval.recorded", "disclosure.made", "acceptance.recorded"],
    },
  ],
  communications: [
    {
      id: "support-interrupted",
      to: "subject",
      purpose: "Tell the parent, from approved facts only, that the service can no longer act and what may happen next.",
      body: "{service} can no longer help with your request. Nothing about you has been passed to anyone else. Your contact can talk with you about other options, and nothing is shared without your approval. (Fictional example)",
      trigger: { evidence: "capacity.lost", actionType: "parent-support" },
    },
  ],
  declineReasons: [
    { id: "scope", label: "Outside what this can help with" },
    { id: "capacity", label: "No capacity to take this on" },
    { id: "conflict", label: "Not a suitable recipient (conflict)" },
    { id: "not-now", label: "Not now" },
  ],
  expectations: [
    {
      actionType: "ops-instruction",
      days: 2,
      label: "Operations is expected to take responsibility for an operational instruction within two days.",
      justification: "The fictional organisation's own operating procedure, so sessions are not left without an arrangement. An operational expectation, not a safeguarding deadline.",
    },
  ],
  recognition: {
    rules: ["request-awaiting", "capacity-lost-after-acceptance", "unavailable-before-acceptance", "expectation-passed"],
    initialResponse: "parent-guidance",
    plan: ["parent-guidance"],
    recovery: [{ forType: "parent-support", recoveryType: "support-recovery" }],
    reasoningLabel: "Deterministic configured rule (not live AI)",
    wording: {
      "request-awaiting": {
        title: "The parent's request has had no response yet",
        fact: "The request was accepted and no guidance has been proposed.",
        why: "Guidance for the parent is the configured first response to an accepted request.",
        whoDecides: "The request holder decides whether to propose guidance now.",
        unknowns: ["Whether the parent has had contact outside this app"],
        alternatives: [
          { label: "Support for the parent", why: "Needs the parent's own approval; no need is assumed." },
          { label: "Review consideration", why: "No breach is assumed from a request for guidance." },
        ],
        guidance: [{ text: "Respond to a request for guidance promptly and in plain language.", source: "Provisional policy mapping row M17 (fictional)" }],
      },
      "capacity-lost-after-acceptance": {
        title: "Support was accepted, but the service can no longer act",
        fact: "{recipient} accepted {short} ({ref}) and is now recorded as unable to act.",
        why: "Another service in the directory can consider the parent's options, with the parent's fresh approval.",
        noPathway: { title: "Support was accepted, but no other service is eligible", why: "No eligible service is available. A person decides what happens next outside this app." },
        whoDecides: "The holder may propose; only the parent may approve sharing their own details; the service decides whether to accept.",
        unknowns: ["Whether the service will regain capacity", "Whether the parent still wants support"],
        alternatives: [
          { label: "Silently choosing a replacement", why: "Never done: the parent approves every disclosure of their own details." },
          { label: "Reusing the earlier approval", why: "An approval covers one recipient and one disclosure only." },
        ],
        guidance: [{ text: "Keep the person informed if arranged support cannot go ahead.", source: "Provisional policy mapping row M20 (fictional, provisional)" }],
      },
      "unavailable-before-acceptance": {
        title: "The service could not take the request",
        fact: "{recipient} became unable to act before accepting {short} ({ref}).",
        why: "Another service can consider the parent's options, with the parent's fresh approval.",
        noPathway: { title: "The service could not take the request, and no other service is eligible", why: "No eligible service is available. A person decides what happens next outside this app." },
        whoDecides: "The holder may propose; only the parent may approve sharing their own details.",
        unknowns: ["Whether the service will regain capacity"],
        alternatives: [{ label: "Waiting indefinitely", why: "The need stays unresolved while nobody can act." }],
        guidance: [{ text: "Do not forward a person's details to another service without their approval.", source: "Provisional policy mapping row M21 (fictional, provisional)" }],
      },
      "expectation-passed": {
        title: "Operations has not yet taken responsibility",
        fact: "{short} ({ref}) was sent to {recipient} and the configured expectation has passed.",
        why: "The organisation's own operating expectation has passed. No alternative recipient is chosen automatically.",
        whoDecides: "The request holder decides what to do; nothing is chased automatically.",
        unknowns: ["Whether Operations has acted without recording it"],
        alternatives: [{ label: "Chasing automatically", why: "Contact is a person's decision." }],
        guidance: [{ text: "Operational arrangements should be confirmed before the next session.", source: "Fictional organisation operating procedure" }],
      },
    },
  },
  execution: { maxAttempts: 3 },
  automation: { operations: ["deduplicate", "reconcile-status", "check-dependencies", "prepare-recovery", "prepare-communications"] },
  measures: {
    illustrativeMinutes: { "disclosure.made": 10, "acceptance.recorded": 5, "request.accepted": 5 },
    assumption: "Illustrative coordination minutes per recorded step, from the fictional scenario. Not time worked or saved by anyone.",
  },
} as const;
