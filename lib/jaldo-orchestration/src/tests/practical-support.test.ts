import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  linksFor,
  deadlinesFor,
  loadConfiguration,
  reconcileMoments,
  recognise,
  ConfigurationValidationError,
  type DeploymentConfiguration,
} from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION } from "../deployments/travel/practical-support";
import { ACCEPT3, CHECKS4, Harness } from "./harness";

/**
 * Contract 1.2 behaviour, exercised on the real kernel through its public operations (the Harness drives commands
 * exactly as the bridge does). These tests establish KERNEL behaviour only: they use no database, no HTTP route, no
 * authentication provider and no external channel, so they say nothing about those layers or about production.
 */

const raw = TRAVEL_PRACTICAL_SUPPORT_CONFIGURATION;
const CONFIG = loadConfiguration(raw);
const clone = <T,>(x: T): any => JSON.parse(JSON.stringify(x));
const variant = (edit: (c: any) => void): DeploymentConfiguration => {
  const c = clone(raw);
  edit(c);
  return loadConfiguration(c);
};
const MIN = 60_000;
const advance = (h: Harness, ms: number) => {
  h.now = new Date(h.now.getTime() + ms);
};
const kinds = (h: Harness, from = 0) => h.evidence.slice(from).map((e) => e.kind);

function propose(h: Harness, type: string): string {
  h.ok({ type: "propose", actionType: type }, h.owner);
  const id = h.lastActionId();
  h.ok({ type: "submit", actionId: id }, h.owner);
  return id;
}
const accepts = (h: Harness, id: string, party: string) => {
  h.ok({ type: "execute", actionId: id }, h.owner);
  h.ok({ type: "receive", actionId: id }, h.liaison("member-b", party));
  h.ok({ type: "accept", actionId: id, checks: ACCEPT3 }, h.liaison("member-b", party));
};
/** The guest agrees to share, then the unit accepts. */
function share(h: Harness, type: string, party: string): string {
  const id = propose(h, type);
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
  accepts(h, id, party);
  return id;
}
/** The holder approves a check, then the unit accepts. */
function check(h: Harness, type: string, party: string): string {
  const id = propose(h, type);
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
  accepts(h, id, party);
  return id;
}
/** Everything the handover needs: both checks and the guest's agreement for Guest services. */
function ready(h: Harness) {
  return { space: check(h, "space-check", "reception"), capacity: check(h, "capacity-check", "housekeeping"), agreement: share(h, "share-guest-services", "guest-services") };
}
function approvedHandover(h: Harness) {
  const id = propose(h, "support-handover");
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
  return id;
}
function deliver(h: Harness) {
  const g = h.liaison("member-b", "guest-services");
  const id = approvedHandover(h);
  accepts(h, id, "guest-services");
  h.ok({ type: "complete", actionId: id }, g);
  return id;
}
const fresh = (config: DeploymentConfiguration = CONFIG) => new Harness(config).accepted();
const evaluate = (h: Harness) => {
  const r = reconcileMoments(h.config, h.state, h.facts());
  assert.ok(r.ok);
  if (r.ok) {
    h.state = r.state;
    h.evidence.push(...r.evidence);
  }
  return r.ok ? r.evidence : [];
};
const passed = (h: Harness, id: string) => h.state.moments.find((m) => m.id === `deadline-passed:${id}`);

describe("configuration: decomposition validated against the real schema", () => {
  it("loads, and the guest and the duty lead hold separate authority", () => {
    assert.equal(CONFIG.id, "travel-practical-support");
    const t = (id: string) => CONFIG.actions.find((a) => a.id === id)!;
    for (const s of ["share-reception", "share-guest-services", "share-duty-cover"]) assert.equal(t(s).approver, "subject");
    assert.equal(t("support-handover").approver, "holder");
    assert.equal(t("support-handover").confirmer, "subject");
  });

  it("contract 1.2 options that cannot work are refused at load, not approximated", () => {
    const bad = (edit: (c: any) => void) => assert.throws(() => variant(edit), ConfigurationValidationError);
    bad((c) => { c.actions.find((a: any) => a.id === "support-handover").withdrawApprovalOnLoss = true; c.actions.find((a: any) => a.id === "support-handover").revalidatePrerequisites = false; });
    bad((c) => { c.linkKinds[0].blocks = [{ actionType: "support-handover", at: "release" }]; }); // informational cannot block
    bad((c) => { c.linkKinds[1].blocks = []; }); // required must block something
    bad((c) => { c.deadlines[0].afterMinutes = 0; });
    bad((c) => { c.deadlines[0].afterMinutes = 1.5; });
    bad((c) => { c.deadlines[0].on = { action: "support-handover", from: "accepted", until: "sent" }; });
    bad((c) => { delete c.changeReasons; });
    bad((c) => { delete c.followUpOutcomes; }); // an unsatisfied response needs an owned follow-up outcome
    bad((c) => { c.linkKinds[0].party = "guest"; }); // the subject cannot be responsible for linked work
  });
});

