import { actionTypeOf, partyOf, subjectOf, type DeploymentConfiguration } from "../contracts/config";
import type { EvidenceKind, EvidenceRecord } from "../contracts/evidence";
import { CLOSED_STATES, type CoordinationState, type Facts, type FrozenField, type GovernedAction } from "../contracts/orchestration";
import { interruption, isLive, isOverdue, ownerOf, recipientEligible, recipientUnavailable } from "./predicates";
import { recognise, type Recognition } from "./recognition";
import { prepareCoordinationPlan, type CoordinationPlan } from "./plan";
import { subjectConcerned } from "./transitions";

/**
 * Evidence → Assure → (inputs to) Learn.
 *
 * Follow-through keeps four facts apart: the acceptance as recorded, the
 * recipient's current capacity, whether the need is unresolved, and whether
 * anyone confirmed. Projections give each viewer only what is theirs, built
 * from records rather than by filtering a fuller view. Measures keep
 * recorded counts, illustrative assumptions and self-reported evidence
 * apart, and say plainly that nothing is independently verified.
 */

export const FOLLOW_THROUGH_STATES = ["none", "awaiting", "accepted-able", "accepted-lost", "interrupted", "recovery", "confirmed", "declined"] as const;
export type FollowThroughState = (typeof FOLLOW_THROUGH_STATES)[number];

export interface FollowThrough {
  actionType: string;
  state: FollowThroughState;
  actionId: string | null;
  historicalAcceptance: string | null;
  currentCapacity: "able" | "unable" | "not_applicable";
  needUnresolved: boolean;
  recovery: { actionId: string; state: GovernedAction["state"] } | null;
  noEligiblePathway: boolean;
}

export function followThrough(config: DeploymentConfiguration, s: CoordinationState, facts: Facts): FollowThrough[] {
  return config.recognition.recovery.map(({ forType, recoveryType }) => {
    const own = s.actions.filter((a) => !a.heldBack);
    const a = [...own].reverse().find((x) => x.typeId === forType && isLive(x)) ?? null;
    const base: FollowThrough = {
      actionType: forType,
      state: "none",
      actionId: a?.id ?? null,
      historicalAcceptance: a?.acceptedAt ?? null,
      currentCapacity: a && a.sentAt !== null ? (recipientUnavailable(a, facts) ? "unable" : "able") : "not_applicable",
      needUnresolved: false,
      recovery: null,
      noEligiblePathway: false,
    };
    if (!a) return base;
    // A recovery counts once it has been put to its approver; a bare proposal is still the holder's draft.
    const rec = own.find((b) => b.recovers === a.id && isLive(b) && b.submitted) ?? null;
    if (rec) return { ...base, state: rec.state === "confirmed" ? "confirmed" : "recovery", recovery: { actionId: rec.id, state: rec.state }, needUnresolved: rec.state !== "confirmed" };
    const broken = interruption(a, facts);
    if (broken) {
      return { ...base, state: broken === "capacity-lost-after-acceptance" ? "accepted-lost" : "interrupted", needUnresolved: true, noEligiblePathway: !recipientEligible(config, recoveryType, facts).ok };
    }
    if (a.state === "confirmed") return { ...base, state: "confirmed" };
    if (a.state === "declined") return { ...base, state: "declined", needUnresolved: true };
    if (a.state === "accepted" || a.state === "completed") return { ...base, state: "accepted-able" };
    return { ...base, state: "awaiting" };
  });
}

export interface Measures {
  recorded: { decisions: number; sent: number; accepted: number; completed: number; confirmed: number; unresolved: number; outstanding: number };
  illustrative: { label: "illustrative"; minutes: number; potentialRepeatedExplanations: number; potentialManualChases: number; assumption: string };
  /** Moments recognised, counted from the lifecycle record — kept after adoption, dismissal or resolution. */
  recognition: { moments: number; occurrences: number; adopted: number; dismissed: number };
  evidence: {
    recipientRecordedNoReask: { count: number; strength: "self-reported by recipient, not independently verified" };
    personConfirmed: { count: number; strength: "self-reported by the person, not independently verified" };
    attestedRecords: { count: number; strength: "recorded by a member on a party's behalf" };
    standingPolicyRecords: { count: number; strength: "authorised by configured standing policy, not a person" };
    independentVerification: "none";
  };
}

