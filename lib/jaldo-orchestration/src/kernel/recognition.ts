import { actionTypeOf, expectationFor, partyOf, policyOf, subjectOf, type ActionTypeDefinition, type DeploymentConfiguration, type RuleId } from "../contracts/config";
import type { MomentRecord } from "../contracts/events";
import type { CoordinationState, Facts, FrozenField, GovernedAction } from "../contracts/orchestration";
import { interruption, isLive, isOverdue, ownerOf, recipientEligible, recipientUnavailable } from "./predicates";

/**
 * Recognise → Interpret → Recommend.
 *
 * A *permitted fact* is something recorded in this coordination by whoever
 * may record it. A *moment* is a permitted fact for which an enabled,
 * versioned rule has a recommendation. Recommendations are derived on read:
 * reading creates nothing, scores nobody and reads no other record type.
 * A recommendation cannot execute — adopting one only opens a proposal, and
 * every later step needs its own authority.
 */

export interface Guidance {
  text: string;
  source: string;
}

export interface Recommendation {
  id: string;
  ruleId: RuleId;
  ruleVersion: string;
  actionId: string | null;
  title: string;
  fact: string;
  why: string;
  whoDecides: string;
  guidance: Guidance[];
  unknowns: string[];
  alternatives: { label: string; why: string }[];
  /** The permitted pathway, or null when no eligible pathway exists — said, never hidden. */
  pathway: { actionType: string; label: string; recipientLabel: string; policy: string } | null;
  approvals: string[];
  wouldShare: { recipientLabel: string; purpose: string; authority: string; fields: FrozenField[] } | null;
  reasoningLabel: string;
  dismissed: boolean;
}

export interface Observation {
  id: string;
  actionId: string;
  text: string;
}

