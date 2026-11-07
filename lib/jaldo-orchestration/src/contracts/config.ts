import { z } from "zod";
import { CLASSIFICATIONS } from "./events";
import { OPERATIONS } from "./authority";
import { EVIDENCE_KINDS } from "./evidence";
import { isSupportedContractMajor, JALDO_ORCHESTRATION_CONTRACT_MAJOR } from "../version";

/**
 * Deployment configuration: everything vertical-specific about one JALDO OS
 * deployment. The kernel never names an industry, role, service or policy;
 * it reads all of them from a validated configuration. Changing a vertical's
 * configuration changes its operating behaviour without changing the kernel.
 *
 * Validated structurally (strict zod — unknown keys refused) and then
 * semantically (every reference resolves; recovery and standing-authority
 * rules are safe). Either failure throws: a malformed configuration never
 * loads as a partially working deployment.
 *
 * In JALDO Core a configuration is stored as the `definition` of a published
 * `core_playbook_versions` row, so it inherits Core's one-way publish and
 * owner-only authorship (ADR-0003).
 */

const Id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, "ids are lower-case kebab-case");
const Text = z.string().trim().min(1).max(1_000);

export const PARTY_KINDS = ["subject", "service", "unit"] as const;

/** Action states a prerequisite may require. */
export const PREREQUISITE_STATES = ["accepted", "completed", "confirmed"] as const;

/** Internal, non-disclosing operations the kernel may perform without a person. */
export const AUTOMATION_OPERATIONS = [
  "deduplicate",
  "reconcile-status",
  "prepare-plan",
  "check-dependencies",
  "prepare-recovery",
  "prepare-communications",
  "execute-standing-authority",
] as const;
export type AutomationOperation = (typeof AUTOMATION_OPERATIONS)[number];

/** Evidence kinds a communication may be triggered by (each is derivable from an action's recorded state). */
export const COMMUNICATION_TRIGGERS: readonly string[] = [
  "disclosure.made",
  "acceptance.recorded",
  "decline.recorded",
  "completion.recorded",
  "capacity.lost",
  "responsibility.unresolved",
];

