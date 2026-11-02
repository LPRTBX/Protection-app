import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAuthority,
  followThrough,
  holderView,
  loadConfiguration,
  prepareCoordinationPlan,
  recognise,
  runAnticipatoryCycle,
  subjectView,
  type Actor,
} from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { ACCEPT3, CHECKS4, grant, Harness, SCOPE } from "./harness";

/**
 * Enterprise portability: the brief's scenario on exactly the same kernel as
 * Sport. An employee asks for workplace support; JALDO prepares the plan
 * without anyone choosing a workflow; the provider accepts and later becomes
 * unavailable; JALDO recognises the interrupted support, shows the unresolved
 * responsibility and prepares a governed recovery that needs the employee's
 * fresh approval. A line manager never gains access.
 */

const enterprise = REFERENCE_CONFIGURATIONS["enterprise-psychosocial"];
const sport = REFERENCE_CONFIGURATIONS["sport-integrity"];

function cycle(h: Harness, id: string) {
  const r = runAnticipatoryCycle(enterprise, h.state, h.facts(), id);
  h.state = r.state;
  h.evidence.push(...r.evidence);
  return r.report;
}

describe("Enterprise portability — same kernel, different configuration", () => {
  it("the configurations differ in signals, policies, roles, authority, providers, templates, fields, expectations and evidence", () => {
    const differ = (pick: (c: typeof sport) => unknown) => JSON.stringify(pick(sport)) !== JSON.stringify(pick(enterprise));
    for (const [what, pick] of Object.entries({
      signals: (c: typeof sport) => c.events.map((e) => e.type),
      policies: (c: typeof sport) => c.policies,
      roles: (c: typeof sport) => c.roles,
      authority: (c: typeof sport) => c.actions.map((a) => [a.approver, a.confirmer, a.standingAuthority]),
      providers: (c: typeof sport) => c.parties,
      templates: (c: typeof sport) => c.communications,
      disclosureFields: (c: typeof sport) => c.actions.map((a) => a.fields),
      expectations: (c: typeof sport) => c.expectations,
      evidenceRequirements: (c: typeof sport) => c.actions.map((a) => a.evidenceRequired),
      automation: (c: typeof sport) => c.automation,
    })) assert.ok(differ(pick), `${what} should differ`);
  });

  it("there is one kernel: neither configuration has its own reducer or transition code", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const f of ["../deployments/enterprise/configuration.ts", "../deployments/sport/configuration.ts"]) {
      const body = readFileSync(join(here, f), "utf8");
      assert.ok(!/function|=>|import /.test(body), `${f} must be configuration data only`);
    }
  });

  it("anticipatory operation: a permitted event becomes a prepared plan without anyone selecting a workflow", () => {
    const h = new Harness(enterprise).accepted();
    const report = cycle(h, "c1");
    const byType = Object.fromEntries(h.state.actions.map((a) => [a.typeId, a.state]));
    // Standing policy: guidance to the employee themselves is executed. Everything else stops at its authority boundary.
    assert.deepEqual(byType, { "employee-guidance": "sent", "eap-referral": "awaiting_approval", "workplace-adjustment": "awaiting_approval" });
    assert.ok(report.automated.some((x) => x.startsWith("Executed")));
    const who = report.plan.awaitingHuman.map((x) => x.who);
    assert.ok(who.includes("The employee") && who.includes("The request holder"));
    const guidance = h.actionOf("employee-guidance");
    assert.equal(guidance.approval?.basis, "standing-policy");
    assert.ok(h.evidence.filter((e) => e.actionId === guidance.id).some((e) => e.strength === "standing-policy"));
    // Nothing disclosed to any third party without a person's authority.
    assert.ok(h.state.actions.filter((a) => a.sentAt !== null).every((a) => a.recipient === "employee"));
    // Quiet unless it adds value.
    const again = cycle(h, "c2");
    assert.equal(again.quiet, true);
  });

  it("dependency: the adjustment is approved but waits until the employee has acknowledged the guidance", () => {
    const h = new Harness(enterprise).accepted();
    cycle(h, "c1");
    const adj = h.actionOf("workplace-adjustment");
    h.ok({ type: "approve", actionId: adj.id, checks: CHECKS4 }, h.owner);
    h.refused({ type: "execute", actionId: adj.id }, h.owner, "dependency_unmet");
    const step = prepareCoordinationPlan(enterprise, h.state, h.facts()).steps.find((s) => s.actionType === "workplace-adjustment")!;
    assert.equal(step.status, "blocked");
    assert.deepEqual(step.waitingFor, ["Guidance for the employee accepted"]);
    const g = h.actionOf("employee-guidance");
    h.ok({ type: "receive", actionId: g.id }, h.subject);
    h.ok({ type: "accept", actionId: g.id, checks: ACCEPT3 }, h.subject);
    h.ok({ type: "execute", actionId: adj.id }, h.owner);
    assert.equal(h.action(adj.id).state, "sent");
  });

  it("interrupted support: accepted, then unavailable; acceptance kept; responsibility unresolved; governed recovery prepared", () => {
    const h = new Harness(enterprise).accepted();
    cycle(h, "c1");
    const eap = h.actionOf("eap-referral");
    h.ok({ type: "approve", actionId: eap.id, checks: CHECKS4 }, h.subject);
    h.ok({ type: "execute", actionId: eap.id }, h.owner);
    h.ok({ type: "receive", actionId: eap.id }, h.liaison("member-b", "eap-provider"));
    h.ok({ type: "accept", actionId: eap.id, checks: ACCEPT3 }, h.liaison("member-b", "eap-provider"));
    const acceptedAt = h.action(eap.id).acceptedAt;
    h.capacity("eap-provider", true);
    assert.deepEqual([h.action(eap.id).state, h.action(eap.id).acceptedAt], ["accepted", acceptedAt]);
    const view = holderView(enterprise, h.state, h.evidence, h.facts(), "member-a")!;
    assert.ok(view.assurance.unresolvedResponsibilities.some((u) => u.actionId === eap.id));
    const rec = view.plan.recovery[0];
    assert.equal(rec.pathway?.actionType, "counselling-recovery");
    assert.deepEqual(rec.wouldShare?.fields.map((f) => f.label), ["Who is asking", "Preferred contact"]);
    assert.equal(view.plan.communications[0].templateId, "referral-interrupted");
    // The holder adopts; the employee must authorise the new disclosure.
    h.ok({ type: "propose", actionType: "counselling-recovery", fromRecommendation: rec.id }, h.owner);
    const r = h.actionOf("counselling-recovery");
    h.ok({ type: "submit", actionId: r.id }, h.owner);
    h.refused({ type: "approve", actionId: r.id, checks: CHECKS4 }, h.owner, "not_permitted");
    h.refused({ type: "approve", actionId: r.id, checks: CHECKS4 }, h.liaison("member-b", "employee"), "not_permitted");
    h.ok({ type: "approve", actionId: r.id, checks: CHECKS4 }, h.subject);
    h.ok({ type: "execute", actionId: r.id }, h.owner);
    assert.equal(followThrough(enterprise, h.state, h.facts())[0].state, "recovery");
    assert.ok(subjectView(enterprise, h.state, h.evidence).actions.some((a) => a.id === r.id));
  });

  it("a manager never gains access: no operation, no view, no implied authority over the employee", () => {
    const h = new Harness(enterprise).accepted();
    cycle(h, "c1");
    const manager: Actor = { kind: "member", id: "manager-1", coreRole: "operator", scope: SCOPE, grants: [grant("line-manager")] };
    for (const op of ["hold-request", "prepare", "approve", "execute", "record-party-response", "view-holder"] as const) {
      assert.equal(evaluateAuthority(enterprise, manager, op, SCOPE, h.now).outcome, "denied", op);
    }
    assert.equal(holderView(enterprise, h.state, h.evidence, h.facts(), "manager-1"), null);
    assert.deepEqual(recognise(enterprise, h.state, h.facts(), "manager-1").active, []);
    h.refused({ type: "approve", actionId: h.actionOf("workplace-adjustment").id, checks: CHECKS4 }, manager, "not_found");
    h.refused({ type: "approve", actionId: h.actionOf("eap-referral").id, checks: CHECKS4 }, { ...manager, onBehalfOf: "employee" }, "not_permitted");
    // People operations receives only the adjustment, never the reason or any referral.
    const adj = h.actionOf("workplace-adjustment");
    h.ok({ type: "approve", actionId: adj.id, checks: CHECKS4 }, h.owner);
    const g = h.actionOf("employee-guidance");
    h.ok({ type: "receive", actionId: g.id }, h.subject);
    h.ok({ type: "accept", actionId: g.id, checks: ACCEPT3 }, h.subject);
    h.ok({ type: "execute", actionId: adj.id }, h.owner);
    const disclosed = JSON.stringify(h.action(adj.id).disclosure!.fields);
    for (const f of h.state.request) assert.ok(!disclosed.includes(f.value), `request field "${f.label}" reached people operations`);
  });

  it("the same configuration change changes behaviour: switching off standing authority makes guidance wait for a person", () => {
    const raw = JSON.parse(JSON.stringify(enterprise));
    raw.version = "1.0.1";
    raw.actions.find((a: { id: string }) => a.id === "employee-guidance").standingAuthority = false;
    const h = new Harness(loadConfiguration(raw));
    h.accepted();
    const r = runAnticipatoryCycle(h.config, h.state, h.facts(), "c1");
    assert.equal(r.state.actions.find((a) => a.typeId === "employee-guidance")!.state, "awaiting_approval");
    assert.ok(r.state.actions.every((a) => a.sentAt === null));
  });
});