describe("agreement and approval bound to the same plan version and scope", () => {
  it("the duty lead cannot stand in for the guest, and the guest cannot approve the handover", () => {
    const h = fresh();
    const s = propose(h, "share-reception");
    h.refused({ type: "approve", actionId: s, checks: CHECKS4 }, h.owner, "not_permitted");
    ready(h);
    const hand = propose(h, "support-handover");
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.subject, "not_permitted");
    h.ok({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner);
  });

  it("attestation for the guest is refused: staff cannot record the guest's agreement", () => {
    const h = fresh();
    const s = propose(h, "share-guest-services");
    h.refused({ type: "approve", actionId: s, checks: CHECKS4 }, h.liaison("member-b", "guest"), "not_permitted");
  });

  it("the handover cannot be approved without the guest's agreement for the same recipient", () => {
    const h = fresh();
    check(h, "space-check", "reception");
    check(h, "capacity-check", "housekeeping");
    share(h, "share-reception", "reception"); // an agreement, but for a different recipient and fewer fields
    const hand = propose(h, "support-handover");
    const r = h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /Share with Guest services accepted/.test(r.message), r.ok ? "" : r.message);
  });

  it("an agreement for the wrong recipient does not satisfy sameRecipient", () => {
    const h = fresh(variant((c) => {
      const t = c.actions.find((a: any) => a.id === "support-handover");
      t.approvalPrerequisites[2] = { actionType: "share-reception", state: "accepted", sameRecipient: true, coversFields: false };
      t.prerequisites[2] = t.approvalPrerequisites[2];
    }));
    check(h, "space-check", "reception");
    check(h, "capacity-check", "housekeeping");
    share(h, "share-reception", "reception");
    const hand = propose(h, "support-handover");
    const r = h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /different recipient/.test(r.message), r.ok ? "" : r.message);
  });

  it("an agreement that covers fewer fields than the handover would share does not satisfy coversFields", () => {
    const h = fresh(variant((c) => {
      const t = c.actions.find((a: any) => a.id === "share-guest-services");
      t.fields = t.fields.filter((f: any) => f.id !== "preferences"); // the guest agreed to less than the handover discloses
    }));
    check(h, "space-check", "reception");
    check(h, "capacity-check", "housekeeping");
    share(h, "share-guest-services", "guest-services");
    const hand = propose(h, "support-handover");
    const r = h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /does not cover everything/.test(r.message), r.ok ? "" : r.message);
  });
});

describe("missing checks at approval", () => {
  it("approval is refused until every required check and agreement exists, naming what is missing", () => {
    const h = fresh();
    const hand = propose(h, "support-handover");
    const missing = h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!missing.ok && /Space check accepted/.test(missing.message) && /Capacity check accepted/.test(missing.message) && /Share with Guest services accepted/.test(missing.message));
    check(h, "space-check", "reception");
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    check(h, "capacity-check", "housekeeping");
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    share(h, "share-guest-services", "guest-services");
    h.ok({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner);
    assert.equal(h.action(hand).state, "approved");
  });

  it("a refused approval changes nothing and writes no evidence", () => {
    const h = fresh();
    const hand = propose(h, "support-handover");
    const n = h.evidence.length;
    const before = h.state;
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner);
    assert.equal(h.state, before);
    assert.equal(h.evidence.length, n);
  });
});