export const RULE_IDS = [
  "request-awaiting",
  "capacity-lost-after-acceptance",
  "unavailable-before-acceptance",
  "expectation-passed",
  /** Contract 1.2: an open deadline instance reached its absolute due instant. Raised once per expiry. */
  "deadline-passed",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Contract 1.2: what an action's response means for the lifecycle. */
export const RESPONSE_EFFECTS = ["satisfied", "unsatisfied", "deferred"] as const;

/** Action states in lifecycle order, for deadlines and prerequisites. */
export const ORDERED_STATES = ["proposed", "awaiting_approval", "approved", "queued", "sent", "received", "accepted", "completed", "confirmed"] as const;
export type OrderedState = (typeof ORDERED_STATES)[number];

const Prerequisite = z
  .object({
    actionType: Id,
    state: z.enum(PREREQUISITE_STATES),
    /** Contract 1.2: the prerequisite must address the same recipient party as the dependent action. */
    sameRecipient: z.boolean().optional(),
    /** Contract 1.2: every field the dependent action discloses must be among the fields the prerequisite covers (its agreed scope). */
    coversFields: z.boolean().optional(),
  })
  .strict();

const Deadline = z
  .object({
    id: Id,
    label: Text,
    justification: Text,
    /** What the deadline concerns and when it starts and is met. */
    on: z.union([
      z.object({ action: Id, from: z.enum(ORDERED_STATES), until: z.enum(ORDERED_STATES) }).strict(),
      z.object({ response: Id }).strict(),
      z.object({ followUp: z.literal(true) }).strict(),
    ]),
    /** Elapsed time, exactly: a day is 24 hours. Wall-clock times are converted to UTC instants by the host. */
    afterMinutes: z.number().int().min(1).max(43_200),
    /** Party keys that may see this deadline's time. Empty: the holder only. */
    audience: z.array(Id).max(8),
  })
  .strict();

const LinkKind = z
  .object({
    id: Id,
    label: Text,
    /** The party that is responsible for the work and records its status. */
    party: Id,
    /** Party keys that may see the link. The holder and the responsible party always may. */
    visibleTo: z.array(Id).max(8),
    /** `informational`: shown, never blocks. `required`: blocks the listed transitions until resolved. */
    dependency: z.enum(["informational", "required"]),
    blocks: z.array(z.object({ actionType: Id, at: z.enum(["approval", "release", "completion", "confirmation"]) }).strict()).max(8),
  })
  .strict();

const Party = z
  .object({
    key: Id,
    label: Text,
    kind: z.enum(PARTY_KINDS),
    /**
     * Whether a member may record this party's act on its behalf (an
     * *attested* record) when the party has no channel of its own. Attested
     * records are labelled in evidence and measures. `forbidden`: only the
     * party's own authenticated channel may act for it.
     */
    attestation: z.enum(["permitted", "forbidden"]),
  })
  .strict();

const FieldSource = z.union([z.object({ requestField: Id }).strict(), z.object({ fixed: Text }).strict()]);

const ActionTypeDef = z
  .object({
    id: Id,
    /** Reference prefix. Type-coded so a reference never reveals how many other actions exist. */
    ref: z.string().regex(/^[A-Z]{2,4}$/),
    label: Text,
    short: z.string().trim().min(1).max(80),
    purpose: Text,
    /** The approved policy (by id) this action is governed by. */
    policy: Id,
    recipient: Id,
    approver: z.enum(["holder", "subject"]),
    confirmer: z.enum(["holder", "subject", "none"]),
    authority: z.object({ label: Text, text: Text }).strict(),
    fields: z.array(z.object({ id: Id, label: Text, source: FieldSource }).strict()).min(1).max(12),
    withheld: z.array(Text).max(12),
    proposableWhen: z.enum(["always", "recommendation"]),
    outcomes: z.array(z.object({ id: Id, label: Text }).strict()).max(8),
    /** Other actions in this coordination that must reach a state before this one may be executed. */
    prerequisites: z.array(Prerequisite).max(4),
    /**
     * Contract 1.2 (opt-in). Prerequisites that must hold when this action is APPROVED, not only when it is released.
     * Absent means approval is not gated by prerequisites (1.1 behaviour).
     */
    approvalPrerequisites: z.array(Prerequisite).max(4).optional(),
    /**
     * Contract 1.2 (opt-in). Strict prerequisite validity, at approval and at release: a prerequisite counts only while
     * it is in the same plan version (under `planVersioning`) and its recipient has not lost capacity since accepting.
     * A renewed check is a new action of the same type. Absent keeps 1.1 behaviour.
     */
    revalidatePrerequisites: z.boolean().optional(),
    /** Contract 1.2 (opt-in, needs `revalidatePrerequisites`). An approved, unreleased action returns to awaiting approval when a prerequisite stops being valid. */
    withdrawApprovalOnLoss: z.boolean().optional(),
    /** Contract 1.2 (opt-in). The subject's own reports on completed work. Not a score, never free text. */
    responses: z.array(z.object({ id: Id, label: Text, effect: z.enum(RESPONSE_EFFECTS) }).strict()).min(1).max(6).optional(),
    /**
     * Standing authority: the configured policy itself authorises execution,
     * so no per-action human approval is needed. Only valid for actions that
     * disclose nothing from the request to anyone but the subject (checked).
     */
    /**
     * Contract 1.3 (opt-in; B8). When the subject sees the holder's workflow records for an action that concerns them.
     * `submission` (default, the 1.2 behaviour): from `action.submitted`. `release`: only from `disclosure.made`; nothing before it, and the earlier records
     * stay hidden afterwards. Narrows the subject's audience only. Not allowed where the subject approves the action.
     */
    subjectSeesFrom: z.enum(["submission", "release"]).optional(),
    standingAuthority: z.boolean(),
    /** Evidence kinds that must exist before assurance treats this action as fully evidenced. */
    evidenceRequired: z.array(z.enum(EVIDENCE_KINDS)).max(12),
    /** Optional trusted Core integration key used by a Core execution adapter. Never a URL. */
    integrationKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/).optional(),
  })
  .strict();

