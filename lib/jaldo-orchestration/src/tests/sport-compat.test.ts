import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { followThrough, measures, runAnticipatoryCycle, prepareCoordinationPlan, recipientView, recognise, subjectView, GENERIC_RESTRICTION, type Actor } from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { toStage5BRecommendationId, translate, type Stage5BCommand } from "../deployments/sport/stage5b-adapter";
import { Harness, SCOPE } from "./harness";

/**
 * Sport compatibility: the Stage 5B reference behaviour
 * (`LPRTBX/JALDO-Sports-Integrity` PR #16 @ `94b8567`), driven through the
 * 5B command vocabulary and the compatibility adapter, on the shared kernel.
 * The reference repository's own suite (473 tests at `94b8567`) is the
 * behavioural baseline; this suite shows the kernel preserves each listed
 * guarantee. It is not a claim of full 5B regression parity (see the test
 * report for what is and is not represented).
 */

const config = REFERENCE_CONFIGURATIONS["sport-integrity"];

class Stage5B {
  h = new Harness(config, "morgan", ["morgan", "jordan-member"]);
  get ctx() {
    return {
      scope: SCOPE,
      members: { morgan: this.h.member("morgan"), jordan: this.h.member("jordan-member") },
      liaison: (key: string): Actor => this.h.liaison("liaison", key),
      routeTarget: "jordan-member",
    };
  }
  do(cmd: Stage5BCommand) {
    const t = translate(cmd, this.ctx);
    if (t.kind === "command") {
      const r = this.h.run(t.command, t.actor);
      assert.ok(r.ok, `${cmd.type}: ${r.ok ? "" : `${r.code} ${r.message}`}`);
      return r;
    }
    if (t.kind === "fact") {
      const f = t.fact;
      if ("unavailable" in f) this.h.capacity(f.unavailable, true);
      if ("available" in f) this.h.capacity(f.available, false);
      if ("advanceDays" in f) {
        // Time passing is a fact; the configured reconcile-status automation records what it makes true.
        this.h.advanceDays(1);
        const c = runAnticipatoryCycle(config, this.h.state, this.h.facts(), `cycle-${this.h.state.sequence}`);
        this.h.state = c.state;
        this.h.evidence.push(...c.evidence);
      }
      return null;
    }
    throw new Error(`untranslatable: ${t.kind === "unsupported" ? t.reason : t.kind}`);
  }
  refused(cmd: Stage5BCommand) {
    const t = translate(cmd, this.ctx);
    if (t.kind !== "command") return t;
    const r = this.h.run(t.command, t.actor);
    assert.equal(r.ok, false, `${cmd.type} should be refused`);
    return r;
  }
  recs() {
    return recognise(config, this.h.state, this.h.facts(), "morgan");
  }
  id(typeId: string) {
    return this.h.actionOf(typeId).id;
  }
  /** Parent support to accepted, as in the 5B story. */
  supportAccepted() {
    this.do({ type: "coPropose", by: "morgan", typeId: "parent-support" });
    const id = this.id("parent-support");
    this.do({ type: "coSubmit", by: "morgan", id });
    this.do({ type: "coApprove", actor: { k: "role", id: "family" }, id, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    this.do({ type: "coSend", by: "morgan", id });
    this.do({ type: "coReceive", actor: { k: "provider", id: "wellbeing" }, id });
    this.do({ type: "coRespond", actor: { k: "provider", id: "wellbeing" }, id, answer: "accept", checks: { scope: true, conflict: true, capacity: true, noReask: true } });
    return id;
  }
}

const started = () => {
  const s = new Stage5B();
  s.do({ type: "coAccept", by: "morgan", checks: { authority: true, noConflict: true, capacity: true } });
  return s;
};

describe("Sport compatibility — Stage 5B guarantees on the shared kernel", () => {
  it("recognition of a meaningful moment: an accepted request with no response is recognised for the holder only", () => {
    const s = started();
    assert.deepEqual(s.recs().active.map((r) => r.id), ["request-awaiting"]);
    assert.deepEqual(recognise(config, s.h.state, s.h.facts(), "jordan-member").active, []);
    assert.equal(s.h.state.actions.length, 0, "recognition creates nothing");
  });

  it("explainable recommendation: fact, guidance with source, why, who decides, approvals, exact share, unknowns, alternatives, not live AI", () => {
    const r = started().recs().active[0];
    assert.ok(r.fact && r.why && r.whoDecides);
    assert.ok(r.guidance.length > 0 && r.guidance.every((g) => g.source.length > 0));
    assert.equal(r.pathway?.actionType, "parent-guidance");
    assert.ok(r.approvals.length > 0 && r.wouldShare!.fields.length > 0);
    assert.ok(r.unknowns.length > 0 && r.alternatives.length > 0);
    assert.match(r.reasoningLabel, /not live AI/);
  });

  it("human-authorised action: adoption opens a proposal; the holder approves and sends; nothing moves by itself", () => {
    const s = started();
    s.do({ type: "coPropose", by: "morgan", typeId: "parent-guidance", from: "request-awaiting" });
    const id = s.id("parent-guidance");
    assert.equal(s.h.action(id).state, "proposed");
    s.refused({ type: "coSend", by: "morgan", id });
    s.do({ type: "coSubmit", by: "morgan", id });
    s.do({ type: "coApprove", actor: { k: "staff", id: "morgan" }, id, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    s.do({ type: "coSend", by: "morgan", id });
    assert.equal(s.h.action(id).state, "sent");
    // A different staff persona is not the holder.
    s.refused({ type: "coWithdraw", by: "jordan", id });
  });

  it("recipient-only disclosure: the service sees only its own action, exact fields and generic restrictions", () => {
    const s = started();
    const id = s.supportAccepted();
    const v = recipientView(config, s.h.state, s.h.evidence, "wellbeing");
    assert.deepEqual(v.map((x) => x.id), [id]);
    assert.deepEqual(v[0].fields.map((f) => f.label), ["Who is asking", "What was asked for", "Contact arrangement"]);
    assert.equal(v[0].restriction, GENERIC_RESTRICTION);
    assert.deepEqual(recipientView(config, s.h.state, s.h.evidence, "operations"), []);
  });

  it("approved service coordination: only the parent approves sharing the parent's details", () => {
    const s = started();
    s.do({ type: "coPropose", by: "morgan", typeId: "parent-support" });
    const id = s.id("parent-support");
    s.do({ type: "coSubmit", by: "morgan", id });
    s.refused({ type: "coApprove", actor: { k: "staff", id: "morgan" }, id, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    s.do({ type: "coApprove", actor: { k: "role", id: "family" }, id, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    assert.equal(s.h.action(id).approval?.by.kind, "party");
  });

  it("historical acceptance and service interruption: the acceptance is kept beside the lost capacity", () => {
    const s = started();
    const id = s.supportAccepted();
    const acceptedAt = s.h.action(id).acceptedAt;
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    assert.deepEqual([s.h.action(id).state, s.h.action(id).acceptedAt], ["accepted", acceptedAt]);
    const ft = followThrough(config, s.h.state, s.h.facts())[0];
    assert.deepEqual([ft.state, ft.currentCapacity, ft.needUnresolved], ["accepted-lost", "unable", true]);
    s.refused({ type: "coComplete", actor: { k: "provider", id: "wellbeing" }, id });
  });

  it("recovery recommendation and fresh approval: a new action to the eligible service; no earlier approval reused", () => {
    const s = started();
    const id = s.supportAccepted();
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    const rec = s.recs().active.find((r) => r.actionId === id)!;
    assert.equal(toStage5BRecommendationId(rec.id), `capacity-accepted:${id}`);
    assert.equal(rec.pathway?.actionType, "support-recovery");
    s.do({ type: "coPropose", by: "morgan", typeId: "support-recovery", from: `capacity-accepted:${id}` });
    const rid = s.id("support-recovery");
    assert.deepEqual([s.h.action(rid).recovers, s.h.action(rid).approval], [id, null]);
    s.do({ type: "coSubmit", by: "morgan", id: rid });
    s.refused({ type: "coSend", by: "morgan", id: rid });
    s.do({ type: "coApprove", actor: { k: "role", id: "family" }, id: rid, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    s.do({ type: "coSend", by: "morgan", id: rid });
    assert.ok(!JSON.stringify(recipientView(config, s.h.state, s.h.evidence, "support-person")).includes(id), "the new service is not told of the earlier request");
  });

  it("no eligible alternative: when both services are unavailable JALDO says so and offers nothing", () => {
    const s = started();
    const id = s.supportAccepted();
    s.do({ type: "coSim", kind: "unavailable", who: "supporter" });
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    const rec = s.recs().active.find((r) => r.actionId === id)!;
    assert.deepEqual([rec.pathway, rec.wouldShare], [null, null]);
    assert.equal(followThrough(config, s.h.state, s.h.facts())[0].noEligiblePathway, true);
  });

  it("confirmed follow-through: the parent's confirmation is their own statement, not verification", () => {
    const s = started();
    const id = s.supportAccepted();
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    s.do({ type: "coPropose", by: "morgan", typeId: "support-recovery", from: `capacity-accepted:${id}` });
    const rid = s.id("support-recovery");
    for (const c of [
      { type: "coSubmit", by: "morgan", id: rid },
      { type: "coApprove", actor: { k: "role", id: "family" }, id: rid, checks: { recipient: true, purpose: true, fields: true, authority: true } },
      { type: "coSend", by: "morgan", id: rid },
      { type: "coReceive", actor: { k: "provider", id: "supporter" }, id: rid },
      { type: "coRespond", actor: { k: "provider", id: "supporter" }, id: rid, answer: "accept", checks: { scope: true, conflict: true, capacity: true } },
      { type: "coComplete", actor: { k: "provider", id: "supporter" }, id: rid },
    ] as Stage5BCommand[]) s.do(c);
    s.refused({ type: "coConfirm", actor: { k: "staff", id: "morgan" }, id: rid });
    s.do({ type: "coConfirm", actor: { k: "role", id: "family" }, id: rid });
    const ft = followThrough(config, s.h.state, s.h.facts())[0];
    assert.equal(ft.state, "confirmed");
    assert.equal(measures(config, s.h.state, s.h.evidence).evidence.independentVerification, "none");
  });

  it("recognised-moment counts are preserved after adoption, dismissal and resolution", () => {
    const s = started();
    s.do({ type: "coPropose", by: "morgan", typeId: "parent-guidance", from: "request-awaiting" });
    const id = s.supportAccepted();
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    s.do({ type: "coPropose", by: "morgan", typeId: "support-recovery", from: `capacity-accepted:${id}` });
    const m = measures(config, s.h.state, s.h.evidence);
    assert.equal(m.recognition.moments, 2);
    assert.equal(m.recognition.adopted, 2);
    assert.equal(m.illustrative.potentialManualChases, 1, "counted from the moment record, not from what is currently shown");
    assert.equal(s.recs().active.length, 0);
  });

  it("evidence and measurement transparency: recorded, illustrative and self-reported kept apart and labelled", () => {
    const s = started();
    s.supportAccepted();
    const m = measures(config, s.h.state, s.h.evidence);
    assert.equal(m.illustrative.label, "illustrative");
    assert.match(m.illustrative.assumption, /Not time worked or saved/);
    assert.match(m.evidence.recipientRecordedNoReask.strength, /not independently verified/);
    assert.equal(m.evidence.attestedRecords.count, 2);
    assert.ok(s.h.evidence.every((e) => e.provenance.configId === "sport-integrity"));
  });

  it("the prepared parent message is released only by the holder, into the parent's own view (coInform)", () => {
    const s = started();
    const id = s.supportAccepted();
    s.do({ type: "coSim", kind: "unavailable", who: "wellbeing" });
    assert.equal(prepareCoordinationPlan(config, s.h.state, s.h.facts()).communications.length, 1);
    s.do({ type: "coInform", by: "morgan", actionId: id });
    assert.ok(subjectView(config, s.h.state, s.h.evidence).updates.some((u) => u.includes("Nothing about you has been passed to anyone else")));
  });

  it("the operational expectation is two days for Operations only; no automation acts in Sport", () => {
    const s = started();
    s.do({ type: "coPropose", by: "morgan", typeId: "ops-instruction" });
    const id = s.id("ops-instruction");
    s.do({ type: "coSubmit", by: "morgan", id });
    s.do({ type: "coApprove", actor: { k: "staff", id: "morgan" }, id, checks: { recipient: true, purpose: true, fields: true, authority: true } });
    s.do({ type: "coSend", by: "morgan", id });
    s.do({ type: "coAdvance" });
    assert.ok(!s.recs().active.some((r) => r.ruleId === "expectation-passed"));
    s.do({ type: "coAdvance" });
    assert.ok(s.recs().active.some((r) => r.ruleId === "expectation-passed" && r.pathway === null));
    assert.ok(s.h.state.moments.some((m) => m.ruleId === "expectation-passed"), "time passing is recorded as a recognised moment, as 5B counts it");
    assert.equal(config.automation.operations.includes("prepare-plan"), false);
  });

  it("states what is not represented rather than approximating it", () => {
    const s = started();
    for (const cmd of [{ type: "coPropose", by: "morgan", typeId: "athlete-offer" }, { type: "coRelease", actor: { k: "ops" } }] as Stage5BCommand[]) {
      assert.equal(translate(cmd, s.ctx).kind, "unsupported");
    }
  });
});