describe("material plan change and changed recipients", () => {
  it("revising the plan withdraws unsent work and no earlier agreement or approval carries over", () => {
    const h = fresh();
    ready(h);
    const hand = approvedHandover(h);
    h.ok({ type: "revisePlan", reasonId: "material-change" }, h.owner);
    assert.equal(h.state.planVersion, 2);
    assert.equal(h.action(hand).state, "withdrawn");
    assert.equal(h.action(hand).withdrawal?.reason, "plan_revised");
    assert.ok(kinds(h).includes("plan.revised"));
    // The earlier records remain, but they belong to version 1.
    const v1 = h.state.actions.filter((a) => a.planVersion === 1 && a.state === "accepted");
    assert.equal(v1.length, 3);
    // A version-2 handover cannot lean on version-1 checks or agreement.
    const hand2 = propose(h, "support-handover");
    const r = h.refused({ type: "approve", actionId: hand2, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /earlier plan version/.test(r.message), r.ok ? "" : r.message);
    // Renewed review: each step is given again under version 2.
    check(h, "space-check", "reception");
    check(h, "capacity-check", "housekeeping");
    h.refused({ type: "approve", actionId: hand2, checks: CHECKS4 }, h.owner, "dependency_unmet");
    share(h, "share-guest-services", "guest-services");
    h.ok({ type: "approve", actionId: hand2, checks: CHECKS4 }, h.owner);
    assert.equal(h.action(hand2).planVersion, 2);
  });

  it("a revision needs a configured reason and a holder, and only where plan versions are configured", () => {
    const h = fresh();
    h.refused({ type: "revisePlan", reasonId: "nonsense" }, h.owner, "reason_required");
    h.refused({ type: "revisePlan", reasonId: "material-change" }, h.liaison("member-b", "reception"), "not_found");
    const legacy = fresh(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
    legacy.refused({ type: "revisePlan", reasonId: "material-change" }, legacy.owner, "invalid_state");
  });

  it("a changed recipient (the support contact cannot act) needs a replacement with the guest's fresh agreement and a fresh approval", () => {
    const h = fresh();
    ready(h);
    const hand = approvedHandover(h);
    accepts(h, hand, "guest-services");
    h.capacity("guest-services", true);
    assert.ok(kinds(h).includes("capacity.lost"));
    assert.equal(h.action(hand).state, "accepted"); // the earlier acceptance is kept, never rewritten
    const rec = recognise(h.config, h.state, h.facts(), "member-a").active.find((r) => r.ruleId === "capacity-lost-after-acceptance" && r.actionId === hand)!;
    assert.equal(rec.pathway?.actionType, "replacement-handover");
    h.ok({ type: "propose", actionType: "replacement-handover", fromRecommendation: rec.id }, h.owner);
    const repl = h.lastActionId();
    h.ok({ type: "submit", actionId: repl }, h.owner);
    // No agreement to share with Duty cover yet: the duty lead cannot substitute.
    const r = h.refused({ type: "approve", actionId: repl, checks: CHECKS4 }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /Share with Duty cover accepted/.test(r.message));
    share(h, "share-duty-cover", "duty-cover");
    h.ok({ type: "approve", actionId: repl, checks: CHECKS4 }, h.owner);
    assert.equal(h.action(repl).recovers, hand);
    assert.equal(h.action(hand).acceptedAt !== null, true);
  });
});

describe("capacity withdrawn after approval but before release", () => {
  it("release is refused, the approval is withdrawn, the earlier evidence stays, and renewal restores release", () => {
    const h = fresh();
    const { capacity } = ready(h);
    const hand = approvedHandover(h);
    const before = h.evidence.length;
    h.capacity("housekeeping", true);
    const added = kinds(h, before);
    assert.ok(added.includes("authority.stale"), added.join());
    assert.equal(h.action(hand).state, "awaiting_approval");
    assert.equal(h.action(hand).approval, null);
    const stale = h.evidence.find((e) => e.kind === "authority.stale")!;
    assert.match(stale.text, /Capacity check accepted/);
    assert.match(stale.text, /renewed and a fresh approval given/);
    // The earlier check and its evidence are preserved, not erased.
    assert.equal(h.action(capacity).state, "accepted");
    assert.ok(h.evidence.some((e) => e.kind === "acceptance.recorded" && e.actionId === capacity));
    assert.ok(h.action(capacity).capacityLostAt);
    // A release attempt fails.
    h.refused({ type: "execute", actionId: hand }, h.owner, "invalid_state");
    // And approving again without a renewed check is refused.
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
    // Renewal: the unit regains capacity and a renewed check is a NEW action of the same type; the earlier one stays on record.
    h.capacity("housekeeping", false);
    const re = check(h, "capacity-check", "housekeeping");
    assert.notEqual(re, capacity);
    assert.equal(h.action(capacity).state, "accepted");
    assert.ok(h.action(capacity).capacityLostAt);
    h.ok({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner);
    h.ok({ type: "execute", actionId: hand }, h.owner);
    assert.equal(h.action(hand).state, "sent");
  });

  it("without withdrawApprovalOnLoss the approval stays but release still fails and says what to renew", () => {
    const h = fresh(variant((c) => { c.actions.find((a: any) => a.id === "support-handover").withdrawApprovalOnLoss = false; }));
    ready(h);
    const hand = approvedHandover(h);
    h.capacity("housekeeping", true);
    assert.equal(h.action(hand).state, "approved");
    const r = h.refused({ type: "execute", actionId: hand }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /Capacity check accepted/.test(r.message) && /lost capacity after accepting/.test(r.message) && /earlier record is kept/.test(r.message), r.ok ? "" : r.message);
  });

  it("an agreement not yet acted on can be revoked only by the guest, and the handover cannot rely on it", () => {
    const h = fresh();
    check(h, "space-check", "reception");
    check(h, "capacity-check", "housekeeping");
    const agreement = propose(h, "share-guest-services");
    h.ok({ type: "approve", actionId: agreement, checks: CHECKS4 }, h.subject);
    const hand = propose(h, "support-handover");
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet"); // approved is not accepted
    h.refused({ type: "revokeApproval", actionId: agreement }, h.owner, "not_permitted");
    h.ok({ type: "revokeApproval", actionId: agreement }, h.subject);
    assert.equal(h.action(agreement).state, "withdrawn");
    h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
  });

  it("existing 1.1 behaviour is unchanged for a configuration that does not opt in", () => {
    const legacy = loadConfiguration(
      (() => {
        const c = clone(REFERENCE_CONFIGURATIONS["travel-service-recovery"]);
        c.actions.find((a: any) => a.id === "transfer-booking").prerequisites = [{ actionType: "late-checkout-hold", state: "accepted" }];
        return c;
      })(),
    );
    const h = fresh(legacy);
    const tb = propose(h, "transfer-booking");
    h.ok({ type: "approve", actionId: tb, checks: CHECKS4 }, h.subject); // approval is NOT gated by release prerequisites
    h.refused({ type: "execute", actionId: tb }, h.owner, "dependency_unmet");
    const hold = propose(h, "late-checkout-hold");
    h.ok({ type: "approve", actionId: hold, checks: CHECKS4 }, h.owner);
    accepts(h, hold, "front-office");
    h.capacity("front-office", true); // a prerequisite's party loses capacity after acceptance
    h.ok({ type: "execute", actionId: tb }, h.owner); // 1.1 did not revalidate; it still does not unless configured
    assert.equal(h.action(tb).state, "sent");
  });
});

describe("deadlines: exact expiry, duplicates, rescheduling, cancellation, time handling", () => {
  function sentHandover() {
    const h = fresh();
    ready(h);
    const hand = approvedHandover(h);
    h.ok({ type: "execute", actionId: hand }, h.owner);
    return { h, hand };
  }

  it("a deadline opens when the step starts, at an absolute UTC instant, and is visible to the holder only by default", () => {
    const { h, hand } = sentHandover();
    const d = h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!;
    assert.equal(d.status, "open");
    assert.equal(d.dueAt, new Date(h.now.getTime() + 20 * MIN).toISOString());
    assert.match(d.dueAt, /Z$/);
    assert.equal(deadlinesFor(h.config, h.state, { holder: true }).length, 1);
    assert.equal(deadlinesFor(h.config, h.state, { party: "guest-services" }).length, 0);
    assert.ok(kinds(h).includes("deadline.set"));
    for (const e of h.evidence.filter((x) => x.kind === "deadline.set")) assert.deepEqual(e.audience, ["holder"]);
  });

  it("expires exactly at the due instant (inclusive), once, and duplicate evaluation adds nothing", () => {
    const { h, hand } = sentHandover();
    advance(h, 20 * MIN - 1);
    assert.deepEqual(evaluate(h), []); // one millisecond early: nothing
    assert.equal(passed(h, `handover-acceptance:${hand}`), undefined);
    advance(h, 1); // exactly due
    const first = evaluate(h);
    assert.equal(first.length, 1);
    assert.equal(first[0].kind, "moment.recognised");
    assert.equal(passed(h, `handover-acceptance:${hand}`)?.status, "recognised");
    // Evaluating again, with or without time passing, raises nothing for the same expiry.
    assert.deepEqual(evaluate(h), []);
    advance(h, 60 * MIN);
    assert.deepEqual(evaluate(h), []);
    assert.equal(passed(h, `handover-acceptance:${hand}`)?.occurrences, 1);
    // An unrelated recorded change after expiry does not raise it again.
    const n = h.evidence.length;
    h.ok({ type: "receive", actionId: hand }, h.liaison("member-b", "guest-services"));
    assert.equal(kinds(h, n).filter((k) => k === "moment.recognised").length, 0);
    // The deadline is still open: expiry is a recognised moment, not a state change.
    assert.equal(h.action(hand).state, "received");
    assert.equal(h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!.status, "open");
  });

  it("a duplicate command id has no second effect", () => {
    const { h, hand } = sentHandover();
    const id = `handover-acceptance:${hand}`;
    const due = new Date(h.now.getTime() + 40 * MIN).toISOString();
    const first = h.run({ type: "rescheduleDeadline", deadlineId: id, dueAt: due, reasonId: "capacity-change" }, h.owner, "cmd-dup");
    assert.ok(first.ok);
    const n = h.evidence.length;
    const again = h.run({ type: "rescheduleDeadline", deadlineId: id, dueAt: due, reasonId: "capacity-change" }, h.owner, "cmd-dup");
    assert.ok(again.ok && again.duplicate);
    assert.equal(h.evidence.length, n);
  });

  it("meeting the deadline late is recorded as late, with no separate alert", () => {
    const { h, hand } = sentHandover();
    advance(h, 25 * MIN);
    h.ok({ type: "receive", actionId: hand }, h.liaison("member-b", "guest-services"));
    evaluate(h);
    const before = h.evidence.length;
    h.ok({ type: "accept", actionId: hand, checks: ACCEPT3 }, h.liaison("member-b", "guest-services"));
    const d = h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!;
    assert.equal(d.status, "met");
    assert.equal(d.late, true);
    assert.ok(kinds(h, before).includes("deadline.met"));
    assert.equal(passed(h, `handover-acceptance:${hand}`)?.status, "resolved"); // no longer an open moment
  });

  it("met in time is recorded as in time; a missed expiry never happened, so nothing was raised", () => {
    const { h, hand } = sentHandover();
    advance(h, 5 * MIN);
    h.ok({ type: "receive", actionId: hand }, h.liaison("member-b", "guest-services"));
    h.ok({ type: "accept", actionId: hand, checks: ACCEPT3 }, h.liaison("member-b", "guest-services"));
    const d = h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!;
    assert.deepEqual([d.status, d.late], ["met", false]);
    assert.equal(passed(h, `handover-acceptance:${hand}`), undefined);
  });

  it("rescheduling keeps the earlier time, resolves the moment, and a new expiry is a repeat of the same moment", () => {
    const { h, hand } = sentHandover();
    const id = `handover-acceptance:${hand}`;
    advance(h, 21 * MIN);
    evaluate(h);
    assert.equal(passed(h, id)?.status, "recognised");
    const due = new Date(h.now.getTime() + 10 * MIN).toISOString();
    h.ok({ type: "rescheduleDeadline", deadlineId: id, dueAt: due, reasonId: "capacity-change" }, h.owner);
    const d = h.state.deadlines!.find((x) => x.id === id)!;
    assert.equal(d.dueAt, due);
    assert.deepEqual(d.history.map((x) => x.kind), ["set", "rescheduled"]);
    assert.equal(d.history[1].reasonId, "capacity-change");
    assert.equal(passed(h, id)?.status, "resolved");
    advance(h, 10 * MIN);
    const e = evaluate(h);
    assert.equal(e.length, 1);
    assert.match(e[0].text, /again \(occurrence 2\)/);
    assert.deepEqual(evaluate(h), []);
  });

  it("refuses a new time that is not an absolute UTC instant, is not in the future, or is unchanged", () => {
    const { h, hand } = sentHandover();
    const id = `handover-acceptance:${hand}`;
    for (const dueAt of ["2026-11-02T10:00:00+10:00", "2026-11-02 10:00", "tomorrow", "2026-11-02T10:00:00"]) {
      h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt, reasonId: "capacity-change" }, h.owner, "reason_required");
    }
    h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt: h.now.toISOString(), reasonId: "capacity-change" }, h.owner, "invalid_state");
    h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt: new Date(h.now.getTime() - MIN).toISOString(), reasonId: "capacity-change" }, h.owner, "invalid_state");
    h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt: h.state.deadlines![0].dueAt, reasonId: "capacity-change" }, h.owner, "invalid_state");
    h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt: new Date(h.now.getTime() + MIN).toISOString(), reasonId: "nope" }, h.owner, "reason_required");
  });

  it("cancelling resolves the moment, is recorded, and a cancelled deadline cannot be changed again", () => {
    const { h, hand } = sentHandover();
    const id = `handover-acceptance:${hand}`;
    advance(h, 30 * MIN);
    evaluate(h);
    h.ok({ type: "cancelDeadline", deadlineId: id, reasonId: "guest-request" }, h.owner);
    assert.equal(h.state.deadlines!.find((x) => x.id === id)!.status, "cancelled");
    assert.equal(passed(h, id)?.status, "resolved");
    assert.deepEqual(evaluate(h), []);
    h.refused({ type: "cancelDeadline", deadlineId: id, reasonId: "guest-request" }, h.owner, "invalid_state");
    h.refused({ type: "rescheduleDeadline", deadlineId: id, dueAt: new Date(h.now.getTime() + MIN).toISOString(), reasonId: "capacity-change" }, h.owner, "invalid_state");
  });

  it("a step that ends without being met cancels its deadline", () => {
    const { h, hand } = sentHandover();
    h.ok({ type: "receive", actionId: hand }, h.liaison("member-b", "guest-services"));
    h.ok({ type: "decline", actionId: hand, reasonId: "capacity" }, h.liaison("member-b", "guest-services"));
    assert.equal(h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!.status, "cancelled");
  });

  it("time is elapsed UTC time: the kernel reads no time zone, so a day is 24 hours and offsets are refused", () => {
    const h = fresh();
    h.now = new Date("2026-10-04T14:50:00.000Z"); // an instant either side of a local clock change somewhere
    ready(h);
    const hand = approvedHandover(h);
    h.ok({ type: "execute", actionId: hand }, h.owner);
    const d = h.state.deadlines!.find((x) => x.id === `handover-acceptance:${hand}`)!;
    assert.equal(Date.parse(d.dueAt) - Date.parse(d.setAt), 20 * MIN);
  });

  it("evaluation is not scheduling: with no evaluation call and no command, nothing is raised however much time passes", () => {
    const { h, hand } = sentHandover();
    const n = h.evidence.length;
    advance(h, 24 * 60 * MIN);
    assert.equal(h.evidence.length, n);
    assert.equal(passed(h, `handover-acceptance:${hand}`), undefined);
    assert.equal(evaluate(h).length, 1); // raised at the first evaluation, exactly once
  });

  it("only the holder reschedules or cancels", () => {
    const { h, hand } = sentHandover();
    const id = `handover-acceptance:${hand}`;
    h.refused({ type: "cancelDeadline", deadlineId: id, reasonId: "guest-request" }, h.liaison("member-b", "guest-services"), "not_permitted");
    h.refused({ type: "cancelDeadline", deadlineId: id, reasonId: "guest-request" }, h.subject, "not_permitted");
  });
});