const RuleWording = z
  .object({
    title: Text,
    fact: Text,
    why: Text,
    noPathway: z.object({ title: Text, why: Text }).strict().optional(),
    whoDecides: Text,
    unknowns: z.array(Text).max(8),
    alternatives: z.array(z.object({ label: Text, why: Text }).strict()).max(8),
    guidance: z.array(z.object({ text: Text, source: Text }).strict()).max(8),
  })
  .strict();

const ConfigShape = z
  .object({
    schema: z.literal("jaldo.orchestration.config"),
    contract: z.string().regex(/^\d+$/),
    id: Id,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    /** The Core deployment vertical this configuration is for (`core_deployments.vertical`). */
    vertical: Id,
    label: Text,
    dataStatus: z.enum(["fictional", "synthetic", "approved"]),
    policies: z.array(z.object({ id: Id, version: z.string().min(1).max(32), label: Text, source: Text }).strict()).min(1).max(24),
    /** Member responsibilities in this deployment and the kernel operations each may perform. */
    roles: z.array(z.object({ id: Id, label: Text, operations: z.array(z.enum(OPERATIONS)).max(OPERATIONS.length) }).strict()).min(1).max(16),
    parties: z.array(Party).min(1).max(24),
    request: z.object({ fields: z.array(z.object({ id: Id, label: Text }).strict()).min(1).max(16) }).strict(),
    /** Permitted event types. Anything else is refused (deny by default). */
    events: z
      .array(
        z
          .object({
            type: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/),
            purpose: Id,
            maxClassification: z.enum(CLASSIFICATIONS),
            /** The only context keys this event may carry. */
            context: z.array(Id).max(16),
            effect: z.enum(["open-request", "capacity-change"]),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    actions: z.array(ActionTypeDef).min(1).max(24),
    communications: z
      .array(
        z
          .object({
            id: Id,
            /** `subject`, or a party key. Communications are prepared, released by the holder, and never delivered by the kernel. */
            to: Id,
            purpose: Text,
            body: Text,
            /** The evidence kind on an action of `actionType` that makes this communication relevant. */
            trigger: z.object({ evidence: z.enum(EVIDENCE_KINDS), actionType: Id }).strict(),
          })
          .strict(),
      )
      .max(16),
    declineReasons: z.array(z.object({ id: Id, label: Text }).strict()).min(1).max(8),
    expectations: z
      .array(z.object({ actionType: Id, days: z.number().int().min(1).max(30), label: Text, justification: Text }).strict())
      .max(8),
    recognition: z
      .object({
        rules: z.array(z.enum(RULE_IDS)).max(RULE_IDS.length),
        initialResponse: Id.optional(),
        /** Action types the kernel prepares as the coordination plan once a request is held. */
        plan: z.array(Id).max(12),
        recovery: z.array(z.object({ forType: Id, recoveryType: Id }).strict()).max(8),
        wording: z.record(z.string(), RuleWording),
        reasoningLabel: Text,
      })
      .strict(),
    execution: z.object({ maxAttempts: z.number().int().min(1).max(5) }).strict(),
    /** Contract 1.2 (all opt-in). */
    planVersioning: z.boolean().optional(),
    /** Reasons a holder may give for revising a plan or changing a deadline. Ids only; no free text. */
    changeReasons: z.array(z.object({ id: Id, label: Text }).strict()).min(1).max(8).optional(),
    deadlines: z.array(Deadline).max(8).optional(),
    /** How a holder closes a follow-up opened by an unsatisfied response. */
    followUpOutcomes: z.array(z.object({ id: Id, label: Text }).strict()).min(1).max(8).optional(),
    linkKinds: z.array(LinkKind).max(8).optional(),
    automation: z.object({ operations: z.array(z.enum(AUTOMATION_OPERATIONS)).max(AUTOMATION_OPERATIONS.length) }).strict(),
    measures: z
      .object({ illustrativeMinutes: z.record(z.string(), z.number().int().min(0).max(240)), assumption: Text })
      .strict(),
  })
  .strict();

export type DeploymentConfiguration = z.infer<typeof ConfigShape>;
export type ActionTypeDefinition = DeploymentConfiguration["actions"][number];
export type PartyDefinition = DeploymentConfiguration["parties"][number];
export type EventTypeDefinition = DeploymentConfiguration["events"][number];

export class ConfigurationValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid JALDO OS deployment configuration: ${issues.join("; ")}`);
    this.name = "ConfigurationValidationError";
    this.issues = issues;
  }
}

function semanticIssues(p: DeploymentConfiguration): string[] {
  const issues: string[] = [];
  const dup = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`duplicate ${what} "${id}"`);
      seen.add(id);
    }
  };
  dup("party", p.parties.map((x) => x.key));
  dup("action", p.actions.map((x) => x.id));
  dup("action ref", p.actions.map((x) => x.ref));
  dup("request field", p.request.fields.map((x) => x.id));
  dup("decline reason", p.declineReasons.map((x) => x.id));
  dup("policy", p.policies.map((x) => x.id));
  dup("role", p.roles.map((x) => x.id));
  dup("event type", p.events.map((x) => x.type));
  dup("communication", p.communications.map((x) => x.id));

  const parties = new Map(p.parties.map((x) => [x.key, x]));
  const subjects = p.parties.filter((x) => x.kind === "subject");
  if (subjects.length !== 1) issues.push("exactly one party must be the subject");
  const subjectKey = subjects[0]?.key;
  const requestFields = new Set(p.request.fields.map((f) => f.id));
  const actionIds = new Set(p.actions.map((a) => a.id));
  const policyIds = new Set(p.policies.map((x) => x.id));

  if (!p.roles.some((r) => r.operations.includes("hold-request"))) issues.push("no role may hold a request");
  const openers = p.events.filter((e) => e.effect === "open-request");
  if (openers.length < 1) issues.push("no event type opens a request");
  for (const e of openers) {
    for (const f of p.request.fields) if (!e.context.includes(f.id)) issues.push(`event "${e.type}" cannot carry request field "${f.id}"`);
  }
  for (const e of p.events.filter((x) => x.effect === "capacity-change")) {
    for (const k of ["party", "status"]) if (!e.context.includes(k)) issues.push(`capacity event "${e.type}" must carry "${k}"`);
    if (e.maxClassification === "personal" || e.maxClassification === "sensitive") issues.push(`capacity event "${e.type}" must not carry personal data`);
  }

  for (const a of p.actions) {
    if (!policyIds.has(a.policy)) issues.push(`action "${a.id}" names unknown policy "${a.policy}"`);
    const r = parties.get(a.recipient);
    if (!r) issues.push(`action "${a.id}" names unknown recipient "${a.recipient}"`);
    else if (r.kind === "subject" && a.approver === "subject") issues.push(`action "${a.id}": the subject cannot approve an action addressed to themselves`);
    for (const f of a.fields) {
      if ("requestField" in f.source && !requestFields.has(f.source.requestField)) {
        issues.push(`action "${a.id}" field "${f.id}" reads unknown request field "${f.source.requestField}"`);
      }
    }
    dup(`field in action "${a.id}"`, a.fields.map((f) => f.id));
    for (const pre of [...a.prerequisites, ...(a.approvalPrerequisites ?? [])]) {
      if (!actionIds.has(pre.actionType)) issues.push(`action "${a.id}" depends on unknown action "${pre.actionType}"`);
      if (pre.actionType === a.id) issues.push(`action "${a.id}" depends on itself`);
    }
    if (a.subjectSeesFrom === "release" && a.approver === "subject") issues.push(`action "${a.id}": subjectSeesFrom "release" is not allowed when the subject approves it (they could not act on what they cannot see)`);
    if (a.withdrawApprovalOnLoss && !a.revalidatePrerequisites) issues.push(`action "${a.id}": withdrawApprovalOnLoss needs revalidatePrerequisites`);
    if (a.responses) {
      dup(`response in action "${a.id}"`, a.responses.map((r) => r.id));
      if (a.responses.some((r) => r.effect === "unsatisfied") && !(p.followUpOutcomes && p.followUpOutcomes.length > 0)) {
        issues.push(`action "${a.id}" has an unsatisfied response but no followUpOutcomes are configured`);
      }
    }
    if (a.standingAuthority) {
      const disclosesRequest = a.fields.some((f) => "requestField" in f.source);
      if (disclosesRequest && a.recipient !== subjectKey) {
        issues.push(`action "${a.id}": standing authority cannot disclose request fields to anyone but the subject`);
      }
      if (a.approver === "subject") issues.push(`action "${a.id}": standing authority cannot replace the subject's own approval`);
      if (a.proposableWhen === "recommendation") issues.push(`action "${a.id}": a recovery always needs fresh human authority`);
    }
  }
  // Prerequisite cycles.
  const deps = new Map(p.actions.map((a) => [a.id, [...a.prerequisites, ...(a.approvalPrerequisites ?? [])].map((x) => x.actionType)]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = (deps.get(id) ?? []).some(visit);
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  if (p.actions.some((a) => visit(a.id))) issues.push("action prerequisites form a cycle");

  for (const c of p.communications) {
    if (c.to !== "subject" && !parties.has(c.to)) issues.push(`communication "${c.id}" names unknown recipient "${c.to}"`);
    if (!actionIds.has(c.trigger.actionType)) issues.push(`communication "${c.id}" names unknown action "${c.trigger.actionType}"`);
    if (!COMMUNICATION_TRIGGERS.includes(c.trigger.evidence)) issues.push(`communication "${c.id}" uses an unsupported trigger "${c.trigger.evidence}"`);
    if (c.to !== "subject" && parties.get(c.to)?.kind === "subject") issues.push(`communication "${c.id}": address the subject as "subject"`);
  }

  const expectationTypes = new Set<string>();
  for (const e of p.expectations) {
    if (!actionIds.has(e.actionType)) issues.push(`expectation names unknown action "${e.actionType}"`);
    if (expectationTypes.has(e.actionType)) issues.push(`more than one expectation for "${e.actionType}"`);
    expectationTypes.add(e.actionType);
  }

  dup("change reason", (p.changeReasons ?? []).map((x) => x.id));
  dup("follow-up outcome", (p.followUpOutcomes ?? []).map((x) => x.id));
  const defs = p.deadlines ?? [];
  dup("deadline", defs.map((d) => d.id));
  if ((p.planVersioning || defs.length > 0) && !(p.changeReasons && p.changeReasons.length > 0)) issues.push("planVersioning and deadlines need changeReasons");
  for (const d of defs) {
    if ("action" in d.on) {
      if (!actionIds.has(d.on.action)) issues.push(`deadline "${d.id}" names unknown action "${d.on.action}"`);
      if (ORDERED_STATES.indexOf(d.on.from) >= ORDERED_STATES.indexOf(d.on.until)) issues.push(`deadline "${d.id}": "until" must come after "from"`);
    } else if ("response" in d.on) {
      const t = p.actions.find((a) => a.id === (d.on as { response: string }).response);
      if (!t) issues.push(`deadline "${d.id}" names unknown action "${(d.on as { response: string }).response}"`);
      else if (!t.responses) issues.push(`deadline "${d.id}" waits for a response but "${t.id}" configures none`);
    } else if (!p.actions.some((a) => a.responses?.some((r) => r.effect === "unsatisfied"))) {
      issues.push(`deadline "${d.id}" is for a follow-up but no response can open one`);
    }
    for (const k of d.audience) if (!parties.has(k)) issues.push(`deadline "${d.id}" audience names unknown party "${k}"`);
  }
  dup("link kind", (p.linkKinds ?? []).map((k) => k.id));
  for (const k of p.linkKinds ?? []) {
    const lp = parties.get(k.party);
    if (!lp) issues.push(`link kind "${k.id}" names unknown party "${k.party}"`);
    else if (lp.kind === "subject") issues.push(`link kind "${k.id}": the subject cannot be the responsible party`);
    for (const v of k.visibleTo) if (!parties.has(v)) issues.push(`link kind "${k.id}" names unknown visible party "${v}"`);
    if (k.dependency === "informational" && k.blocks.length > 0) issues.push(`link kind "${k.id}" is informational and cannot block anything`);
    if (k.dependency === "required" && k.blocks.length === 0) issues.push(`link kind "${k.id}" is required but blocks nothing`);
    for (const b of k.blocks) if (!actionIds.has(b.actionType)) issues.push(`link kind "${k.id}" blocks unknown action "${b.actionType}"`);
  }

  const rec = p.recognition;
  for (const t of rec.plan) if (!actionIds.has(t)) issues.push(`plan names unknown action "${t}"`);
  for (const rule of rec.rules) if (!rec.wording[rule]) issues.push(`recognition rule "${rule}" has no wording`);
  for (const key of Object.keys(rec.wording)) if (!(rec.rules as string[]).includes(key)) issues.push(`wording for rule "${key}" which is not enabled`);
  if (rec.rules.includes("request-awaiting")) {
    if (!rec.initialResponse) issues.push(`"request-awaiting" needs recognition.initialResponse`);
    else if (!actionIds.has(rec.initialResponse)) issues.push(`initialResponse names unknown action "${rec.initialResponse}"`);
  }
  if (rec.rules.includes("deadline-passed") && defs.length === 0) issues.push(`"deadline-passed" is enabled but no deadline is configured`);
  if (rec.rules.includes("expectation-passed") && p.expectations.length === 0) issues.push(`"expectation-passed" is enabled but no expectation is configured`);
  const recoveryTypes = new Set<string>();
  for (const m of rec.recovery) {
    if (!actionIds.has(m.forType)) issues.push(`recovery names unknown action "${m.forType}"`);
    const rt = p.actions.find((a) => a.id === m.recoveryType);
    if (!rt) issues.push(`recovery names unknown action "${m.recoveryType}"`);
    else if (rt.proposableWhen !== "recommendation") issues.push(`recovery action "${m.recoveryType}" must be proposable only from a recommendation`);
    recoveryTypes.add(m.recoveryType);
  }
  for (const rule of ["capacity-lost-after-acceptance", "unavailable-before-acceptance"] as const) {
    if (rec.rules.includes(rule) && rec.recovery.length > 0 && !rec.wording[rule]?.noPathway) {
      issues.push(`"${rule}" needs noPathway wording so a missing recovery pathway is stated, not hidden`);
    }
  }
  for (const a of p.actions) {
    if (a.proposableWhen === "recommendation" && !recoveryTypes.has(a.id)) issues.push(`action "${a.id}" is recommendation-only but no recovery mapping opens it`);
  }
  return issues;
}

/** Validates and returns a configuration. Throws `ConfigurationValidationError` on any structural or semantic issue. */
export function loadConfiguration(raw: unknown): DeploymentConfiguration {
  const parsed = ConfigShape.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigurationValidationError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  const config = parsed.data;
  if (!isSupportedContractMajor(config.contract)) {
    throw new ConfigurationValidationError([
      `configuration targets contract major ${config.contract}; this build implements major ${JALDO_ORCHESTRATION_CONTRACT_MAJOR}`,
    ]);
  }
  const issues = semanticIssues(config);
  if (issues.length > 0) throw new ConfigurationValidationError(issues);
  return config;
}

export function actionTypeOf(config: DeploymentConfiguration, typeId: string): ActionTypeDefinition {
  const t = config.actions.find((a) => a.id === typeId);
  if (!t) throw new Error(`Unknown action type "${typeId}" in ${config.id}@${config.version}`);
  return t;
}

export function partyOf(config: DeploymentConfiguration, key: string): PartyDefinition {
  const p = config.parties.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown party "${key}" in ${config.id}@${config.version}`);
  return p;
}

export function subjectOf(config: DeploymentConfiguration): PartyDefinition {
  return config.parties.find((x) => x.kind === "subject")!;
}

export function expectationFor(config: DeploymentConfiguration, typeId: string) {
  return config.expectations.find((e) => e.actionType === typeId) ?? null;
}

export function policyOf(config: DeploymentConfiguration, id: string) {
  return config.policies.find((x) => x.id === id)!;
}