export interface Recognition {
  active: Recommendation[];
  dismissed: Recommendation[];
  observations: Observation[];
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

/** The exact fields an action of this type would freeze from the request. */
export function fieldsFor(type: ActionTypeDefinition, request: FrozenField[]): FrozenField[] {
  return type.fields.map((f) => ({
    id: f.id,
    label: f.label,
    value: "fixed" in f.source ? f.source.fixed : (request.find((r) => r.id === (f.source as { requestField: string }).requestField)?.value ?? ""),
  }));
}

/** Configured guidance for a rule, with the policy each action pathway is governed by. */
export function evaluateGuidance(config: DeploymentConfiguration, ruleId: RuleId): Guidance[] {
  return config.recognition.wording[ruleId]?.guidance ?? [];
}

function approvalsFor(config: DeploymentConfiguration, type: ActionTypeDefinition, fresh: boolean): string[] {
  const subject = subjectOf(config);
  const who = type.standingAuthority
    ? `Authorised by standing policy ${policyOf(config, type.policy).label}; no personal details leave the person.`
    : type.approver === "subject"
      ? `${subject.label} approves sharing their own details, through their own channel.`
      : "The request holder approves after checking the recipient, purpose, exact fields and authority basis.";
  const recipient = `${partyOf(config, type.recipient).label} decides whether to accept.`;
  return fresh
    ? [who, "A fresh approval and a fresh disclosure review are required; no earlier approval is reused.", recipient]
    : [who, recipient];
}

/** Recommend one action type as a pathway, or say plainly that none is eligible. */
export function recommendAction(
  config: DeploymentConfiguration,
  state: CoordinationState,
  facts: Facts,
  ruleId: RuleId,
  id: string,
  actionId: string | null,
  vars: Record<string, string>,
  pathwayType: string | null,
  fresh: boolean,
): Recommendation {
  const w = config.recognition.wording[ruleId]!;
  const eligible = pathwayType !== null && recipientEligible(config, pathwayType, facts).ok;
  const t = eligible ? actionTypeOf(config, pathwayType!) : null;
  const none = !eligible && w.noPathway;
  return {
    id,
    ruleId,
    ruleVersion: config.version,
    actionId,
    title: none ? w.noPathway!.title : w.title,
    fact: fill(w.fact, vars),
    why: none ? w.noPathway!.why : w.why,
    whoDecides: w.whoDecides,
    guidance: evaluateGuidance(config, ruleId),
    unknowns: w.unknowns,
    alternatives: w.alternatives,
    pathway: t
      ? { actionType: t.id, label: t.label, recipientLabel: partyOf(config, t.recipient).label, policy: `${policyOf(config, t.policy).label} (${policyOf(config, t.policy).version})` }
      : null,
    approvals: t ? approvalsFor(config, t, fresh) : [],
    wouldShare: t
      ? { recipientLabel: partyOf(config, t.recipient).label, purpose: t.purpose, authority: `${t.authority.label}. ${t.authority.text}`, fields: fieldsFor(t, state.request) }
      : null,
    reasoningLabel: config.recognition.reasoningLabel,
    dismissed: false,
  };
}

/** Interrupted, stalled or unavailable work for one action, if any. */
export function recogniseInterruption(config: DeploymentConfiguration, action: GovernedAction, facts: Facts) {
  return interruption(action, facts) ?? (isOverdue(config, action, facts) ? ("expectation-passed" as const) : null);
}

/** A recovery recommendation for an interrupted action, using the configured recovery mapping. */
export function recommendRecovery(
  config: DeploymentConfiguration,
  state: CoordinationState,
  facts: Facts,
  action: GovernedAction,
  rule: "capacity-lost-after-acceptance" | "unavailable-before-acceptance",
): Recommendation {
  const type = actionTypeOf(config, action.typeId);
  const vars = { ref: action.id, short: type.short, recipient: partyOf(config, type.recipient).label };
  const mapping = config.recognition.recovery.find((m) => m.forType === action.typeId);
  return recommendAction(config, state, facts, rule, `${rule}:${action.id}`, action.id, vars, mapping?.recoveryType ?? null, true);
}

/** Every recommendation the permitted facts support for the request owner; nothing for anyone else. */
export function recognise(config: DeploymentConfiguration, state: CoordinationState, facts: Facts, viewer: string | null): Recognition {
  const owner = ownerOf(state);
  if (!owner || viewer !== owner) return { active: [], dismissed: [], observations: [] };
  const rules = new Set(config.recognition.rules);
  const own = state.actions.filter((a) => !a.heldBack);
  const all: Recommendation[] = [];
  const observations: Observation[] = [];

  const initial = config.recognition.initialResponse;
  if (rules.has("request-awaiting") && initial && !own.some((a) => a.typeId === initial && isLive(a))) {
    all.push(recommendAction(config, state, facts, "request-awaiting", "request-awaiting", null, {}, initial, false));
  }

  for (const a of own) {
    const type = actionTypeOf(config, a.typeId);
    const vars = { ref: a.id, short: type.short, recipient: partyOf(config, type.recipient).label };
    const rule = recogniseInterruption(config, a, facts);
    if (rule === "capacity-lost-after-acceptance" || rule === "unavailable-before-acceptance") {
      if (!rules.has(rule)) continue;
      if (own.some((b) => b.recovers === a.id && isLive(b))) continue; // being recovered: follow-through shows it
      all.push(recommendRecovery(config, state, facts, a, rule));
      continue;
    }
    if (rule === "expectation-passed") {
      // No alternative recipient is chosen automatically: a person decides.
      if (rules.has("expectation-passed")) all.push(recommendAction(config, state, facts, "expectation-passed", `expectation-passed:${a.id}`, a.id, vars, null, false));
      continue;
    }
    if (a.sentAt !== null && ["sent", "received"].includes(a.state) && !expectationFor(config, a.typeId) && !recipientUnavailable(a, facts)) {
      observations.push({
        id: `waiting:${a.id}`,
        actionId: a.id,
        text: `${type.short} (${a.id}) is waiting for ${vars.recipient}. No time expectation is configured for this step, so it is not overdue and nothing is recommended.`,
      });
    }
  }

  const gone = new Set(state.moments.filter((m) => m.status === "dismissed").map((m) => m.id));
  return {
    active: all.filter((r) => !gone.has(r.id)),
    dismissed: all.filter((r) => gone.has(r.id)).map((r) => ({ ...r, dismissed: true })),
    observations,
  };
}

export function activeRecommendation(config: DeploymentConfiguration, state: CoordinationState, facts: Facts, viewer: string, id: string) {
  return recognise(config, state, facts, viewer).active.find((r) => r.id === id) ?? null;
}

/**
 * Keeps the moment lifecycle in step with the facts after a recorded change
 * (never on a read). A new moment is recorded once; an open one is never
 * raised again; one that resolved and recurs is counted as a repeat.
 */
export function syncMoments(config: DeploymentConfiguration, state: CoordinationState, facts: Facts): MomentRecord[] {
  const r = recognise(config, state, facts, ownerOf(state));
  const derived = new Map([...r.active, ...r.dismissed].map((x) => [x.id, x]));
  const at = facts.now.toISOString();
  const next = state.moments.map((m) => {
    const d = derived.get(m.id);
    if (!d && m.status === "recognised") return { ...m, status: "resolved" as const };
    if (d && m.status === "resolved") return { ...m, status: "recognised" as const, occurrences: m.occurrences + 1 };
    return m;
  });
  for (const [id, d] of derived) {
    if (!next.some((m) => m.id === id)) {
      next.push({ id, ruleId: d.ruleId, ruleVersion: d.ruleVersion, actionId: d.actionId, status: "recognised", firstRecognisedAt: at, occurrences: 1 });
    }
  }
  return next;
}