describe("guest feedback is separate from delivery, and no response is unknown", () => {
  it("'still needs support' preserves the delivery record and opens an owned follow-up", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    const delivered = clone(h.action(hand));
    h.ok({ type: "recordResponse", actionId: hand, responseId: "still-needs-support" }, h.subject);
    const a = h.action(hand);
    for (const k of ["state", "completedAt", "outcome", "acceptedAt", "sentAt", "disclosure", "attempts", "approval", "fields"] as const) {
      assert.deepEqual(a[k], delivered[k], `delivery field ${k} must not change`);
    }
    assert.equal(a.responses?.length, 1);
    assert.equal(a.responses![0].effect, "unsatisfied");
    const fu = h.state.followUps![0];
    assert.deepEqual([fu.actionId, fu.status, fu.openedOwner], [hand, "open", "member-a"]);
    assert.ok(kinds(h).includes("followup.opened"));
    // Not diagnostic, not a score.
    for (const e of h.evidence.filter((x) => x.kind === "response.recorded" || x.kind === "followup.opened")) assert.ok(!/diagnos|score|risk|distress|unwell/i.test(e.text), e.text);
    // Visible to the holder and the guest only: Housekeeping and Guest services see no trace.
    for (const e of h.evidence.filter((x) => x.kind === "response.recorded")) assert.deepEqual(e.audience.sort(), ["holder", "party:guest"]);
    for (const e of h.evidence.filter((x) => x.kind === "followup.opened")) assert.deepEqual(e.audience, ["holder"]);
  });

  it("only the guest records the guest's response; the holder and staff cannot", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    h.refused({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.owner, "not_permitted");
    h.refused({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.liaison("member-b", "guest"), "not_permitted");
    h.refused({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.liaison("member-b", "guest-services"), "not_permitted");
    h.refused({ type: "recordResponse", actionId: hand, responseId: "nonsense" }, h.subject, "reason_required");
  });

  it("a response needs delivered work, and repeating the same response is refused", () => {
    const h = fresh();
    ready(h);
    const hand = approvedHandover(h);
    accepts(h, hand, "guest-services");
    h.refused({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject, "invalid_state");
    h.ok({ type: "complete", actionId: hand }, h.liaison("member-b", "guest-services"));
    h.ok({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject);
    h.refused({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject, "invalid_state");
  });

  it("no response is unknown: it is never satisfied, nothing is confirmed, and one overdue moment is raised at expiry only", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    assert.equal(h.action(hand).responses, undefined);
    const id = `guest-response-window:${hand}`;
    advance(h, 89 * MIN);
    assert.deepEqual(evaluate(h), []); // before the configured window ends: no alert, no inference
    advance(h, 1 * MIN);
    assert.equal(evaluate(h).length, 1);
    assert.equal(passed(h, id)?.status, "recognised");
    assert.deepEqual(evaluate(h), []); // not repeated for the same expiry
    advance(h, 600 * MIN);
    assert.deepEqual(evaluate(h), []);
    // Still unknown: not confirmed, no response, no follow-up invented.
    assert.equal(h.action(hand).state, "completed");
    assert.equal(h.action(hand).confirmedBy, null);
    assert.equal(h.action(hand).responses, undefined);
    assert.equal((h.state.followUps ?? []).length, 0);
    // A late response is accepted, flagged late, and the open moment resolves.
    h.ok({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject);
    const d = h.state.deadlines!.find((x) => x.id === id)!;
    assert.deepEqual([d.status, d.late], ["met", true]);
  });

  it("a later report supersedes an earlier one, both are kept, and the follow-up stays until the holder closes it", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    h.ok({ type: "recordResponse", actionId: hand, responseId: "still-needs-support" }, h.subject);
    h.ok({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject);
    const r = h.action(hand).responses!;
    assert.deepEqual(r.map((x) => [x.responseId, x.supersedes]), [["still-needs-support", false], ["helped", true]]);
    assert.equal(h.state.followUps![0].status, "open"); // a later "helped" does not close the holder's obligation
    h.refused({ type: "closeFollowUp", followUpId: h.state.followUps![0].id, outcomeId: "nonsense" }, h.owner, "reason_required");
    h.refused({ type: "closeFollowUp", followUpId: h.state.followUps![0].id, outcomeId: "reviewed-no-change" }, h.subject, "not_permitted");
    h.ok({ type: "closeFollowUp", followUpId: h.state.followUps![0].id, outcomeId: "reviewed-no-change" }, h.owner);
    assert.equal(h.state.followUps![0].status, "closed");
    h.refused({ type: "closeFollowUp", followUpId: h.state.followUps![0].id, outcomeId: "reviewed-no-change" }, h.owner, "invalid_state");
    // Closing does not touch the delivery record.
    assert.equal(h.action(hand).state, "completed");
  });

  it("the follow-up deadline raises one overdue item at expiry and none after it is closed in time", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    h.ok({ type: "recordResponse", actionId: hand, responseId: "still-needs-support" }, h.subject);
    const fu = h.state.followUps![0];
    const id = `follow-up-review:${fu.id}`;
    advance(h, 44 * MIN);
    assert.deepEqual(evaluate(h), []);
    advance(h, 1 * MIN);
    assert.equal(evaluate(h).length, 1);
    assert.deepEqual(evaluate(h), []);
    h.ok({ type: "closeFollowUp", followUpId: fu.id, outcomeId: "new-plan-agreed" }, h.owner);
    assert.deepEqual([h.state.deadlines!.find((x) => x.id === id)!.status, h.state.deadlines!.find((x) => x.id === id)!.late], ["met", true]);
  });

  it("confirming remains the guest's separate positive record; a report may follow confirmation", () => {
    const h = fresh();
    ready(h);
    const hand = deliver(h);
    h.ok({ type: "confirm", actionId: hand }, h.subject);
    assert.equal(h.action(hand).state, "confirmed");
    h.ok({ type: "recordResponse", actionId: hand, responseId: "keep-pending" }, h.subject);
    assert.equal(h.action(hand).state, "confirmed");
    assert.equal((h.state.followUps ?? []).length, 0); // "deferred" opens nothing
  });
});

describe("linked work", () => {
  it("independent repair stays open after support completes and is confirmed; support never depends on it", () => {
    const h = fresh();
    ready(h);
    h.ok({ type: "linkWork", kindId: "facility-repair", reference: "WO-1182", status: "open" }, h.owner);
    const hand = deliver(h); // approval, release, acceptance and completion are not blocked by an informational link
    h.ok({ type: "confirm", actionId: hand }, h.subject);
    h.ok({ type: "recordResponse", actionId: hand, responseId: "helped" }, h.subject);
    assert.equal(h.action(hand).state, "confirmed");
    assert.equal(h.state.links![0].status, "open");
    // Only the responsible party resolves it, and doing so changes nothing about the support.
    h.refused({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.owner, "not_permitted");
    h.refused({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("reception"), "not_permitted");
    h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("maintenance"));
    assert.equal(h.state.links![0].status, "resolved");
    assert.equal(h.action(hand).state, "confirmed");
    // Reopening is allowed and recorded.
    h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "open" }, h.party("maintenance"));
    assert.equal(h.state.links![0].status, "open");
  });

  it("information about the link is limited to the holder and the parties named for it", () => {
    const h = fresh();
    h.ok({ type: "linkWork", kindId: "facility-repair", reference: "WO-1182", status: "open" }, h.owner);
    assert.equal(linksFor(h.config, h.state, { holder: true }).length, 1);
    assert.equal(linksFor(h.config, h.state, { party: "maintenance" }).length, 1);
    assert.equal(linksFor(h.config, h.state, { party: "reception" }).length, 0);
    assert.equal(linksFor(h.config, h.state, { party: "guest" }).length, 0);
    const ev = h.evidence.find((e) => e.kind === "link.recorded")!;
    assert.deepEqual(ev.audience.sort(), ["holder", "party:maintenance"]);
    assert.ok(!/guest|support/i.test(ev.text), ev.text);
  });

  it("an informational link may be withdrawn by the holder; a link needs an opaque reference and cannot be duplicated", () => {
    const h = fresh();
    h.refused({ type: "linkWork", kindId: "facility-repair", reference: "https://example.test/x", status: "open" }, h.owner, "reason_required");
    h.refused({ type: "linkWork", kindId: "facility-repair", reference: "x", status: "open" }, h.owner, "reason_required");
    h.refused({ type: "linkWork", kindId: "nonsense", reference: "WO-1182", status: "open" }, h.owner, "not_found");
    h.ok({ type: "linkWork", kindId: "facility-repair", reference: "WO-1182", status: "open" }, h.owner);
    h.refused({ type: "linkWork", kindId: "facility-repair", reference: "WO-1182", status: "open" }, h.owner, "already_open");
    h.ok({ type: "withdrawLink", linkId: "LNK-1" }, h.owner);
    assert.equal(linksFor(h.config, h.state, { holder: true }).length, 0);
  });

  it("a required safety dependency blocks release until the responsible party resolves it, and 'unknown' blocks too", () => {
    const h = fresh();
    ready(h);
    const hand = approvedHandover(h);
    h.ok({ type: "linkWork", kindId: "area-safety-clearance", reference: "SC-77", status: "unknown" }, h.owner);
    const r = h.refused({ type: "execute", actionId: hand }, h.owner, "dependency_unmet");
    assert.ok(!r.ok && /Area safety clearance \(SC-77\) resolved/.test(r.message));
    // Not blocked at other transitions the link does not name, and not removable by the holder.
    h.refused({ type: "withdrawLink", linkId: "LNK-1" }, h.owner, "not_permitted");
    h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "open" }, h.party("maintenance"));
    h.refused({ type: "execute", actionId: hand }, h.owner, "dependency_unmet");
    h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("maintenance"));
    h.ok({ type: "execute", actionId: hand }, h.owner);
    assert.equal(h.action(hand).state, "sent");
  });

  it("a required dependency can block approval, completion or closure where configured", () => {
    for (const at of ["approval", "completion", "confirmation"] as const) {
      const h = fresh(variant((c) => { c.linkKinds[1].blocks = [{ actionType: "support-handover", at }]; }));
      ready(h);
      h.ok({ type: "linkWork", kindId: "area-safety-clearance", reference: "SC-77", status: "open" }, h.owner);
      const hand = propose(h, "support-handover");
      const approve = () => h.run({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner);
      if (at === "approval") {
        h.refused({ type: "approve", actionId: hand, checks: CHECKS4 }, h.owner, "dependency_unmet");
        h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("maintenance"));
        assert.ok(approve().ok);
        continue;
      }
      assert.ok(approve().ok);
      accepts(h, hand, "guest-services");
      if (at === "completion") {
        h.refused({ type: "complete", actionId: hand }, h.liaison("member-b", "guest-services"), "dependency_unmet");
        h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("maintenance"));
        h.ok({ type: "complete", actionId: hand }, h.liaison("member-b", "guest-services"));
      } else {
        h.ok({ type: "complete", actionId: hand }, h.liaison("member-b", "guest-services"));
        h.refused({ type: "confirm", actionId: hand }, h.subject, "dependency_unmet");
        h.ok({ type: "recordLinkStatus", linkId: "LNK-1", status: "resolved" }, h.party("maintenance"));
        h.ok({ type: "confirm", actionId: hand }, h.subject);
      }
    }
  });
});

