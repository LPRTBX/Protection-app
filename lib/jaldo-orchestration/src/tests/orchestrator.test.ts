import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateMoment, subjectOf, type Actor, type Command, type CoordinationState, type DeploymentConfiguration, type EvidenceRecord, type Executor, type Facts, type Trigger } from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { ACCEPT3, CHECKS4, grant, SCOPE, START } from "./harness";

/**
 * One-Moment Orchestrator demonstrations. Everything below goes through the
 * single entry point `orchestrateMoment` — events, people's commands and the
 * clock — for a Sport interruption and a Travel service-recovery
 * interruption, with the same engine and no vertical code.
 */

class Moment {
  state: CoordinationState | null = null;
  evidence: EvidenceRecord[] = [];
  now = START;
  unavailable = new Set<string>();
  executor: Executor | undefined;
  private n = 0;
  constructor(readonly config: DeploymentConfiguration) {}
  get holderRole() {
    return this.config.roles.find((r) => r.operations.includes("hold-request"))!.id;
  }
  get liaisonRole() {
    return this.config.roles.find((r) => r.operations.includes("record-party-response"))!.id;
  }
  member(id: string, onBehalfOf?: string): Actor {
    return { kind: "member", id, coreRole: "operator", scope: SCOPE, grants: [grant(onBehalfOf ? this.liaisonRole : this.holderRole)], ...(onBehalfOf ? { onBehalfOf } : {}) };
  }
  get subject(): Actor {
    return { kind: "party", key: subjectOf(this.config).key, scope: SCOPE };
  }
  facts(): Facts {
    return { now: this.now, unavailable: this.unavailable, eligibleHolders: ["holder", "liaison"], ...(this.executor ? { executor: this.executor } : {}) };
  }
  fire(trigger: Trigger) {
    const r = orchestrateMoment(this.config, this.state, trigger, this.facts(), `cycle-${++this.n}`);
    assert.ok(r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
    this.state = r.state;
    this.evidence.push(...r.evidence);
    return r.report;
  }
  attempt(trigger: Trigger) {
    return orchestrateMoment(this.config, this.state, trigger, this.facts(), `cycle-${++this.n}`);
  }
  cmd(command: Command, actor: Actor) {
    return this.fire({ kind: "command", envelope: { id: `c-${++this.n}`, command }, actor });
  }
  request(key = "req-1") {
    const def = this.config.events.find((e) => e.effect === "open-request")!;
    return {
      schema: "jaldo.event", id: `evt-${key}`, idempotencyKey: key, type: def.type, occurredAt: this.now.toISOString(),
      scope: SCOPE, source: { system: "test" }, provenance: { method: "party-channel" }, purpose: def.purpose, classification: def.maxClassification,
      context: Object.fromEntries(this.config.request.fields.map((f) => [f.id, `${f.label} (fictional)`])),
    };
  }
  capacity(party: string, status: "available" | "unavailable", key: string) {
    if (status === "unavailable") this.unavailable.add(party);
    else this.unavailable.delete(party);
    const def = this.config.events.find((e) => e.effect === "capacity-change")!;
    const event = { schema: "jaldo.event", id: `evt-${key}`, idempotencyKey: key, type: def.type, occurredAt: this.now.toISOString(), scope: SCOPE, source: { system: "test" }, provenance: { method: "member-recorded" }, purpose: def.purpose, classification: "internal", context: { party, status } };
    return this.fire({ kind: "event", event, actor: this.member("liaison", party) });
  }
  action(typeId: string) {
    return [...this.state!.actions].reverse().find((a) => a.typeId === typeId && !a.heldBack)!;
  }
}

/** Shared: open, accept responsibility, approve the service action as the subject, deliver, and the service accepts. */
function serviceAccepted(m: Moment, serviceType: string, prepareByHand: boolean) {
  const opened = m.fire({ kind: "event", event: m.request(), actor: m.subject, routing: { destination: "holder" } });
  assert.deepEqual(opened.automated, [], "nothing can happen before a person accepts responsibility");
  assert.ok(opened.awaitingHuman.some((x) => x.what.startsWith("Accept responsibility")));
  const accepted = m.cmd({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, m.member("holder"));
  if (prepareByHand) {
    assert.deepEqual(accepted.automated.filter((x) => x.startsWith("Prepared")), [], "this configuration does not prepare plans automatically");
    m.cmd({ type: "propose", actionType: serviceType }, m.member("holder"));
    m.cmd({ type: "submit", actionId: m.action(serviceType).id }, m.member("holder"));
  } else {
    assert.ok(accepted.automated.some((x) => x === `Prepared ${serviceType}`), "the plan is prepared without anyone choosing a workflow");
  }
  const service = m.action(serviceType);
  assert.equal(service.state, "awaiting_approval", "stops at the authority boundary");
  const recipient = service.recipient!;
  m.cmd({ type: "approve", actionId: service.id, checks: CHECKS4 }, m.subject);
  m.cmd({ type: "execute", actionId: service.id }, m.member("holder"));
  m.cmd({ type: "receive", actionId: service.id }, m.member("liaison", recipient));
  m.cmd({ type: "accept", actionId: service.id, checks: ACCEPT3 }, m.member("liaison", recipient));
  return { id: service.id, recipient };
}

function interruptionAndRecovery(m: Moment, serviceType: string, prepareByHand: boolean) {
  const { id, recipient } = serviceAccepted(m, serviceType, prepareByHand);
  const acceptedAt = m.state!.actions.find((a) => a.id === id)!.acceptedAt;
  m.now = new Date(m.now.getTime() + 3_600_000);
  const report = m.capacity(recipient, "unavailable", "cap-1");
  const a = m.state!.actions.find((x) => x.id === id)!;
  // Delivery, acceptance and current capacity stay separate; nothing is completed on anyone's behalf.
  assert.deepEqual([a.state, a.acceptedAt, a.completedAt, a.confirmedBy], ["accepted", acceptedAt, null, null]);
  assert.ok(report.unresolved.some((u) => u.actionId === id), "the unresolved dependency is recognised");
  const rec = report.plan.recovery[0];
  assert.ok(rec?.pathway, "a permitted recovery is prepared");
  assert.notEqual(rec.pathway!.actionType, serviceType);
  assert.ok(report.plan.communications.length > 0, "a message to the person is prepared, not sent");
  assert.ok(!m.evidence.some((e) => e.kind === "communication.released"));
  // No invented recipient: nothing new was proposed, approved or sent by itself.
  const before = m.state!.actions.length;
  assert.ok(!report.automated.some((x) => x.startsWith("Executed")));
  assert.equal(before, m.state!.actions.length);
  // Duplicate delivery of the capacity event: quiet.
  const dup = m.capacity(recipient, "unavailable", "cap-1");
  assert.equal(dup.duplicate, true);
  assert.equal(dup.quiet, true);
  // A person adopts the recovery; the subject must approve afresh; the earlier approval is never reused.
  m.cmd({ type: "propose", actionType: rec.pathway!.actionType, fromRecommendation: rec.id }, m.member("holder"));
  const r = m.action(rec.pathway!.actionType);
  assert.deepEqual([r.recovers, r.approval], [id, null]);
  m.cmd({ type: "submit", actionId: r.id }, m.member("holder"));
  const early = m.attempt({ kind: "command", envelope: { id: "early-exec", command: { type: "execute", actionId: r.id } }, actor: m.member("holder") });
  assert.ok(!early.ok, "a recovery cannot execute on the earlier approval");
  const byHolder = m.attempt({ kind: "command", envelope: { id: "holder-approves", command: { type: "approve", actionId: r.id, checks: CHECKS4 } }, actor: m.member("holder") });
  assert.ok(!byHolder.ok, "only the person approves a new disclosure of their own details");
  m.cmd({ type: "approve", actionId: r.id, checks: CHECKS4 }, m.subject);
  m.cmd({ type: "execute", actionId: r.id }, m.member("holder"));
  assert.equal(m.action(rec.pathway!.actionType).state, "sent");
  return { id, recoveryId: r.id };
}

describe("One-Moment Orchestrator — one engine, two verticals", () => {
  it("Sport interruption: support accepted, service lost, recovery prepared and freshly authorised", () => {
    const m = new Moment(REFERENCE_CONFIGURATIONS["sport-integrity"]);
    interruptionAndRecovery(m, "parent-support", true);
  });

  it("Travel service-recovery interruption: transfer accepted, partner lost, alternative prepared and freshly authorised", () => {
    const m = new Moment(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
    interruptionAndRecovery(m, "transfer-booking", false);
    // Safe work done under existing authority: the guest's own update went out under standing policy.
    const upd = m.action("guest-update");
    assert.deepEqual([upd.state, upd.approval?.basis, upd.recipient], ["sent", "standing-policy", "guest"]);
    // The room hold waits for a person.
    assert.equal(m.action("late-checkout-hold").state, "awaiting_approval");
  });

  it("time passing is a trigger too: an overdue expectation is recognised by a tick and nothing is chased", () => {
    const m = new Moment(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
    m.fire({ kind: "event", event: m.request(), actor: m.subject, routing: { destination: "holder" } });
    m.cmd({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, m.member("holder"));
    const hold = m.action("late-checkout-hold");
    m.cmd({ type: "approve", actionId: hold.id, checks: CHECKS4 }, m.member("holder"));
    m.cmd({ type: "execute", actionId: hold.id }, m.member("holder"));
    assert.equal(m.fire({ kind: "tick" }).quiet, true, "quiet unless JALDO adds value");
    m.now = new Date(m.now.getTime() + 86_400_000);
    const tick = m.fire({ kind: "tick" });
    assert.equal(tick.quiet, false);
    assert.ok(tick.recognised.some((r) => r.ruleId === "expectation-passed" && r.pathway === null));
    assert.ok(tick.awaitingHuman.some((x) => x.who === "The request holder"));
  });

  it("an uncertain dispatch is never fabricated into delivery", () => {
    const m = new Moment(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
    m.fire({ kind: "event", event: m.request(), actor: m.subject, routing: { destination: "holder" } });
    m.executor = () => ({ status: "uncertain", reason: "timeout_after_send" });
    const accepted = m.cmd({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, m.member("holder"));
    const upd = m.action("guest-update");
    assert.deepEqual([upd.state, upd.gap?.kind, upd.sentAt], ["unresolved", "dispatch_uncertain", null]);
    assert.ok(accepted.unresolved.some((u) => u.actionId === upd.id));
    assert.equal(m.fire({ kind: "tick" }).automated.filter((x) => x.startsWith("Executed")).length, 0, "never retried automatically");
  });

  it("an event outside the configuration is refused before anything is recorded", () => {
    const m = new Moment(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
    const r = orchestrateMoment(m.config, null, { kind: "event", event: { ...m.request(), classification: "sensitive" }, actor: m.subject, routing: { destination: "holder" } }, m.facts(), "c");
    assert.equal(r.ok, false);
  });

  it("the orchestration is not copied into verticals: every deployment configuration is data only", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../deployments");
    const configs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name, "configuration.ts"));
    assert.ok(configs.length >= 3);
    for (const f of configs) assert.ok(!/function|=>|import /.test(readFileSync(f, "utf8")), `${f} must be configuration data only`);
  });
});