export function measures(config: DeploymentConfiguration, s: CoordinationState, evidence: readonly EvidenceRecord[]): Measures {
  const own = s.actions.filter((a) => !a.heldBack);
  const sent = own.filter((a) => a.sentAt !== null);
  const subject = subjectOf(config).key;
  return {
    recorded: {
      decisions: evidence.filter((e) => (e.kind === "approval.recorded" && e.strength !== "standing-policy") || e.kind === "approval.refused" || e.kind === "recommendation.dismissed").length,
      sent: sent.length,
      accepted: own.filter((a) => a.acceptedAt !== null).length,
      completed: own.filter((a) => a.completedAt !== null).length,
      confirmed: own.filter((a) => a.state === "confirmed").length,
      unresolved: own.filter((a) => a.state === "unresolved").length,
      outstanding: own.filter((a) => isLive(a) && !CLOSED_STATES.includes(a.state)).length,
    },
    illustrative: {
      label: "illustrative",
      minutes: evidence.reduce((sum, e) => sum + (config.measures.illustrativeMinutes[e.kind] ?? 0), 0),
      potentialRepeatedExplanations: sent.filter((a) => a.recipient !== subject).length,
      potentialManualChases: s.moments.filter((m) => m.ruleId !== "request-awaiting").reduce((n, m) => n + m.occurrences, 0),
      assumption: config.measures.assumption,
    },
    recognition: {
      moments: s.moments.length,
      occurrences: s.moments.reduce((n, m) => n + m.occurrences, 0),
      adopted: s.moments.filter((m) => m.status === "adopted").length,
      dismissed: s.moments.filter((m) => m.status === "dismissed").length,
    },
    evidence: {
      recipientRecordedNoReask: { count: own.filter((a) => a.noReask && a.acceptedAt !== null).length, strength: "self-reported by recipient, not independently verified" },
      personConfirmed: { count: own.filter((a) => a.state === "confirmed" && actionTypeOf(config, a.typeId).confirmer === "subject").length, strength: "self-reported by the person, not independently verified" },
      attestedRecords: { count: evidence.filter((e) => e.strength === "attested").length, strength: "recorded by a member on a party's behalf" },
      standingPolicyRecords: { count: evidence.filter((e) => e.strength === "standing-policy").length, strength: "authorised by configured standing policy, not a person" },
      independentVerification: "none",
    },
  };
}

export interface ActionAssurance {
  actionId: string;
  actionType: string;
  state: GovernedAction["state"];
  evidence: { required: EvidenceKind[]; present: EvidenceKind[]; missing: EvidenceKind[] };
  /** Why this action needs someone, if it does. */
  unresolved: string | null;
  /** Who currently owns the next step. */
  nextStepOwner: string;
}

export interface AssuranceState {
  request: "awaiting-acceptance" | "held";
  actions: ActionAssurance[];
  unresolvedResponsibilities: { actionId: string | null; reason: string }[];
  followThrough: FollowThrough[];
  measures: Measures;
  verification: "none";
}