describe("existing configurations keep their behaviour", () => {
  it("no existing reference configuration defines a contract 1.2 option", () => {
    for (const c of Object.values(REFERENCE_CONFIGURATIONS)) {
      assert.equal(c.planVersioning, undefined, c.id);
      assert.equal(c.deadlines, undefined, c.id);
      assert.equal(c.linkKinds, undefined, c.id);
      assert.equal(c.changeReasons, undefined, c.id);
      assert.ok(!c.recognition.rules.includes("deadline-passed" as never), c.id);
      for (const a of c.actions) {
        assert.equal(a.approvalPrerequisites, undefined, `${c.id}/${a.id}`);
        assert.equal(a.revalidatePrerequisites, undefined, `${c.id}/${a.id}`);
        assert.equal(a.responses, undefined, `${c.id}/${a.id}`);
      }
    }
  });

  it("a full 1.1 flow leaves no contract 1.2 field on the state, and the new commands are refused", () => {
    const config = REFERENCE_CONFIGURATIONS["travel-service-recovery"];
    const h = new Harness(config).accepted();
    const id = propose(h, "transfer-booking");
    h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
    h.ok({ type: "execute", actionId: id }, h.owner);
    h.ok({ type: "receive", actionId: id }, h.party("transfer-partner"));
    h.ok({ type: "accept", actionId: id, checks: ACCEPT3 }, h.party("transfer-partner"));
    h.capacity("transfer-partner", true);
    for (const k of ["planVersion", "deadlines", "followUps", "links"]) assert.ok(!(k in h.state), `state.${k}`);
    for (const a of h.state.actions) for (const k of ["planVersion", "capacityLostAt", "responses"]) assert.ok(!(k in a), `action.${k}`);
    h.refused({ type: "recordResponse", actionId: id, responseId: "helped" }, h.subject, "invalid_state");
    h.refused({ type: "revisePlan", reasonId: "x" }, h.owner, "invalid_state");
    h.refused({ type: "linkWork", kindId: "x", reference: "WO-1182", status: "open" }, h.owner, "not_found");
    h.refused({ type: "closeFollowUp", followUpId: "FU-1", outcomeId: "x" }, h.owner, "not_found");
    h.refused({ type: "cancelDeadline", deadlineId: "d", reasonId: "x" }, h.owner, "not_found");
    assert.equal(evaluate(h).filter((e) => e.kind.startsWith("deadline")).length, 0);
  });

  it("the shipped practical-support configuration is registered by id and is the same one the tests drive", () => {
    assert.equal(CONFIG.version, raw.version);
  });
});
