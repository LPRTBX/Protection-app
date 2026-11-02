import {
  actionTypeOf,
  partyOf,
  policyOf,
  subjectOf,
  type ActionTypeDefinition,
  type DeploymentConfiguration,
  type EventTypeDefinition,
} from "../contracts/config";
import { classificationRank, EventEnvelopeSchema, type EventEnvelope } from "../contracts/events";
import type { Actor } from "../contracts/authority";
import type { EvidenceKind, EvidenceRecord, EvidenceStrength } from "../contracts/evidence";
import type {
  Command,
  CommandEnvelope,
  CoordinationState,
  Executor,
  Facts,
  FrozenField,
  GovernedAction,
  RefusalCode,
  TransitionResult,
} from "../contracts/orchestration";
import { JALDO_ORCHESTRATION_CONTRACT_VERSION } from "../version";
import { actorRecord, evaluateAuthority, evaluateExecutionAuthority, isMemberSelf, partyMayAct, strengthOf } from "./authority";
import { holderOf, isLive, ownerOf, recipientEligible, recipientUnavailable } from "./predicates";
import { activeRecommendation, fieldsFor, syncMoments } from "./recognition";

/**
 * The orchestration kernel's state transitions. Pure and deterministic given
 * the configuration, the state, the actor and the facts (including any
 * injected executor). Every refusal changes nothing and writes no evidence;
 * a duplicate event or command (same idempotency key / command id) is
 * acknowledged with no second effect.
 */

type Draft = { kind: EvidenceKind; actionId: string | null; audience: string[]; text: string; recipientText?: string; strength?: EvidenceStrength };
type Inner = { ok: true; state: CoordinationState; drafts: Draft[] } | { ok: false; code: RefusalCode; message: string };

const refuse = (code: RefusalCode, message: string): { ok: false; code: RefusalCode; message: string } => ({ ok: false, code, message });
const all4 = (c: { recipient: boolean; purpose: boolean; fields: boolean; authority: boolean } | undefined) =>
  !!c && c.recipient && c.purpose && c.fields && c.authority;
const subjectAudience = (config: DeploymentConfiguration) => `party:${subjectOf(config).key}`;

/** The subject sees records about actions that concern their own details or are addressed to them. */
export function subjectConcerned(config: DeploymentConfiguration, type: ActionTypeDefinition): boolean {
  const s = subjectOf(config).key;
  return type.approver === "subject" || type.confirmer === "subject" || type.recipient === s;
}
const subjectSees = (config: DeploymentConfiguration, type: ActionTypeDefinition) => (subjectConcerned(config, type) ? [subjectAudience(config)] : []);
const actionAudience = (config: DeploymentConfiguration, type: ActionTypeDefinition) =>
  [...new Set(["holder", `party:${type.recipient}`, ...subjectSees(config, type)])];

/** Seal drafts into numbered evidence with provenance, and refresh the moment lifecycle. */
function seal(
  config: DeploymentConfiguration,
  before: CoordinationState,
  inner: { state: CoordinationState; drafts: Draft[] },
  actor: Actor,
  facts: Facts,
  origin: { command: string | null; commandId: string | null; eventId: string | null },
): TransitionResult {
  const at = facts.now.toISOString();
  // Recognition history: a moment newly recognised (or recurring) because of this change is itself evidence.
  const moments = syncMoments(config, inner.state, facts);
  const drafts: Draft[] = [
    ...inner.drafts,
    ...moments
      .filter((m) => {
        const prior = inner.state.moments.find((p) => p.id === m.id);
        return m.status === "recognised" && (!prior || prior.status === "resolved");
      })
      .map((m): Draft => ({
        kind: "moment.recognised",
        actionId: m.actionId,
        audience: ["holder"],
        text: `A configured rule (${m.ruleId}, configuration ${m.ruleVersion}) recognised a moment${m.occurrences > 1 ? ` again (occurrence ${m.occurrences})` : ""}. Nothing was approved, sent or decided.`,
        strength: "system-recorded",
      })),
  ];
  const evidence: EvidenceRecord[] = drafts.map((d, i) => ({
    sequence: before.sequence + i + 1,
    kind: d.kind,
    actionId: d.actionId,
    audience: d.audience,
    text: d.text,
    recipientText: d.recipientText ?? null,
    actor: actorRecord(actor),
    strength: d.strength ?? strengthOf(actor),
    provenance: {
      contractVersion: JALDO_ORCHESTRATION_CONTRACT_VERSION,
      configId: config.id,
      configVersion: config.version,
      command: origin.command,
      commandId: origin.commandId,
      eventId: origin.eventId,
    },
    at,
  }));
  return { ok: true, duplicate: false, state: { ...inner.state, moments, sequence: before.sequence + evidence.length }, evidence };
}

/**
 * Status reconciliation: records moments that became true without any
 * command — typically because time passed and a configured expectation is
 * now overdue. Quiet when nothing new is recognised.
 */
export function reconcileMoments(config: DeploymentConfiguration, state: CoordinationState, facts: Facts): TransitionResult {
  if (config.id !== state.config.id || config.version !== state.config.version) return refuse("configuration_mismatch", "This coordination runs under a different configuration version.");
  const system: Actor = { kind: "system", scope: state.scope };
  const r = seal(config, state, { state, drafts: [] }, system, facts, { command: "reconcile", commandId: null, eventId: null });
  if (!r.ok || r.evidence.length === 0) return { ok: true, duplicate: false, state, evidence: [] };
  return r;
}

// ─────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────

/**
 * Deterministic content fingerprint of an event (FNV-1a, 64-bit) over
 * everything except its delivery identity (`id`, `occurredAt`, provenance).
 * Not a security hash: it only distinguishes a genuine redelivery from a
 * reused idempotency key with different content.
 */
