import assert from "node:assert/strict";
import {
  applyCommand,
  ingestEvent,
  openCoordination,
  subjectOf,
  type Actor,
  type Command,
  type CoordinationState,
  type DeploymentConfiguration,
  type EvidenceRecord,
  type Executor,
  type Facts,
  type Grant,
  type Scope,
} from "../index";

/**
 * Drives a coordination only through the kernel's public operations, as the
 * Core bridge does. Nothing here names an industry: every role, party and
 * action is read from the configuration under test.
 */

export const SCOPE: Scope = { organisationId: "org-1", deploymentId: "dep-1" };
export const OTHER_DEPLOYMENT: Scope = { organisationId: "org-1", deploymentId: "dep-2" };
export const START = new Date("2026-11-02T09:00:00.000Z");

export const roleWith = (config: DeploymentConfiguration, op: string, only = false) =>
  config.roles.find((r) => r.operations.includes(op as never) && (!only || r.operations.length === 1))!.id;

export const grant = (responsibility: string, extra: Partial<Grant> = {}): Grant => ({
  responsibility,
  grantedAt: START.toISOString(),
  expiresAt: null,
  revokedAt: null,
  ...extra,
});

export class Harness {
  state!: CoordinationState;
  evidence: EvidenceRecord[] = [];
  now = START;
  unavailable = new Set<string>();
  eligibleHolders: string[] = ["member-a", "member-b", "member-c"];
  executor: Executor | undefined;
  /** Contract 1.1: "queue" makes execute commit a dispatch intent instead of executing inline. */
  dispatch: "inline" | "queue" | undefined;
  private n = 0;
  readonly holderRole: string;
  readonly liaisonRole: string;
  readonly intakeRole: string;

  constructor(readonly config: DeploymentConfiguration, destination = "member-a", eligibleHolders?: string[]) {
    if (eligibleHolders) this.eligibleHolders = eligibleHolders;
    this.holderRole = roleWith(config, "hold-request");
    this.liaisonRole = roleWith(config, "record-party-response");
    this.intakeRole = roleWith(config, "prepare", true);
    const r = openCoordination(config, this.requestEvent(), { destination }, this.subject, this.facts());
    assert.ok(r.ok, r.ok ? "" : r.message);
    this.state = r.state;
    this.evidence.push(...r.evidence);
  }

  requestEvent(overrides: Record<string, unknown> = {}) {
    const def = this.config.events.find((e) => e.effect === "open-request")!;
    return {
      schema: "jaldo.event",
      id: "evt-request-1",
      idempotencyKey: "request-1",
      type: def.type,
      occurredAt: START.toISOString(),
      scope: SCOPE,
      source: { system: "test" },
      provenance: { method: "party-channel" },
      purpose: def.purpose,
      classification: def.maxClassification,
      context: Object.fromEntries(this.config.request.fields.map((f) => [f.id, `${f.label} (fictional)`])),
      ...overrides,
    };
  }

  capacityEvent(party: string, status: "available" | "unavailable", key = `cap-${++this.n}`) {
    const def = this.config.events.find((e) => e.effect === "capacity-change")!;
    return {
      schema: "jaldo.event",
      id: `evt-${key}`,
      idempotencyKey: key,
      type: def.type,
      occurredAt: this.now.toISOString(),
      scope: SCOPE,
      source: { system: "test" },
      provenance: { method: "member-recorded" },
      purpose: def.purpose,
      classification: "internal",
      context: { party, status },
    };
  }

  get subject(): Actor {
    return { kind: "party", key: subjectOf(this.config).key, scope: SCOPE };
  }
  party(key: string): Actor {
    return { kind: "party", key, scope: SCOPE };
  }
  /** A holder-capable member. */
  member(id: string, extra: Partial<Grant> = {}, scope = SCOPE): Actor {
    return { kind: "member", id, coreRole: "operator", scope, grants: [grant(this.holderRole, extra)] };
  }
  /** A member who may record a party's response on its behalf. */
  liaison(id: string, onBehalfOf: string): Actor {
    // A configuration may split party responses and capacity across separate responsibilities
    // (e.g. sport-safeguarding); the test liaison carries each responsibility the scenario needs.
    const roles = [...new Set([this.liaisonRole, roleWith(this.config, "record-capacity")])];
    return { kind: "member", id, coreRole: "operator", scope: SCOPE, grants: roles.map((r) => grant(r)), onBehalfOf };
  }
  get system(): Actor {
    return { kind: "system", scope: SCOPE };
  }
  get owner() {
    return this.member("member-a");
  }

  facts(): Facts {
    return { now: this.now, unavailable: this.unavailable, eligibleHolders: this.eligibleHolders, ...(this.executor ? { executor: this.executor } : {}), ...(this.dispatch ? { dispatch: this.dispatch } : {}) };
  }

  advanceDays(days: number) {
    this.now = new Date(this.now.getTime() + days * 86_400_000);
  }

