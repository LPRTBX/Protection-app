import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actionTypeOf,
  deriveAssuranceState,
  followThrough,
  GENERIC_RESTRICTION,
  holderView,
  measures,
  prepareCoordinationPlan,
  recipientView,
  recognise,
  recogniseMoment,
  subjectView,
  JALDO_ORCHESTRATION_CONTRACT_VERSION,
} from "../index";
import { PORTABILITY_CONFIGURATIONS, REFERENCE_CONFIGURATIONS } from "../deployments";
import { ACCEPT3, CHECKS4, Harness, satisfyPrerequisites, shape, supportAccepted } from "./harness";

/**
 * The portability proof: every scenario below runs unchanged against every
 * reference configuration (Sport and Enterprise) through the same kernel.
 * Nothing in this file names an industry, role or service.
 */

// Every reference configuration AND the Stage 6B.2 portability configurations, unchanged (ADR-0037 D-7).
for (const config of [...Object.values(REFERENCE_CONFIGURATIONS), ...Object.values(PORTABILITY_CONFIGURATIONS)]) {
  const s = shape(config);

  describe(`orchestration kernel — ${config.id}@${config.version}`, () => {
    it("pins contract, configuration and scope on the coordination and evidences the permitted event", () => {
      const h = new Harness(config);
      assert.equal(h.state.contractVersion, JALDO_ORCHESTRATION_CONTRACT_VERSION, "a coordination records the contract it was created under");
      assert.deepEqual(h.state.config, { id: config.id, version: config.version });
      assert.deepEqual(h.state.scope, { organisationId: "org-1", deploymentId: "dep-1" });
      assert.deepEqual(h.evidence.map((e) => e.kind), ["event.recorded", "request.opened"]);
      assert.deepEqual(h.evidence.map((e) => e.sequence), [1, 2]);
      assert.ok(h.evidence.every((e) => e.provenance.configVersion === config.version && e.provenance.eventId === "evt-request-1"));
    });

    it("a request is owned only after the addressed member accepts it with all three checks", () => {
      const h = new Harness(config);
      h.refused({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.member("member-b"), "not_found");
      h.refused({ type: "acceptRequest", checks: { authority: true, noConflict: false, capacity: true } }, h.owner, "checks_required");
      h.refused({ type: "propose", actionType: s.support }, h.owner, "not_permitted");
      h.accepted();
      assert.equal(h.state.owner, "member-a");
      h.refused({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.owner, "invalid_state");
    });

    it("recognition and the plan are derived on read, visible only to the owner, and reading records nothing", () => {
      const h = new Harness(config).accepted();
      const before = JSON.stringify(h.state);
      const plan = prepareCoordinationPlan(config, h.state, h.facts());
      assert.deepEqual(plan.steps.map((x) => x.actionType), config.recognition.plan);
      assert.ok(plan.steps.every((x) => x.status === "to-prepare"));
      recogniseMoment(config, h.state, h.facts());
      assert.deepEqual(recognise(config, h.state, h.facts(), "member-b").active, []);
      assert.equal(JSON.stringify(h.state), before);
    });

    it("recommended is not authorised: adopting a recommendation only opens a proposal", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.capacity(s.supportRecipient, true);
      const rec = recognise(config, h.state, h.facts(), "member-a").active.find((r) => r.actionId === id)!;
      h.ok({ type: "propose", actionType: rec.pathway!.actionType, fromRecommendation: rec.id }, h.owner);
      const a = h.action(h.lastActionId());
      assert.equal(a.state, "proposed");
      assert.equal(a.approval, null);
      assert.equal(a.sentAt, null);
      assert.equal(h.state.moments.find((m) => m.id === rec.id)?.status, "adopted");
    });

    it("'not now' is a recorded human decision; the moment is kept and never re-raised", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.capacity(s.supportRecipient, true);
      const recId = `capacity-lost-after-acceptance:${id}`;
      h.ok({ type: "dismissRecommendation", recommendationId: recId }, h.owner);
      assert.ok(!recognise(config, h.state, h.facts(), "member-a").active.some((r) => r.id === recId));
      h.refused({ type: "dismissRecommendation", recommendationId: recId }, h.owner, "not_recommended");
      assert.equal(h.state.moments.find((m) => m.id === recId)?.status, "dismissed");
      assert.equal(measures(config, h.state, h.evidence).recognition.dismissed, 1);
    });

    it("only the subject approves sharing their own details; attestation for the subject is refused", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.refused({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner, "not_permitted");
      h.refused({ type: "approve", actionId: id, checks: CHECKS4 }, h.liaison("member-b", s.subject), "not_permitted");
      h.refused({ type: "approve", actionId: id, checks: { ...CHECKS4, fields: false } }, h.subject, "checks_required");
      h.refused({ type: "execute", actionId: id }, h.owner, "invalid_state");
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      assert.equal(h.action(id).approval?.basis, "person");
      assert.equal(h.action(id).sentAt, null, "approved is not sent");
    });

    it("execution freezes exactly the configured fields, policy and authority; a repeat has no second effect", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      const a = h.action(id);
      const type = actionTypeOf(config, s.support);
      assert.deepEqual(a.disclosure!.fields.map((f) => f.id), type.fields.map((f) => f.id));
      assert.equal(a.disclosure!.purpose, type.purpose);
      assert.equal(a.disclosure!.policy.id, type.policy);
      assert.deepEqual(a.disclosure!.withheld, type.withheld);
      assert.equal(a.attempts.length, 1);
      h.refused({ type: "execute", actionId: id }, h.owner, "invalid_state");
      h.refused({ type: "accept", actionId: id, checks: ACCEPT3 }, h.liaison("member-b", s.supportRecipient), "invalid_state");
    });

    it("the holder cannot attest a party's response to their own action (separation of duties)", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.ok({ type: "execute", actionId: id }, h.owner);
      h.refused({ type: "receive", actionId: id }, { ...h.liaison("member-a", s.supportRecipient), grants: [...(h.owner as { grants: never[] }).grants, ...(h.liaison("x", "y") as { grants: never[] }).grants] }, "not_permitted");
      h.refused({ type: "receive", actionId: id }, h.member("member-b"), "not_found");
      h.ok({ type: "receive", actionId: id }, h.party(s.supportRecipient));
    });

    it("interrupted support keeps the historical acceptance beside current capacity and shows the unresolved need", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      const acceptedAt = h.action(id).acceptedAt;
      h.advanceDays(1);
      h.capacity(s.supportRecipient, true);
      const a = h.action(id);
      assert.equal(a.state, "accepted");
      assert.equal(a.acceptedAt, acceptedAt);
      const ft = followThrough(config, h.state, h.facts())[0];
      assert.deepEqual([ft.state, ft.currentCapacity, ft.historicalAcceptance, ft.needUnresolved], ["accepted-lost", "unable", acceptedAt, true]);
      const assurance = deriveAssuranceState(config, h.state, h.evidence, h.facts());
      assert.ok(assurance.unresolvedResponsibilities.some((u) => u.actionId === id));
      h.refused({ type: "complete", actionId: id }, h.liaison("member-b", s.supportRecipient), "invalid_state");
    });

    it("recovery is a new action with fresh approval and a fresh disclosure — never a silent replacement", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.refused({ type: "propose", actionType: s.recovery }, h.owner, "not_recommended");
      h.capacity(s.supportRecipient, true);
      const rec = recognise(config, h.state, h.facts(), "member-a").active.find((r) => r.actionId === id)!;
      assert.equal(rec.pathway?.actionType, s.recovery);
      assert.ok(rec.approvals.some((x) => x.includes("fresh approval")));
      assert.equal(h.state.actions.length, 1, "recognition never creates an action");
      h.ok({ type: "propose", actionType: s.recovery, fromRecommendation: rec.id }, h.owner);
      const r = h.action(h.lastActionId());
      assert.equal(r.recovers, id);
      assert.deepEqual([r.approval, r.disclosure], [null, null]);
      assert.equal(followThrough(config, h.state, h.facts())[0].state, "accepted-lost", "a bare proposal is still the holder's draft");
      h.ok({ type: "submit", actionId: r.id }, h.owner);
      assert.equal(followThrough(config, h.state, h.facts())[0].state, "recovery");
      h.refused({ type: "execute", actionId: r.id }, h.owner, "invalid_state");
      h.ok({ type: "approve", actionId: r.id, checks: CHECKS4 }, h.subject);
      h.ok({ type: "execute", actionId: r.id }, h.owner);
      assert.notDeepEqual(h.action(r.id).disclosure!.recipient, h.action(id).disclosure!.recipient);
      const view = recipientView(config, h.state, h.evidence, s.recoveryRecipient);
      assert.equal(view.length, 1);
      assert.ok(!JSON.stringify(view).includes(id), "the recovery recipient is not told an earlier request existed");
    });

    it("no eligible alternative: JALDO says so and offers nothing", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.capacity(s.recoveryRecipient, true);
      h.capacity(s.supportRecipient, true);
      const rec = recognise(config, h.state, h.facts(), "member-a").active.find((r) => r.actionId === id)!;
      assert.deepEqual([rec.pathway, rec.wouldShare], [null, null]);
      assert.equal(rec.title, config.recognition.wording["capacity-lost-after-acceptance"]!.noPathway!.title);
      assert.equal(followThrough(config, h.state, h.facts())[0].noEligiblePathway, true);
      h.refused({ type: "propose", actionType: s.recovery, fromRecommendation: rec.id }, h.owner, "not_recommended");
    });

    it("a recipient unavailable before accepting leaves the work unresolved; re-check needs a fresh approval", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.ok({ type: "execute", actionId: id }, h.owner);
      h.capacity(s.supportRecipient, true);
      assert.deepEqual([h.action(id).state, h.action(id).gap?.kind], ["unresolved", "recipient_unavailable"]);
      assert.equal(followThrough(config, h.state, h.facts())[0].state, "interrupted");
      h.refused({ type: "recheck", actionId: id }, h.owner, "invalid_state");
      h.capacity(s.supportRecipient, false);
      h.ok({ type: "recheck", actionId: id }, h.owner);
      assert.deepEqual([h.action(id).state, h.action(id).approval], ["proposed", null]);
    });

    it("a configured expectation is recognised only once it has passed; nothing else is ever called overdue", () => {
      const h = new Harness(config).accepted();
      satisfyPrerequisites(h, s.expectType);
      h.ok({ type: "propose", actionType: s.expectType }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
      h.ok({ type: "execute", actionId: id }, h.owner);
      h.advanceDays(s.expectDays - 1);
      const ids = () => recognise(config, h.state, h.facts(), "member-a").active.map((r) => r.ruleId);
      assert.ok(!ids().includes("expectation-passed"));
      h.advanceDays(1);
      const rec = recognise(config, h.state, h.facts(), "member-a").active.find((r) => r.ruleId === "expectation-passed")!;
      assert.equal(rec.pathway, null, "no alternative recipient is chosen automatically");
      const sid = supportAccepted(h);
      h.advanceDays(30);
      assert.ok(!recognise(config, h.state, h.facts(), "member-a").active.some((x) => x.actionId === sid));
    });

    it("controlled disclosure: each party sees only its own work, generic restrictions and no ids or clock times", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      satisfyPrerequisites(h, s.expectType);
      h.ok({ type: "propose", actionType: s.expectType }, h.owner);
      const other = h.lastActionId();
      h.ok({ type: "submit", actionId: other }, h.owner);
      h.ok({ type: "approve", actionId: other, checks: CHECKS4 }, h.owner);
      h.ok({ type: "execute", actionId: other }, h.owner);
      const v = recipientView(config, h.state, h.evidence, s.supportRecipient);
      assert.deepEqual(v.map((x) => x.id), [id]);
      assert.equal(v[0].restriction, GENERIC_RESTRICTION);
      const text = JSON.stringify(v);
      assert.ok(!text.includes(other));
      for (const w of actionTypeOf(config, s.support).withheld) assert.ok(!text.includes(w), `withheld item named to recipient: ${w}`);
      assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(text), "no clock times in a recipient view");
      assert.deepEqual(recipientView(config, h.state, h.evidence, s.expectRecipient).map((x) => x.id), [other]);
      const sv = subjectView(config, h.state, h.evidence);
      assert.ok(sv.actions.some((x) => x.id === id));
      const t = actionTypeOf(config, s.expectType);
      const concerns = t.approver === "subject" || t.confirmer === "subject" || t.recipient === s.subject;
      assert.equal(JSON.stringify(sv).includes(other), concerns);
    });

    it("a transfer is a reviewed disclosure: unsent work is held back and the previous holder keeps nothing", () => {
      const h = new Harness(config).accepted();
      const sent = supportAccepted(h);
      h.ok({ type: "propose", actionType: s.expectType }, h.owner);
      const unsent = h.lastActionId();
      h.refused({ type: "routeRequest", to: "member-c", checks: { ...CHECKS4, authority: false } }, h.owner, "checks_required");
      h.refused({ type: "routeRequest", to: "member-z", checks: CHECKS4 }, h.owner, "no_eligible_holder");
      h.ok({ type: "routeRequest", to: "member-c", checks: CHECKS4 }, h.owner);
      assert.deepEqual([h.action(unsent).state, h.action(unsent).heldBack, h.action(sent).heldBack], ["withdrawn", true, false]);
      assert.equal(holderView(config, h.state, h.evidence, h.facts(), "member-a"), null);
      assert.equal(holderView(config, h.state, h.evidence, h.facts(), "member-c"), null, "the receiver must accept first");
      h.refused({ type: "propose", actionType: s.expectType }, h.owner, "not_found");
      h.ok({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.member("member-c"));
      const view = holderView(config, h.state, h.evidence, h.facts(), "member-c")!;
      assert.deepEqual(view.actions.map((a) => a.id), [sent]);
      assert.ok(!view.evidence.some((e) => e.actionId === unsent));
      h.ok({ type: "propose", actionType: s.expectType }, h.member("member-c"));
      assert.match(h.lastActionId(), /-B1$/, "references restart per holder");
      h.refused({ type: "routeRequest", to: "member-a", checks: CHECKS4 }, h.member("member-c"), "no_eligible_holder");
    });

    it("measures keep recorded, illustrative, recognition and self-reported evidence apart", () => {
      const h = new Harness(config).accepted();
      supportAccepted(h);
      const m = measures(config, h.state, h.evidence);
      assert.deepEqual([m.recorded.sent, m.recorded.accepted, m.recorded.decisions], [1, 1, 1]);
      assert.equal(m.illustrative.label, "illustrative");
      assert.equal(m.evidence.recipientRecordedNoReask.count, 1);
      assert.equal(m.evidence.attestedRecords.count, 2);
      assert.equal(m.evidence.independentVerification, "none");
    });

    it("completed is not confirmed, and only the configured confirmer confirms", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.ok({ type: "complete", actionId: id }, h.liaison("member-b", s.supportRecipient));
      assert.equal(followThrough(config, h.state, h.facts())[0].state, "accepted-able");
      h.refused({ type: "confirm", actionId: id }, h.owner, "not_permitted");
      h.ok({ type: "confirm", actionId: id }, h.subject);
      assert.equal(followThrough(config, h.state, h.facts())[0].state, "confirmed");
      assert.equal(measures(config, h.state, h.evidence).evidence.personConfirmed.count, 1);
      assert.equal(deriveAssuranceState(config, h.state, h.evidence, h.facts()).verification, "none");
    });

    it("a prepared communication is never sent by the kernel; the holder releases it once", () => {
      const tpl = config.communications[0];
      const h = new Harness(config).accepted();
      supportAccepted(h);
      h.capacity(s.supportRecipient, true);
      const plan = prepareCoordinationPlan(config, h.state, h.facts());
      assert.deepEqual(plan.communications.map((c) => [c.templateId, c.status]), [[tpl.id, "prepared"]]);
      assert.ok(!h.evidence.some((e) => e.kind === "communication.released"));
      const actionId = plan.communications[0].actionId;
      h.ok({ type: "releaseCommunication", templateId: tpl.id, actionId }, h.owner);
      h.refused({ type: "releaseCommunication", templateId: tpl.id, actionId }, h.owner, "invalid_state");
      const updates = subjectView(config, h.state, h.evidence).updates.join(" ");
      assert.ok(updates.includes("(Fictional example)"));
    });
  });
}