/** Evidence completeness and unresolved responsibility for every action. Assurance, not proof. */
export function deriveAssuranceState(config: DeploymentConfiguration, s: CoordinationState, evidence: readonly EvidenceRecord[], facts: Facts): AssuranceState {
  const own = s.actions.filter((a) => !a.heldBack);
  const unresolvedResponsibilities: { actionId: string | null; reason: string }[] = [];
  if (s.status === "awaiting_acceptance" && !(facts.eligibleHolders ?? []).includes(s.destination)) {
    unresolvedResponsibilities.push({ actionId: null, reason: "The request is addressed to a contact who can no longer hold it. Nobody else has been chosen." });
  }
  const actions = own.map((a): ActionAssurance => {
    const t = actionTypeOf(config, a.typeId);
    const present = [...new Set(evidence.filter((e) => e.actionId === a.id).map((e) => e.kind))];
    const missing = t.evidenceRequired.filter((k) => !present.includes(k));
    const broken = interruption(a, facts);
    let unresolved: string | null = null;
    if (a.state === "unresolved") {
      unresolved =
        a.gap?.kind === "dispatch_uncertain" ? "Delivery is uncertain; reconcile with the recipient before anything else happens."
        : a.gap?.kind === "execution_failed" ? "Execution failed; a person decides what happens next."
        : "No authorised recipient can act.";
    }
    else if (broken === "capacity-lost-after-acceptance") unresolved = "Accepted, but the recipient can no longer act; the need is unresolved.";
    else if (a.state === "declined") unresolved = "Declined; a person decides what happens next.";
    else if (isOverdue(config, a, facts)) unresolved = "The configured operational expectation has passed.";
    if (unresolved) unresolvedResponsibilities.push({ actionId: a.id, reason: unresolved });
    const recipient = partyOf(config, t.recipient).label;
    const approver = t.approver === "subject" ? subjectOf(config).label : "The request holder";
    const nextStepOwner =
      a.state === "awaiting_approval" ? approver
      : ["sent", "received"].includes(a.state) ? recipient
      : a.state === "accepted" ? (broken ? "The request holder" : recipient)
      : a.state === "completed" ? (t.confirmer === "none" ? "Nobody (no confirmation is configured)" : t.confirmer === "subject" ? subjectOf(config).label : "The request holder")
      : CLOSED_STATES.includes(a.state) ? "Nobody" : "The request holder";
    return { actionId: a.id, actionType: a.typeId, state: a.state, evidence: { required: t.evidenceRequired, present, missing }, unresolved, nextStepOwner };
  });
  return {
    request: s.status === "awaiting_acceptance" ? "awaiting-acceptance" : "held",
    actions,
    unresolvedResponsibilities,
    followThrough: followThrough(config, s, facts),
    measures: measures(config, s, evidence),
    verification: "none",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Projections (controlled disclosure)
// ─────────────────────────────────────────────────────────────────────────

export const GENERIC_RESTRICTION = "Anything not listed above is not shared with you.";

export interface HolderView {
  request: FrozenField[];
  actions: GovernedAction[];
  evidence: EvidenceRecord[];
  recognition: Recognition;
  plan: CoordinationPlan;
  assurance: AssuranceState;
}

/** The request owner's view. Null for anyone else — a previous holder, anyone senior and an organisation owner included. */
export function holderView(config: DeploymentConfiguration, s: CoordinationState, evidence: readonly EvidenceRecord[], facts: Facts, memberId: string): HolderView | null {
  if (ownerOf(s) !== memberId) return null;
  const hidden = new Set(s.actions.filter((a) => a.heldBack).map((a) => a.id));
  const visible = evidence.filter((e) => e.audience.includes("holder") && !(e.actionId && hidden.has(e.actionId)));
  return {
    request: s.request,
    actions: s.actions.filter((a) => !a.heldBack),
    evidence: visible,
    recognition: recognise(config, s, facts, memberId),
    plan: prepareCoordinationPlan(config, s, facts),
    assurance: deriveAssuranceState(config, s, visible, facts),
  };
}

export interface RecipientAction {
  id: string;
  label: string;
  state: GovernedAction["state"];
  purpose: string;
  authority: string;
  fields: FrozenField[];
  restriction: string;
  updates: string[];
}

/** What one party sees: only work sent to it, its frozen fields, and its own records as text — no counts, other ids or clock times. */
export function recipientView(config: DeploymentConfiguration, s: CoordinationState, evidence: readonly EvidenceRecord[], partyKey: string): RecipientAction[] {
  return s.actions
    .filter((a) => a.recipient === partyKey && a.sentAt !== null && a.disclosure !== null && !a.heldBack)
    .map((a) => ({
      id: a.id,
      label: actionTypeOf(config, a.typeId).label,
      state: a.state,
      purpose: a.disclosure!.purpose,
      authority: a.disclosure!.authority,
      fields: a.disclosure!.fields,
      restriction: GENERIC_RESTRICTION,
      updates: evidence.filter((e) => e.actionId === a.id && e.audience.includes(`party:${partyKey}`)).map((e) => e.recipientText ?? e.text),
    }));
}

export interface SubjectView {
  request: FrozenField[];
  actions: { id: string; label: string; state: GovernedAction["state"]; wouldShare: FrozenField[]; recipientLabel: string; awaitingYourApproval: boolean }[];
  updates: string[];
}

export function subjectView(config: DeploymentConfiguration, s: CoordinationState, evidence: readonly EvidenceRecord[]): SubjectView {
  const key = subjectOf(config).key;
  const shown = s.actions.filter((a) => subjectConcerned(config, actionTypeOf(config, a.typeId)) && (a.submitted || a.sentAt !== null));
  const shownIds = new Set(shown.map((a) => a.id));
  return {
    request: s.request,
    actions: shown.map((a) => {
      const t = actionTypeOf(config, a.typeId);
      return { id: a.id, label: t.label, state: a.state, wouldShare: a.fields, recipientLabel: partyOf(config, t.recipient).label, awaitingYourApproval: a.state === "awaiting_approval" && t.approver === "subject" };
    }),
    updates: evidence
      .filter((e) => e.audience.includes(`party:${key}`) && (e.actionId === null || shownIds.has(e.actionId)))
      .map((e) => (e.recipientText && (e.kind === "communication.released" || s.actions.find((a) => a.id === e.actionId)?.recipient === key) ? e.recipientText : e.text)),
  };
}