  run(command: Command, actor: Actor, id = `cmd-${++this.n}`, expectedSequence?: number) {
    const r = applyCommand(this.config, this.state, { id, command, ...(expectedSequence !== undefined ? { expectedSequence } : {}) }, actor, this.facts());
    if (r.ok) {
      this.state = r.state;
      this.evidence.push(...r.evidence);
    }
    return r;
  }

  ok(command: Command, actor: Actor, id?: string) {
    const r = this.run(command, actor, id);
    assert.ok(r.ok, `expected ${command.type} to succeed: ${r.ok ? "" : `${r.code} ${r.message}`}`);
    return r;
  }

  refused(command: Command, actor: Actor, code?: string) {
    const before = this.state;
    const n = this.evidence.length;
    const r = this.run(command, actor);
    assert.equal(r.ok, false, `expected ${command.type} to be refused`);
    if (code && !r.ok) assert.equal(r.code, code, r.ok ? "" : r.message);
    assert.equal(this.state, before, "a refused command must not change state");
    assert.equal(this.evidence.length, n, "a refused command must not write evidence");
    return r;
  }

  capacity(party: string, unavailable: boolean) {
    if (unavailable) this.unavailable.add(party);
    else this.unavailable.delete(party);
    const r = ingestEvent(this.config, this.state, this.capacityEvent(party, unavailable ? "unavailable" : "available"), this.liaison("member-b", party), this.facts());
    assert.ok(r.ok, r.ok ? "" : r.message);
    this.state = r.state;
    this.evidence.push(...r.evidence);
  }

  action(id: string) {
    return this.state.actions.find((a) => a.id === id)!;
  }
  actionOf(typeId: string) {
    return [...this.state.actions].reverse().find((a) => a.typeId === typeId && !a.heldBack)!;
  }
  lastActionId() {
    return this.state.actions[this.state.actions.length - 1].id;
  }

  accepted() {
    this.ok({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, this.owner);
    return this;
  }
}

export const CHECKS4 = { recipient: true, purpose: true, fields: true, authority: true };
export const ACCEPT3 = { scope: true, conflict: true, capacity: true };

/** The configured shape a portable test needs: subject, recovery mapping, an expectation, the first plan step. */
export function shape(config: DeploymentConfiguration) {
  const recovery = config.recognition.recovery[0];
  const support = config.actions.find((a) => a.id === recovery.forType)!;
  const rec = config.actions.find((a) => a.id === recovery.recoveryType)!;
  const exp = config.expectations[0];
  const expType = config.actions.find((a) => a.id === exp.actionType)!;
  return {
    subject: subjectOf(config).key,
    support: support.id,
    supportRecipient: support.recipient,
    recovery: rec.id,
    recoveryRecipient: rec.recipient,
    expectType: expType.id,
    expectRecipient: expType.recipient,
    expectDays: exp.days,
    expectPrereqs: expType.prerequisites,
  };
}

/** Drive the subject-approved support action to accepted, recipient responses attested by member-b. */
export function supportAccepted(h: Harness) {
  const s = shape(h.config);
  const existing = h.state.actions.find((a) => a.typeId === s.support && !a.heldBack && !["withdrawn", "not_approved"].includes(a.state));
  if (!existing) h.ok({ type: "propose", actionType: s.support }, h.owner);
  const id = h.actionOf(s.support).id;
  if (h.action(id).state === "proposed") h.ok({ type: "submit", actionId: id }, h.owner);
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
  h.ok({ type: "execute", actionId: id }, h.owner);
  h.ok({ type: "receive", actionId: id }, h.liaison("member-b", s.supportRecipient));
  h.ok({ type: "accept", actionId: id, checks: ACCEPT3, noReask: true }, h.liaison("member-b", s.supportRecipient));
  return id;
}

/** Satisfy an action type's prerequisites by driving each to its required state (holder approves, subject/party act). */
export function satisfyPrerequisites(h: Harness, typeId: string) {
  for (const pre of h.config.actions.find((a) => a.id === typeId)!.prerequisites) {
    let a = h.state.actions.find((x) => x.typeId === pre.actionType && !x.heldBack && !["withdrawn", "not_approved"].includes(x.state));
    if (!a) {
      h.ok({ type: "propose", actionType: pre.actionType }, h.owner);
      a = h.actionOf(pre.actionType);
    }
    const t = h.config.actions.find((x) => x.id === pre.actionType)!;
    const recipient: Actor = t.recipient === shape(h.config).subject ? h.subject : h.liaison("member-b", t.recipient);
    if (h.action(a.id).state === "proposed") h.ok({ type: "submit", actionId: a.id }, h.owner);
    if (h.action(a.id).state === "awaiting_approval") h.ok({ type: "approve", actionId: a.id, checks: CHECKS4 }, t.approver === "subject" ? h.subject : h.owner);
    if (h.action(a.id).state === "approved") h.ok({ type: "execute", actionId: a.id }, h.owner);
    if (h.action(a.id).state === "sent") h.ok({ type: "receive", actionId: a.id }, recipient);
    if (h.action(a.id).state === "received") h.ok({ type: "accept", actionId: a.id, checks: ACCEPT3 }, recipient);
  }
}