export function eventFingerprint(event: EventEnvelope): string {
  const canonical = JSON.stringify([event.type, event.purpose, event.classification, event.scope.organisationId, event.scope.deploymentId, Object.entries(event.context).sort(([a], [b]) => (a < b ? -1 : 1))]);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i++) {
    h ^= BigInt(canonical.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

const eventKey = (event: EventEnvelope) => `${event.idempotencyKey}=${eventFingerprint(event)}`;

/** Validates an event against the configuration. Deny by default; refusal messages never echo values. */
export function admitEvent(
  config: DeploymentConfiguration,
  raw: unknown,
): { ok: true; event: EventEnvelope; def: EventTypeDefinition } | { ok: false; code: RefusalCode; message: string } {
  const parsed = EventEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return refuse("event_not_permitted", "The event is not a valid JALDO event.");
  const event = parsed.data;
  const def = config.events.find((e) => e.type === event.type);
  if (!def) return refuse("event_not_permitted", "This deployment does not accept this event type.");
  if (event.purpose !== def.purpose) return refuse("event_not_permitted", "The event's purpose is not the purpose this deployment permits.");
  if (classificationRank(event.classification) > classificationRank(def.maxClassification)) {
    return refuse("event_not_permitted", "The event carries a more sensitive classification than this deployment permits.");
  }
  const extra = Object.keys(event.context).filter((k) => !def.context.includes(k));
  if (extra.length > 0) return refuse("event_not_permitted", `The event carries ${extra.length} context item(s) this deployment does not permit.`);
  return { ok: true, event, def };
}

/**
 * Opens a coordination from a permitted request event, addressed to one
 * member who must accept it. Recorded by the subject through their own
 * channel, or by a member with the `prepare` responsibility.
 */
export function openCoordination(
  config: DeploymentConfiguration,
  rawEvent: unknown,
  routing: { destination: string },
  actor: Actor,
  facts: Facts,
): TransitionResult {
  const admitted = admitEvent(config, rawEvent);
  if (!admitted.ok) return admitted;
  const { event, def } = admitted;
  if (def.effect !== "open-request") return refuse("event_not_permitted", "This event does not open a request.");
  if (actor.scope.organisationId !== event.scope.organisationId || actor.scope.deploymentId !== event.scope.deploymentId) {
    return refuse("not_found", "Not available in this deployment.");
  }
  const bySubject = actor.kind === "party" && actor.key === subjectOf(config).key;
  if (!bySubject && evaluateAuthority(config, actor, "prepare", event.scope, facts.now).outcome !== "allowed") {
    return refuse("not_permitted", "You may not record a request in this deployment.");
  }
  if (!(facts.eligibleHolders ?? []).includes(routing.destination)) {
    return refuse("no_eligible_holder", "The request can only be addressed to a member who may hold it. No substitute is chosen.");
  }
  const request: FrozenField[] = config.request.fields.map((f) => ({ id: f.id, label: f.label, value: String(event.context[f.id] ?? "") }));
  if (request.some((f) => f.value.trim() === "")) return refuse("event_not_permitted", "The request is missing reviewed fields.");
  const empty: CoordinationState = {
    contractVersion: JALDO_ORCHESTRATION_CONTRACT_VERSION,
    scope: event.scope,
    config: { id: config.id, version: config.version },
    request,
    status: "awaiting_acceptance",
    destination: routing.destination,
    owner: null,
    routedFrom: [],
    actions: [],
    moments: [],
    released: [],
    processedEvents: [eventKey(event)],
    processedCommands: [],
    sequence: 0,
  };
  return seal(
    config,
    empty,
    {
      state: empty,
      drafts: [
        { kind: "event.recorded", actionId: null, audience: ["holder"], text: `A permitted "${event.type}" event was recorded for purpose "${event.purpose}" (${event.classification}).`, strength: "system-recorded" },
        { kind: "request.opened", actionId: null, audience: ["holder", subjectAudience(config)], text: `A request was sent to its addressed contact. Fields: ${request.map((f) => f.label).join(", ")}. Receipt is not acceptance.` },
      ],
    },
    actor,
    facts,
    { command: null, commandId: null, eventId: event.id },
  );
}

/**
 * Applies a later permitted event to a coordination. A duplicate (same
 * idempotency key) is acknowledged with no effect. A capacity event applies
 * the recorded capacity fact (`facts.unavailable` must already reflect it):
 * work not yet accepted becomes an unresolved gap; accepted work keeps its
 * acceptance and is recognised as interrupted. An event with no effect writes
 * no evidence (quiet unless it adds value).
 */
export function ingestEvent(config: DeploymentConfiguration, state: CoordinationState, rawEvent: unknown, actor: Actor, facts: Facts): TransitionResult {
  if (config.id !== state.config.id || config.version !== state.config.version) return refuse("configuration_mismatch", "This coordination runs under a different configuration version.");
  const admitted = admitEvent(config, rawEvent);
  if (!admitted.ok) return admitted;
  const { event, def } = admitted;
  if (event.scope.organisationId !== state.scope.organisationId || event.scope.deploymentId !== state.scope.deploymentId) {
    return refuse("not_found", "Not available in this deployment.");
  }
  if (state.processedEvents.includes(eventKey(event))) return { ok: true, duplicate: true, state, evidence: [] };
  if (state.processedEvents.some((k) => k.startsWith(`${event.idempotencyKey}=`))) {
    return refuse("idempotency_conflict", "This idempotency key was already used with different content. Nothing was recorded.");
  }
  if (def.effect !== "capacity-change") return refuse("event_not_permitted", "A coordination accepts only one request event.");
  if (evaluateAuthority(config, actor, "record-capacity", state.scope, facts.now).outcome !== "allowed") {
    return refuse("not_permitted", "You may not record capacity in this deployment.");
  }
  const key = event.context.party;
  const status = event.context.status;
  const party = config.parties.find((p) => p.key === key);
  if (!party || party.kind === "subject" || !["available", "unavailable"].includes(status)) {
    return refuse("event_not_permitted", "The capacity event does not name a configured service or unit and a valid status.");
  }
  if ((status === "unavailable") !== facts.unavailable.has(key)) {
    return refuse("invalid_state", "Capacity facts are out of step with this event; record the fact before applying it.");
  }
  const base = { ...state, processedEvents: [...state.processedEvents, eventKey(event)] };
  if (status === "available") return { ok: true, duplicate: false, state: base, evidence: [] };
  const at = facts.now.toISOString();
  const hit = base.actions.filter((a) => a.recipient === key && ["sent", "received"].includes(a.state) && !a.heldBack);
  const lost = base.actions.filter((a) => a.recipient === key && a.state === "accepted" && !a.heldBack);
  if (hit.length === 0 && lost.length === 0) return { ok: true, duplicate: false, state: base, evidence: [] };
  const next = { ...base, actions: base.actions.map((a) => (hit.includes(a) ? { ...a, state: "unresolved" as const, gap: { kind: "recipient_unavailable" as const, at } } : a)) };
  const drafts: Draft[] = [
    ...hit.map((a): Draft => {
      const t = actionTypeOf(config, a.typeId);
      return { kind: "responsibility.unresolved", actionId: a.id, audience: actionAudience(config, t), text: `${party.label} became unable to act before accepting ${t.short} (${a.id}). Nothing was passed to anyone else.` };
    }),
    ...lost.map((a): Draft => {
      const t = actionTypeOf(config, a.typeId);
      return { kind: "capacity.lost", actionId: a.id, audience: ["holder", ...subjectSees(config, t)], text: `${party.label} is recorded as no longer able to act on ${t.short} (${a.id}). Its acceptance is kept as recorded; the need is unresolved. Nothing was passed to anyone else.` };
    }),
  ];
  return seal(config, state, { state: next, drafts }, actor, facts, { command: null, commandId: null, eventId: event.id });
}

// ─────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────

/** Records a simulated delivery: the disclosure is recorded and nothing leaves the system. */
export const recordOnlyExecutor: Executor = () => ({ status: "delivered", reference: null });

/** Whether the actor has any standing in this coordination. Strangers get `not_found`, never a reason that reveals it exists. */
function related(config: DeploymentConfiguration, state: CoordinationState, actor: Actor): boolean {
  if (actor.scope.organisationId !== state.scope.organisationId || actor.scope.deploymentId !== state.scope.deploymentId) return false;
  if (actor.kind === "system") return true;
  if (actor.kind === "party") {
    return actor.key === subjectOf(config).key || state.actions.some((a) => a.recipient === actor.key && a.sentAt !== null && !a.heldBack);
  }
  if (actor.onBehalfOf) return state.actions.some((a) => a.recipient === actor.onBehalfOf && a.sentAt !== null && !a.heldBack) || actor.onBehalfOf === subjectOf(config).key;
  return actor.id === holderOf(state);
}

/** A purpose-scoped reconciler reaches a coordination only while it has an uncertain dispatch, and only to reconcile it. */
function reconcilerReach(config: DeploymentConfiguration, state: CoordinationState, actor: Actor, command: Command, now: Date): boolean {
  return (
    command.type === "reconcileDispatch" &&
    actor.kind === "member" &&
    actor.scope.organisationId === state.scope.organisationId &&
    actor.scope.deploymentId === state.scope.deploymentId &&
    state.actions.some((a) => a.gap?.kind === "dispatch_uncertain" && !a.heldBack) &&
    evaluateAuthority(config, actor, "reconcile-execution", state.scope, now).outcome === "allowed"
  );
}

export function applyCommand(config: DeploymentConfiguration, state: CoordinationState, envelope: CommandEnvelope, actor: Actor, facts: Facts): TransitionResult {
  if (config.id !== state.config.id || config.version !== state.config.version) return refuse("configuration_mismatch", "This coordination runs under a different configuration version.");
  if (!related(config, state, actor) && !reconcilerReach(config, state, actor, envelope.command, facts.now)) return refuse("not_found", "Not found.");
  if (state.processedCommands.includes(envelope.id)) return { ok: true, duplicate: true, state, evidence: [] };
  if (envelope.expectedSequence !== undefined && envelope.expectedSequence !== state.sequence) {
    return refuse("stale_sequence", "This coordination changed since you loaded it. Reload and try again.");
  }
  const inner = handle(config, state, envelope.command, actor, facts);
  if (!inner.ok) return inner;
  return seal(config, state, { state: { ...inner.state, processedCommands: [...state.processedCommands, envelope.id] }, drafts: inner.drafts }, actor, facts, {
    command: envelope.command.type,
    commandId: envelope.id,
    eventId: null,
  });
}

/**
 * Moves a coordination to a newer published version of the same
 * configuration. Approvals given under the old version become stale: any
 * approved-but-unexecuted action returns to awaiting approval. Executed work
 * keeps the disclosure it was made under.
 */
export function adoptConfiguration(
  current: DeploymentConfiguration,
  next: DeploymentConfiguration,
  state: CoordinationState,
  envelope: { id: string },
  actor: Actor,
  facts: Facts,
): TransitionResult {
  if (current.id !== state.config.id || current.version !== state.config.version) return refuse("configuration_mismatch", "This coordination runs under a different configuration version.");
  if (!related(current, state, actor)) return refuse("not_found", "Not found.");
  if (state.processedCommands.includes(envelope.id)) return { ok: true, duplicate: true, state, evidence: [] };
  if (!isMemberSelf(actor, ownerOf(state))) return refuse("not_permitted", "Only the member who owns this request may change its configuration.");
  if (evaluateAuthority(current, actor, "adopt-configuration", state.scope, facts.now).outcome !== "allowed") return refuse("not_permitted", "You may not change this configuration.");
  if (next.id !== current.id || next.contract !== current.contract || next.version === current.version) {
    return refuse("invalid_state", "Only a different version of the same configuration and contract can be adopted.");
  }
  const missing = state.actions.filter((a) => !next.actions.some((t) => t.id === a.typeId));
  if (missing.length > 0) return refuse("invalid_state", "The new version removes an action type this coordination uses.");
  const stale = state.actions.filter((a) => a.state === "approved");
  const moved: CoordinationState = {
    ...state,
    config: { id: next.id, version: next.version },
    actions: state.actions.map((a) => (stale.includes(a) ? { ...a, state: "awaiting_approval" as const, approval: null } : a)),
    processedCommands: [...state.processedCommands, envelope.id],
  };
  const drafts: Draft[] = [
    { kind: "configuration.adopted", actionId: null, audience: ["holder"], text: `The coordination moved from configuration ${current.version} to ${next.version}.` },
    ...stale.map((a): Draft => {
      const t = actionTypeOf(next, a.typeId);
      return { kind: "authority.stale", actionId: a.id, audience: ["holder", ...subjectSees(next, t)], text: `The approval for ${t.short} (${a.id}) was given under an earlier configuration. A fresh approval is required before anything is sent.` };
    }),
  ];
  return seal(next, state, { state: moved, drafts }, actor, facts, { command: "adoptConfiguration", commandId: envelope.id, eventId: null });
}

function handle(config: DeploymentConfiguration, s: CoordinationState, cmd: Command, actor: Actor, facts: Facts): Inner {
  const at = facts.now.toISOString();
  const by = actorRecord(actor);
  const owner = ownerOf(s);
  const now = facts.now;
  const patch = (id: string, fn: (a: GovernedAction) => GovernedAction): CoordinationState => ({ ...s, actions: s.actions.map((a) => (a.id === id ? fn(a) : a)) });
  const find = (id: string) => s.actions.find((a) => a.id === id && !a.heldBack) ?? null;
  const ownerOnly = () => refuse("not_permitted", "Only the member who owns this request may take this step.");
  const may = (op: Parameters<typeof evaluateAuthority>[2]) => {
    const d = evaluateAuthority(config, actor, op, s.scope, now);
    return d.outcome === "allowed" ? null : refuse("not_permitted", d.reasons.join(" "));
  };
  const ownerMay = (op: Parameters<typeof evaluateAuthority>[2]) => {
    const isSystemPrepare = actor.kind === "system" && op === "prepare";
    if (!isSystemPrepare && !isMemberSelf(actor, owner)) return ownerOnly();
    if (owner === null) return ownerOnly();
    return may(op);
  };

  switch (cmd.type) {
    case "acceptRequest": {
      if (s.status !== "awaiting_acceptance") return refuse("invalid_state", "This request is not awaiting acceptance.");
      if (!isMemberSelf(actor, s.destination)) return refuse("not_permitted", "Only the member the request is addressed to may accept it.");
      const denied = may("hold-request");
      if (denied) return denied;
      if (!(facts.eligibleHolders ?? []).includes(s.destination)) {
        return refuse("no_eligible_holder", "You are not currently eligible to hold this request. It stays unresolved; no substitute is chosen.");
      }
      const c = cmd.checks;
      if (!c || !c.authority || !c.noConflict || !c.capacity) return refuse("checks_required", "Accepting needs the authority, conflict and capacity checks.");
      return {
        ok: true,
        state: { ...s, status: "owner_accepted", owner: s.destination },
        drafts: [{ kind: "request.accepted", actionId: null, audience: ["holder", subjectAudience(config)], text: "The addressed contact accepted the request after checking authority, conflict and capacity, and now owns it." }],
      };
    }

    case "routeRequest": {
      const holder = holderOf(s);
      if (!isMemberSelf(actor, holder)) return refuse("not_permitted", "Only the member holding the request may transfer it.");
      const denied = may("route-request");
      if (denied) return denied;
      if (!all4(cmd.checks)) return refuse("checks_required", "A transfer is a disclosure: review the recipient, purpose, exact fields and authority basis first.");
      const eligible = (facts.eligibleHolders ?? []).filter((m) => m !== holder && !s.routedFrom.includes(m));
      if (!eligible.includes(cmd.to)) return refuse("no_eligible_holder", "That member is not an eligible holder for this request. No substitute is chosen.");
      const unsent = s.actions.filter((a) => a.sentAt === null && isLive(a));
      const actions = s.actions.map((a) =>
        a.sentAt !== null ? a : { ...a, heldBack: true, ...(unsent.includes(a) ? { state: "withdrawn" as const, withdrawal: { at, reason: "transfer" as const } } : {}) },
      );
      return {
        ok: true,
        state: { ...s, actions, status: "awaiting_acceptance", destination: cmd.to, owner: null, routedFrom: [...s.routedFrom, holder] },
        drafts: [
          { kind: "request.routed", actionId: null, audience: ["holder", subjectAudience(config)], text: `The holder authorised a transfer of the request after checking the recipient, purpose, exact fields and authority basis. Fields passed on: ${s.request.map((f) => f.label).join(", ")}. The previous holder keeps no access; the new holder must accept separately. Unsent work is held back.` },
          ...unsent.map((a): Draft => ({ kind: "action.withdrawn", actionId: a.id, audience: ["holder"], text: `${actionTypeOf(config, a.typeId).short} (${a.id}) was withdrawn on the transfer. Nothing had been sent.` })),
        ],
      };
    }

    case "propose": {
      const denied = ownerMay("prepare");
      if (denied) return denied;
      const type = config.actions.find((t) => t.id === cmd.actionType);
      if (!type) return refuse("not_found", "This deployment has no such action type.");
      const rec = cmd.fromRecommendation ? activeRecommendation(config, s, facts, owner!, cmd.fromRecommendation) : null;
      if (cmd.fromRecommendation && (!rec || rec.pathway?.actionType !== type.id)) return refuse("not_recommended", "That recommendation is not currently active for this pathway.");
      if (type.proposableWhen === "recommendation" && !rec) return refuse("not_recommended", "This action can only be opened by adopting a current recommendation.");
      if (actor.kind === "system" && !config.recognition.plan.includes(type.id)) return refuse("not_permitted", "The kernel prepares only configured plan steps.");
      if (s.actions.some((a) => a.typeId === type.id && isLive(a) && !a.heldBack)) return refuse("already_open", "An action of this type is already open.");
      const epoch = s.routedFrom.length === 0 ? "" : String.fromCharCode(65 + s.routedFrom.length);
      const stem = `${type.ref}-${epoch}`;
      const id = `${stem}${s.actions.filter((a) => a.id.startsWith(stem) && /^\d+$/.test(a.id.slice(stem.length))).length + 1}`;
      const el = recipientEligible(config, type.id, facts);
      const action: GovernedAction = {
        id,
        typeId: type.id,
        state: el.ok ? "proposed" : "unresolved",
        createdAt: at,
        preparedBy: by,
        fields: fieldsFor(type, s.request),
        recipient: el.ok ? el.key : null,
        gap: el.ok ? null : { kind: "no_recipient", at },
        submitted: false,
        approval: null,
        disclosure: null,
        attempts: [],
        sentAt: null,
        acceptedAt: null,
        acceptedBy: null,
        noReask: false,
        declineReason: null,
        outcome: null,
        completedAt: null,
        confirmedBy: null,
        withdrawal: null,
        heldBack: false,
        origin: rec ? rec.id : null,
        recovers: rec && rec.actionId && (rec.ruleId === "capacity-lost-after-acceptance" || rec.ruleId === "unavailable-before-acceptance") ? rec.actionId : null,
      };
      const moments = rec ? s.moments.map((m) => (m.id === rec.id ? { ...m, status: "adopted" as const } : m)) : s.moments;
      return {
        ok: true,
        state: { ...s, actions: [...s.actions, action], moments },
        drafts: [
          {
            kind: action.recovers ? "recovery.proposed" : "action.proposed",
            actionId: id,
            audience: ["holder"],
            text: `${actor.kind === "system" ? "JALDO prepared" : rec ? "The holder adopted a recommendation and proposed" : "The holder proposed"} ${type.short} (${id}). ${el.ok ? "Nothing is approved or sent." : "No authorised recipient is available, so nothing can be sent. No substitute is chosen."}`,
          },
        ],
      };
    }

    case "dismissRecommendation": {
      const denied = ownerMay("prepare");
      if (denied) return denied;
      if (actor.kind === "system") return refuse("not_permitted", "Only a person decides not to act.");
      if (!activeRecommendation(config, s, facts, owner!, cmd.recommendationId)) return refuse("not_recommended", "That recommendation is not currently active.");
      return {
        ok: true,
        state: { ...s, moments: s.moments.map((m) => (m.id === cmd.recommendationId ? { ...m, status: "dismissed" as const } : m)) },
        drafts: [{ kind: "recommendation.dismissed", actionId: null, audience: ["holder"], text: "The holder recorded a decision not to act on a recommendation now. Nothing was proposed, approved or sent." }],
      };
    }

    case "submit":
    case "withdraw":
    case "recheck": {
      const a = find(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      const denied = ownerMay(cmd.type === "withdraw" ? "prepare" : "prepare");
      if (denied) return denied;
      const type = actionTypeOf(config, a.typeId);
      if (cmd.type === "submit") {
        if (a.state !== "proposed") return refuse("invalid_state", "Only a proposed action can be submitted.");
        const el = recipientEligible(config, type.id, facts);
        if (!el.ok) {
          return {
            ok: true,
            state: patch(a.id, (r) => ({ ...r, state: "unresolved", recipient: null, gap: { kind: "no_recipient", at } })),
            drafts: [{ kind: "responsibility.unresolved", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${type.short} (${a.id}) could not be submitted: no authorised recipient is available. No substitute is chosen.` }],
          };
        }
        if (type.standingAuthority) {
          // Configured standing policy is the authority: no per-action human approval, and it is recorded as such.
          return {
            ok: true,
            state: patch(a.id, (r) => ({ ...r, state: "approved", recipient: el.key, submitted: true, approval: { by, attested: false, basis: "standing-policy", configVersion: config.version, at } })),
            drafts: [{ kind: "approval.recorded", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${type.short} (${a.id}) is authorised by standing policy ${policyOf(config, type.policy).label} (${policyOf(config, type.policy).version}). It discloses nothing from the request to anyone but the person. It has not been sent.`, strength: "standing-policy" }],
          };
        }
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "awaiting_approval", recipient: el.key, submitted: true })),
          drafts: [{ kind: "action.submitted", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${type.short} (${a.id}) was submitted for approval by ${type.approver === "subject" ? subjectOf(config).label : "the holder"}.` }],
        };
      }
      if (cmd.type === "withdraw") {
        if (actor.kind === "system") return refuse("not_permitted", "Only a person withdraws work.");
        if (!["proposed", "awaiting_approval", "approved"].includes(a.state)) return refuse("invalid_state", "Only unsent work can be withdrawn.");
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "withdrawn", withdrawal: { at, reason: "holder" } })),
          drafts: [{ kind: "action.withdrawn", actionId: a.id, audience: ["holder", ...(a.submitted ? subjectSees(config, type) : [])], text: `The holder withdrew ${type.short} (${a.id}). Nothing was sent.` }],
        };
      }
      if (actor.kind === "system") return refuse("not_permitted", "Only a person re-checks unresolved work.");
      if (a.state !== "unresolved") return refuse("invalid_state", "Only an unresolved action can be re-checked.");
      if (a.gap?.kind === "dispatch_uncertain") return refuse("invalid_state", "Delivery is uncertain: record a reconciliation finding first, so nothing is sent twice.");
      const el = recipientEligible(config, type.id, facts);
      if (!el.ok) return refuse("invalid_state", "No authorised recipient is available yet.");
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "proposed", recipient: el.key, gap: null, approval: null, sentAt: null, disclosure: null, submitted: false })),
        drafts: [{ kind: "action.rechecked", actionId: a.id, audience: ["holder"], text: `The holder re-checked ${type.short} (${a.id}). An authorised recipient is available. It returns to proposed and must be submitted and approved again.` }],
      };
    }

    case "approve":
    case "refuse":
    case "revokeApproval": {
      const a = find(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      const type = actionTypeOf(config, a.typeId);
      if (type.standingAuthority) return refuse("invalid_state", "This action is authorised by standing policy, not a per-action approval.");
      let attested = false;
      if (type.approver === "holder") {
        if (!isMemberSelf(actor, owner)) return refuse("not_permitted", "Only the request holder approves this action.");
        const denied = may("approve");
        if (denied) return denied;
      } else {
        const m = partyMayAct(config, subjectOf(config).key, actor, s, now);
        if (!m.ok) return refuse("not_permitted", `Only ${subjectOf(config).label} may approve sharing their own details. ${m.reason}`);
        attested = m.attested;
      }
      const who = type.approver === "subject" ? subjectOf(config).label : "The holder";
      if (cmd.type === "revokeApproval") {
        if (a.state !== "approved") return refuse("invalid_state", "Only an approval that has not been acted on can be revoked here.");
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "withdrawn", withdrawal: { at, reason: "approval_revoked" } })),
          drafts: [{ kind: "approval.revoked", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${who} revoked the approval for ${type.short} (${a.id}) before anything was sent. Nothing will be sent.` }],
        };
      }
      if (a.state !== "awaiting_approval") return refuse("invalid_state", "This action is not awaiting approval.");
      if (cmd.type === "refuse") {
        return { ok: true, state: patch(a.id, (r) => ({ ...r, state: "not_approved" })), drafts: [{ kind: "approval.refused", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${who} did not approve ${type.short} (${a.id}). Nothing was sent.` }] };
      }
      if (!all4(cmd.checks)) return refuse("checks_required", "Approval needs the recipient, purpose, exact fields and authority checks.");
      const el = recipientEligible(config, type.id, facts);
      if (!el.ok) {
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "unresolved", recipient: null, gap: { kind: "no_recipient", at } })),
          drafts: [{ kind: "responsibility.unresolved", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${type.short} (${a.id}) could not be approved: no authorised recipient is available.` }],
        };
      }
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "approved", recipient: el.key, approval: { by, attested, basis: "person", configVersion: config.version, at } })),
        drafts: [{ kind: "approval.recorded", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${who} approved ${type.short} (${a.id}) for ${partyOf(config, el.key).label}, after checking the recipient, purpose, exact fields and authority basis.${attested ? " Recorded on their behalf by a member (attested)." : ""} It has not been sent.` }],
      };
    }

    case "execute": {
      const a = find(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      if (a.state !== "approved") return refuse("invalid_state", a.sentAt ? "This action has already been executed." : "Only an approved action can be executed.");
      const type = actionTypeOf(config, a.typeId);
      const decision = evaluateExecutionAuthority(config, s, a, actor, now);
      if (decision.outcome === "human_review_required") return refuse("stale_authority", `${decision.reasons.join(" ")} Required: ${decision.requiredApprovals.join(", ")}.`);
      if (decision.outcome === "denied") {
        return refuse(decision.reasons.some((r) => r.startsWith("Waiting for")) ? "dependency_unmet" : "not_permitted", decision.reasons.join(" "));
      }
      const el = recipientEligible(config, type.id, facts);
      if (!el.ok) {
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "unresolved", recipient: null, gap: { kind: "no_recipient", at } })),
          drafts: [{ kind: "responsibility.unresolved", actionId: a.id, audience: ["holder", ...subjectSees(config, type)], text: `${type.short} (${a.id}) was not executed: no authorised recipient is available. No substitute is chosen.` }],
        };
      }
      const policy = policyOf(config, type.policy);
      const recipientLabel = partyOf(config, el.key).label;
      const disclosure = { recipient: el.key, recipientLabel, purpose: type.purpose, authority: type.authority.label, policy: { id: policy.id, version: policy.version }, fields: a.fields, withheld: type.withheld, at };
      const key = `${a.id}#${a.attempts.length + 1}`;
      const result = (facts.executor ?? recordOnlyExecutor)({ key, actionId: a.id, actionType: type.id, recipient: el.key, disclosure });
      if (result.status === "uncertain") {
        // Possibly delivered: keep the disclosure on record (it may have happened), never retry, never call it sent.
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "unresolved", gap: { kind: "dispatch_uncertain", at }, disclosure, recipient: el.key, attempts: [...r.attempts, { key, at, result: "uncertain", reason: result.reason, reference: null }] })),
          drafts: [
            { kind: "execution.uncertain", actionId: a.id, audience: ["holder"], text: `Execution attempt ${a.attempts.length + 1} for ${type.short} (${a.id}) has an unknown outcome (${result.reason}). It may have reached ${recipientLabel}; it is not recorded as sent and will not be retried until a person reconciles it.` },
            { kind: "responsibility.unresolved", actionId: a.id, audience: ["holder"], text: `${type.short} (${a.id}) needs reconciliation: confirm with ${recipientLabel} whether it arrived before anything else happens.` },
          ],
        };
      }
      if (result.status === "failed") {
        const attempts = [...a.attempts, { key, at, result: "failed" as const, reason: result.reason, reference: null }];
        const exhausted = !result.retryable || attempts.length >= config.execution.maxAttempts;
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, attempts, ...(exhausted ? { state: "unresolved" as const, gap: { kind: "execution_failed" as const, at } } : {}) })),
          drafts: [
            { kind: "execution.failed", actionId: a.id, audience: ["holder"], text: `Execution attempt ${attempts.length} for ${type.short} (${a.id}) failed (${result.reason}). Nothing is recorded as sent.` },
            ...(exhausted ? [{ kind: "responsibility.unresolved" as const, actionId: a.id, audience: ["holder"], text: `${type.short} (${a.id}) could not be executed. It is unresolved and a person decides what happens next.` }] : []),
          ],
        };
      }
      const labels = a.fields.map((f) => f.label).join(", ");
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "sent", recipient: el.key, sentAt: at, disclosure, attempts: [...r.attempts, { key, at, result: "delivered", reason: null, reference: result.reference }] })),
        drafts: [
          { kind: "execution.attempted", actionId: a.id, audience: ["holder"], text: `Execution attempt ${a.attempts.length + 1} for ${type.short} (${a.id}) was recorded as delivered.${facts.executor ? "" : " Simulation: nothing left the system."}`, strength: actor.kind === "system" ? "standing-policy" : undefined },
          {
            kind: "disclosure.made",
            actionId: a.id,
            audience: actionAudience(config, type),
            text: `${type.short} (${a.id}) was sent to ${recipientLabel}. Purpose: ${type.purpose} Fields disclosed: ${labels}. Authority basis: ${type.authority.label}. Policy: ${policy.label} (${policy.version}). Sending is not receipt.`,
            recipientText: `${type.short} was sent to you. Purpose: ${type.purpose} Fields disclosed to you: ${labels}. Authority basis: ${type.authority.label}. Anything not listed is not shared with you.`,
            strength: actor.kind === "system" ? "standing-policy" : undefined,
          },
        ],
      };
    }

    case "receive":
    case "accept":
    case "decline":
    case "complete": {
      const a = find(cmd.actionId);
      if (!a || a.recipient === null) return refuse("not_found", "No such action.");
      const type = actionTypeOf(config, a.typeId);
      const m = partyMayAct(config, a.recipient, actor, s, now);
      if (!m.ok) return refuse("not_permitted", `Only the recipient may take this step. ${m.reason}`);
      if (recipientUnavailable(a, facts)) return refuse("invalid_state", "The recipient is recorded as unable to act.");
      const recipientLabel = partyOf(config, a.recipient).label;
      const audience = actionAudience(config, type);
      const tag = m.attested ? " Recorded on the recipient's behalf by a member (attested)." : "";
      const d = (kind: EvidenceKind, text: string, recipientText: string): Draft => ({ kind, actionId: a.id, audience, text: text + tag, recipientText: recipientText + tag });
      if (cmd.type === "receive") {
        if (a.state !== "sent") return refuse("invalid_state", "This action is not awaiting receipt.");
        return { ok: true, state: patch(a.id, (r) => ({ ...r, state: "received" })), drafts: [d("receipt.recorded", `${recipientLabel} received ${type.short} (${a.id}). Receipt is not acceptance.`, `You received ${type.short}. Receipt is not acceptance.`)] };
      }
      if (cmd.type === "accept") {
        if (a.state !== "received") return refuse("invalid_state", "This action has not been received.");
        const c = cmd.checks;
        if (!c || !c.scope || !c.conflict || !c.capacity) return refuse("checks_required", "Accepting needs the scope, conflict and capacity checks.");
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "accepted", acceptedAt: at, acceptedBy: { by, attested: m.attested }, noReask: !!cmd.noReask })),
          drafts: [d("acceptance.recorded", `${recipientLabel} accepted ${type.short} (${a.id}). Acceptance is not completion.`, `You accepted ${type.short}. Acceptance is not completion.`)],
        };
      }
      if (cmd.type === "decline") {
        if (a.state !== "received") return refuse("invalid_state", "This action has not been received.");
        if (!config.declineReasons.some((x) => x.id === cmd.reasonId)) return refuse("reason_required", "A decline needs one of the configured reasons.");
        return { ok: true, state: patch(a.id, (r) => ({ ...r, state: "declined", declineReason: cmd.reasonId })), drafts: [d("decline.recorded", `${recipientLabel} declined ${type.short} (${a.id}). Nothing was passed to anyone else.`, `You declined ${type.short}.`)] };
      }
      if (a.state !== "accepted") return refuse("invalid_state", "Only an accepted action can be reported complete.");
      if (type.outcomes.length > 0 && !type.outcomes.some((o) => o.id === cmd.outcomeId)) return refuse("reason_required", "Completion needs one of the configured outcomes.");
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "completed", completedAt: at, outcome: type.outcomes.length > 0 ? cmd.outcomeId! : null })),
        drafts: [d("completion.recorded", `${recipientLabel} reported ${type.short} (${a.id}) as done. Completion is not confirmation and not independent verification.`, `You reported ${type.short} as done.`)],
      };
    }

    case "confirm": {
      const a = find(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      if (a.state !== "completed") return refuse("invalid_state", "Only a completed action can be confirmed.");
      const type = actionTypeOf(config, a.typeId);
      let attested = false;
      if (type.confirmer === "none") return refuse("not_permitted", "Nobody confirms this action on anyone's behalf.");
      if (type.confirmer === "holder") {
        if (!isMemberSelf(actor, owner)) return refuse("not_permitted", "Only the request holder confirms this action.");
      } else {
        const m = partyMayAct(config, subjectOf(config).key, actor, s, now);
        if (!m.ok) return refuse("not_permitted", `Only ${subjectOf(config).label} confirms this. ${m.reason}`);
        attested = m.attested;
      }
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "confirmed", confirmedBy: { by, attested } })),
        drafts: [{ kind: "confirmation.recorded", actionId: a.id, audience: actionAudience(config, type), text: `${type.confirmer === "subject" ? subjectOf(config).label : "The holder"} confirmed ${type.short} (${a.id}). A confirmation is a person's record, not proof that anyone is safe.`, recipientText: `${type.short} was confirmed by the appropriate person.` }],
      };
    }

    case "reconcileDispatch": {
      // Decision D4: a request holder can never independently declare externally verified execution.
      if (actor.kind !== "member" || actor.onBehalfOf) return refuse("not_permitted", "Only an authenticated member reconciles a dispatch, in their own right.");
      const denied = may("reconcile-execution");
      if (denied) return denied;
      const a = find(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      const basis = cmd.basis;
      if (!basis || (basis.kind !== "purpose-grant" && basis.kind !== "core-finding")) return refuse("not_permitted", "A reconciliation needs a stated authority basis.");
      if (basis.kind === "purpose-grant" && actor.id === owner) {
        return refuse("not_permitted", "The request holder cannot verify their own action's delivery; a separate reconciler, or an organisation owner's recorded Core finding, is required.");
      }
      if (basis.kind === "core-finding" && !/^[0-9a-f-]{36}$/.test(basis.findingId)) return refuse("reason_required", "A Core finding basis needs the recorded finding's id.");
      if (a.state !== "unresolved" || a.gap?.kind !== "dispatch_uncertain") return refuse("invalid_state", "Only an uncertain dispatch can be reconciled.");
      if (!/^[A-Za-z0-9][A-Za-z0-9._:#/-]{2,63}$/.test(cmd.evidenceReference) || cmd.evidenceReference.includes("://")) {
        return refuse("reason_required", "A reconciliation needs an evidence reference (an identifier in the receiving system, not a link).");
      }
      if (typeof cmd.account !== "string" || cmd.account.trim().length < 10 || cmd.account.length > 2000) {
        return refuse("reason_required", "A reconciliation needs the reconciler's own account of what the evidence shows.");
      }
      const type = actionTypeOf(config, a.typeId);
      const last = a.attempts[a.attempts.length - 1];
      const who = basis.kind === "core-finding" ? `An organisation owner's Core finding (${basis.findingId})` : "A purpose-scoped reconciler (not the request holder)";
      if (cmd.finding === "verified_delivered") {
        const labels = a.fields.map((f) => f.label).join(", ");
        return {
          ok: true,
          state: patch(a.id, (r) => ({ ...r, state: "sent", gap: null, sentAt: last?.at ?? at })),
          drafts: [
            { kind: "dispatch.reconciled", actionId: a.id, audience: ["holder"], text: `${who} recorded that ${type.short} (${a.id}) was delivered, citing evidence reference ${cmd.evidenceReference}. A recorded finding, not independent verification.` },
            { kind: "disclosure.made", actionId: a.id, audience: actionAudience(config, type), text: `${type.short} (${a.id}) was delivered to ${a.disclosure?.recipientLabel ?? "its recipient"} (reconciled). Fields disclosed: ${labels}. Sending is not receipt.`, recipientText: `${type.short} was sent to you. Fields disclosed to you: ${labels}. Anything not listed is not shared with you.` },
          ],
        };
      }
      return {
        ok: true,
        state: patch(a.id, (r) => ({ ...r, state: "approved", gap: null, disclosure: null })),
        drafts: [{ kind: "dispatch.reconciled", actionId: a.id, audience: ["holder"], text: `${who} recorded that ${type.short} (${a.id}) was not delivered, citing evidence reference ${cmd.evidenceReference}. The unused approval stands; any new attempt gets a new key.` }],
      };
    }

    case "releaseCommunication": {
      if (!isMemberSelf(actor, owner)) return ownerOnly();
      const denied = may("release-communication");
      if (denied) return denied;
      const a = find(cmd.actionId);
      const tpl = config.communications.find((c) => c.id === cmd.templateId);
      if (!a || !tpl || tpl.trigger.actionType !== a.typeId) return refuse("not_found", "No such prepared communication.");
      if (!triggerHolds(tpl.trigger.evidence, a, facts)) return refuse("invalid_state", "This communication is not relevant to the action's current state.");
      if (s.released.some((r) => r.templateId === tpl.id && r.actionId === a.id)) return refuse("invalid_state", "This communication was already released.");
      const to = tpl.to === "subject" ? subjectOf(config).key : tpl.to;
      const type = actionTypeOf(config, a.typeId);
      const body = tpl.body.replace(/\{(\w+)\}/g, (m0, k: string) => (k === "service" ? partyOf(config, type.recipient).label : k === "short" ? type.short : m0));
      return {
        ok: true,
        state: { ...s, released: [...s.released, { templateId: tpl.id, actionId: a.id, at }] },
        drafts: [{ kind: "communication.released", actionId: a.id, audience: ["holder", `party:${to}`], text: `The holder released a prepared message about ${type.short} (${a.id}) to ${partyOf(config, to).label}, built from approved facts only. Nothing was delivered outside JALDO.`, recipientText: body }],
      };
    }
  }
}

/** Whether a communication's configured trigger currently holds for an action (derived, never stored). */
export function triggerHolds(kind: EvidenceKind, a: GovernedAction, facts: Facts): boolean {
  switch (kind) {
    case "disclosure.made":
      return a.sentAt !== null;
    case "acceptance.recorded":
      return a.acceptedAt !== null;
    case "decline.recorded":
      return a.state === "declined";
    case "completion.recorded":
      return a.completedAt !== null;
    case "capacity.lost":
      return a.state === "accepted" && recipientUnavailable(a, facts);
    case "responsibility.unresolved":
      return a.state === "unresolved";
    default:
      return false;
  }
}
