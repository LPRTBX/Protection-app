import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveAssuranceState, followThrough, holderView, measures, recognise, subjectView } from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { ACCEPT3, CHECKS4, Harness } from "./harness";

/**
 * T2 (contract 1.3 draft, section 8c). Follow-through must keep reporting an open need while the record still holds the action as unresolved,
 * even after the service that was unavailable is available again. Found by comparing the kernel with the 5B reducer: 5B keeps `interrupted`
 * until the holder acts. Every assertion below except the pure-projection ones fails on the 1.2 snapshot (a103f5f) for the stated reason.
 */
const config = REFERENCE_CONFIGURATIONS["sport-integrity"];
const SUPPORT = "parent-support";
const make = () => {
  const h = new Harness(config, "member-a", ["member-a", "member-b"]).accepted();
  h.ok({ type: "propose", actionType: SUPPORT }, h.owner);
  const id = h.lastActionId();
  h.ok({ type: "submit", actionId: id }, h.owner);
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
  h.ok({ type: "execute", actionId: id }, h.owner);
  return { h, id };
};
const ft = (h: Harness) => followThrough(config, h.state, h.facts())[0]!;

describe("T2: follow-through after a service is restored", () => {
  it("setup: unavailable before accepting leaves the action unresolved with a recipient_unavailable gap, and follow-through says interrupted", () => {
    const { h, id } = make();
    h.capacity("wellbeing", true);
    assert.equal(h.action(id).state, "unresolved");
    assert.equal(h.action(id).gap?.kind, "recipient_unavailable");
    assert.deepEqual([ft(h).state, ft(h).needUnresolved, ft(h).currentCapacity], ["interrupted", true, "unable"]);
  });
  it("T2-A1: after the service is restored the need stays open: interrupted, needUnresolved, capacity able, no acceptance claimed", () => {
    const { h, id } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    assert.equal(h.action(id).state, "unresolved", "the record still holds it unresolved");
    const f = ft(h);
    assert.deepEqual([f.state, f.needUnresolved, f.currentCapacity, f.historicalAcceptance], ["interrupted", true, "able", null]);
  });
  it("T2-A2: every projection agrees with the record: holder assurance, unresolved responsibilities and the unresolved count", () => {
    const { h, id } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    const view = holderView(config, h.state, h.evidence, h.facts(), "member-a")!;
    assert.equal(view.assurance.followThrough[0]!.state, "interrupted");
    assert.equal(view.assurance.measures.recorded.unresolved, 1);
    assert.ok(view.assurance.unresolvedResponsibilities.some((u) => u.actionId === id));
    assert.equal(deriveAssuranceState(config, h.state, h.evidence, h.facts()).followThrough[0]!.needUnresolved, true);
  });
  it("T2-A3: a re-check that finds a recipient clears the gap, and only then does follow-through stop reporting the need", () => {
    const { h, id } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    h.ok({ type: "recheck", actionId: id }, h.owner);
    assert.equal(h.action(id).gap, null);
    assert.deepEqual([ft(h).state, ft(h).needUnresolved], ["awaiting", false]);
    assert.equal(measures(config, h.state, h.evidence).recorded.unresolved, 0);
  });
  it("T2-A4: still unavailable stays interrupted (unchanged), and an accepted-then-lost action is unchanged: accepted-lost while lost, accepted-able once restored (5B parity)", () => {
    const a = make();
    a.h.capacity("wellbeing", true);
    assert.equal(ft(a.h).state, "interrupted");
    const b = make();
    b.h.ok({ type: "receive", actionId: b.id }, b.h.party("wellbeing"));
    b.h.ok({ type: "accept", actionId: b.id, checks: ACCEPT3, noReask: false }, b.h.party("wellbeing"));
    b.h.capacity("wellbeing", true);
    assert.deepEqual([ft(b.h).state, ft(b.h).needUnresolved], ["accepted-lost", true]);
    b.h.capacity("wellbeing", false);
    assert.deepEqual([ft(b.h).state, ft(b.h).needUnresolved], ["accepted-able", false]);
  });
  it("T2-A5: no interruption recommendation is raised by the restored-but-unresolved action (unchanged 1.2 behaviour, pinned so the fix cannot add one)", () => {
    const { h } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    assert.deepEqual(recognise(config, h.state, h.facts(), "member-a").active.map((r) => r.ruleId).filter((r) => r !== "request-awaiting"), []);
  });
  it("T2-A6 transfer: an unresolved action that was sent travels with the request, so the new holder sees the open need and the previous holder sees nothing", () => {
    const { h, id } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    h.ok({ type: "routeRequest", to: "member-b", checks: CHECKS4 }, h.owner);
    h.ok({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.member("member-b"));
    const now = holderView(config, h.state, h.evidence, h.facts(), "member-b")!;
    assert.equal(now.actions.find((a) => a.id === id)?.state, "unresolved");
    assert.deepEqual([now.assurance.followThrough[0]!.state, now.assurance.followThrough[0]!.needUnresolved], ["interrupted", true]);
    assert.equal(holderView(config, h.state, h.evidence, h.facts(), "member-a"), null);
  });
  it("T2-A7 disclosure: the fix adds no evidence, changes no state, and the subject's view is identical with and without it (follow-through is a holder projection)", () => {
    const { h } = make();
    h.capacity("wellbeing", true);
    h.capacity("wellbeing", false);
    const before = JSON.stringify([h.state, h.evidence.length, subjectView(config, h.state, h.evidence)]);
    ft(h); deriveAssuranceState(config, h.state, h.evidence, h.facts());
    assert.equal(JSON.stringify([h.state, h.evidence.length, subjectView(config, h.state, h.evidence)]), before);
    assert.ok(!JSON.stringify(subjectView(config, h.state, h.evidence)).includes("interrupted"));
  });
});
