import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProtectionWorld } from "../sim/session";
import { customerView, operationsView, operatorView, operatorDo } from "../sim/views";
import { approveAndSend, confirmed, fullJourney, NOTE, opened, stepAll, OK } from "./helpers";
import { CONTACT_CHOICES } from "../sim/scope";

const state = (w: ProtectionWorld, id: string) => w.action(id)!.state;

describe("The complete journey", () => {
  it("shows a committed dispatch as pending, not sent or awaiting acceptance", () => {
    const w = opened();
    w.approve("ACB-1");
    const a = w.action("ACB-1")!;
    const queued = {
      ...a,
      state: "queued" as const,
      attempts: [{ key: "ACB-1#1", at: a.createdAt, result: "queued" as const, reason: null, reference: null }],
    };

    const stage = w.stage(queued);
    assert.equal(stage.stage, "approved");
    assert.equal(stage.label, "Approved — dispatch pending");
    assert.match(stage.detail, /nothing is recorded as sent/);
    assert.equal(stage.notYetAccepted, false);
  });

  it("request, human authority, separate actions, outcomes, then approved status only", () => {
    const w = new ProtectionWorld();
    assert.equal(customerView(w).hasRequest, false);
    assert.ok(w.submitRequest({ duration: "7 days", contact: OK, note: NOTE }).ok);
    assert.equal(customerView(w).headline.title, "Request received");
    assert.ok(w.acceptResponsibility().ok);
    w.preparePlan();
    // Prepared is not approved: nothing is approved, sent or visible to the customer.
    for (const a of w.actions()) assert.equal(a.state, "awaiting_approval");
    assert.equal(w.actions().every((a) => a.approval === null), true);
    assert.notEqual(customerView(w).headline.title, "Your break is confirmed");

    assert.ok(w.approve("ACB-1").ok);
    assert.equal(state(w, "ACB-1"), "approved");
    assert.equal(state(w, "MKT-1"), "awaiting_approval", "approving one action approves no other");
    assert.ok(w.dispatch("ACB-1").ok);
    assert.equal(state(w, "ACB-1"), "sent");
    assert.equal(w.stage(w.action("ACB-1")!).stage, "sent");
    w.approve("MKT-1"); w.dispatch("MKT-1");

    // sent -> received -> accepted -> completed: each a separate step by the system's own channel
    assert.ok(w.connectorStep("ACB-1").ok); assert.equal(state(w, "ACB-1"), "received");
    assert.equal(w.stage(w.action("ACB-1")!).stage, "acknowledged");
    assert.ok(w.connectorStep("ACB-1").ok); assert.equal(state(w, "ACB-1"), "accepted");
    assert.ok(w.connectorStep("ACB-1").ok); assert.equal(state(w, "ACB-1"), "completed");
    assert.equal(w.stage(w.action("ACB-1")!).stage, "applied");
    // Applied is not confirmed, and the reviewer cannot confirm without a simulated read-back
    const early = w.confirm("ACB-1");
    assert.equal(early.ok, false);
    assert.equal(state(w, "ACB-1"), "completed");
    assert.ok(w.readBack("ACB-1").ok);
    assert.ok(w.confirm("ACB-1").ok);
    assert.equal(w.stage(w.action("ACB-1")!).stage, "confirmed");

    // The customer is still told nothing is confirmed for marketing
    confirmed(w, "MKT-1");
    // A notice cannot be sent before its prerequisite, and is approved only after
    const c = customerView(w);
    assert.ok(c.parts.every((p) => p.status !== "confirmed"));
    approveAndSend(w, "CAN-1"); approveAndSend(w, "CMN-1");
    const done = customerView(w);
    assert.equal(done.headline.title, "Your break is confirmed");
    assert.ok(done.parts.every((p) => p.status === "confirmed"));
  });

  it("the authorising person is named on each action", () => {
    const w = fullJourney();
    const ops = operationsView(w);
    assert.match(ops.account[0].authorisedBy!, /Protection reviewer/);
    assert.match(ops.marketing[0].authorisedBy!, /Protection reviewer/);
  });

  it("the customer notice is blocked by the kernel until confirmation", () => {
    const w = opened();
    w.approve("CAN-1");
    const r = w.dispatch("CAN-1");
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /Waiting for/);
    assert.equal(customerView(w).updates.some((u) => /in place/.test(u.body)), false);
  });
});

describe("Failure and interruption", () => {
  it("one succeeds and one fails: the customer is told only what is confirmed", () => {
    const w = opened();
    w.applyPreset("one-fails");
    approveAndSend(w, "ACB-1"); confirmed(w, "ACB-1");
    w.approve("MKT-1");
    assert.ok(w.dispatch("MKT-1").ok);
    assert.equal(state(w, "MKT-1"), "approved");
    assert.equal(w.stage(w.action("MKT-1")!).stage, "retry", "a failed attempt leaves a retry available, not sent, and is not called queued");
    assert.ok(w.dispatch("MKT-1").ok);
    assert.equal(state(w, "MKT-1"), "unresolved");
    assert.equal(w.stage(w.action("MKT-1")!).stage, "unresolved");
    approveAndSend(w, "CAN-1");
    assert.equal(w.dispatch("CMN-1").ok, false, "marketing notice is not even approved");
    w.approve("CMN-1");
    assert.equal(w.dispatch("CMN-1").ok, false, "kernel blocks it: marketing is not confirmed");
    const c = customerView(w);
    assert.equal(c.parts.find((p) => p.id === "account")!.status, "confirmed");
    assert.notEqual(c.parts.find((p) => p.id === "marketing")!.status, "confirmed");
    assert.ok(operationsView(w).gaps.some((g) => g.actionId === "MKT-1"));
    // optional support outreach is not held back by a technical failure (a fictional procedure choice, not a rule)
    w.propose("support-handover"); w.submit("SUP-1"); assert.ok(w.approve("SUP-1").ok);
  });

  it("an unknown outcome is never treated as sent, never retried, and is reconciled by a separate person", () => {
    const w = opened();
    w.applyPreset("unknown");
    w.approve("ACB-1");
    assert.ok(w.dispatch("ACB-1").ok);
    const a = w.action("ACB-1")!;
    assert.equal(a.state, "unresolved");
    assert.equal(a.gap?.kind, "dispatch_uncertain");
    assert.equal(a.sentAt, null);
    assert.equal(w.dispatch("ACB-1").ok, false, "no automatic retry");
    assert.equal(w.recheck("ACB-1").ok, false);
    // the holder cannot reconcile their own send
    const own = w.command({ type: "reconcileDispatch", actionId: "ACB-1", finding: "verified_delivered", evidenceReference: "LOG-ACC-1", account: "I looked at it myself.", basis: { kind: "purpose-grant" } }, w.reviewer(), "x");
    assert.equal(own.ok, false);
    // reconciliation needs a reference from the receiving system's own log
    const log = w.receivingSystemLog("ACB-1")!;
    assert.equal(log.delivered, true);
    assert.equal(w.reconcile("ACB-1", "verified_delivered", "no", "short").ok, false);
    assert.ok(w.reconcile("ACB-1", "verified_delivered", log.reference, "The receiving system's log shows the request arrived.").ok);
    assert.equal(state(w, "ACB-1"), "sent");
  });

  it("an unknown outcome that did not arrive returns to approved, with the unused approval and a fresh key", () => {
    const w = opened();
    w.applyPreset("unknown");
    w.setReachedAnyway("account-controls", false);
    w.approve("ACB-1"); w.dispatch("ACB-1");
    const log = w.receivingSystemLog("ACB-1")!;
    assert.equal(log.delivered, false);
    assert.ok(w.reconcile("ACB-1", "verified_not_delivered", log.reference, "The log shows no request arrived.").ok);
    assert.equal(state(w, "ACB-1"), "approved");
  });

  it("an approved action that is never accepted stays sent, is flagged, and nothing is re-sent", () => {
    const w = opened();
    w.applyPreset("unaccepted");
    approveAndSend(w, "ACB-1");
    assert.equal(w.connectorStep("ACB-1").ok, false);
    assert.equal(state(w, "ACB-1"), "sent");
    const row = operationsView(w).account[0];
    assert.equal(row.notYetAccepted, true);
    assert.ok(operationsView(w).gaps.some((g) => /not yet accepted/.test(g.what)));
    assert.equal(w.recommendations().length, 0, "not yet overdue");
    w.advanceDays(1);
    const rec = w.recommendations();
    assert.equal(rec.length, 1);
    assert.equal(rec[0].ruleId, "expectation-passed");
    assert.equal(rec[0].pathway, null, "no substitute recipient is chosen");
    assert.equal(w.dispatch("ACB-1").ok, false, "never re-sent");
    assert.equal(w.action("ACB-1")!.attempts.length, 1);
    // the customer never learns anything beyond what a person released
    assert.equal(customerView(w).parts.find((p) => p.id === "account")!.status, "not-started");
  });

  it("the support team is a clearly identified connected destination, and a handover it never accepts becomes a recognised gap once the configured expectation passes", () => {
    const w = opened();
    w.applyPreset("handover-unaccepted");
    assert.ok(operationsView(w).systems.some((s) => s.key === "support-team"), "Support team must be identified as a connected destination, like every other system");
    w.propose("support-handover"); w.submit("SUP-1"); approveAndSend(w, "SUP-1");
    const sys = operationsView(w).systems.find((s) => s.key === "support-team");
    assert.ok(sys, "Support team must still be identified as a connected destination once a handover is sent");
    assert.equal(sys!.unavailable, false);
    assert.equal(w.connectorStep("SUP-1").ok, false, "this preset's support team never accepts it");
    assert.equal(state(w, "SUP-1"), "sent");
    assert.equal(w.recommendations().length, 0, "not yet overdue");
    w.advanceDays(2);
    const rec = w.recommendations();
    assert.equal(rec.length, 1);
    assert.equal(rec[0].ruleId, "expectation-passed");
    assert.match(rec[0].fact, /Support handover/);
    assert.equal(rec[0].pathway, null, "no recovery pathway is configured for a handover; a person decides");
    // Operations can also record the destination itself as unavailable, independent of time passing.
    assert.ok(w.recordCapacity("support-team", "unavailable").ok);
    assert.equal(operationsView(w).systems.find((s) => s.key === "support-team")!.unavailable, true);
  });

  it("interruption after accepting needs a FRESH proposal that needs approval authority", () => {
    const w = opened();
    approveAndSend(w, "ACB-1");
    w.connectorStep("ACB-1"); w.connectorStep("ACB-1");
    assert.equal(state(w, "ACB-1"), "accepted");
    assert.ok(w.recordCapacity("account-controls", "unavailable").ok);
    assert.equal(w.action("ACB-1")!.acceptedAt !== null, true, "acceptance is kept");
    assert.equal(w.stage(w.action("ACB-1")!).stage, "unresolved");
    const rec = w.recommendations().find((r) => r.ruleId === "capacity-lost-after-acceptance")!;
    assert.ok(rec.pathway);
    // Protection Operations has no standing to approve or propose
    assert.equal(w.tryAs("operations", { type: "propose", actionType: "account-break-manual", fromRecommendation: rec.id }, "x").ok, false);
    assert.equal(w.tryAs("support", { type: "approve", actionId: "ACB-1", checks: { recipient: true, purpose: true, fields: true, authority: true } }, "x").ok, false);
    // The reviewer proposes; the old approval is NOT reused
    const out = operatorDo(w, `recover|${rec.id}|account-break-manual`);
    assert.ok(out.ok, JSON.stringify(out));
    const rec1 = w.action("ABM-1")!;
    assert.equal(rec1.approval, null);
    assert.equal(rec1.recovers, "ACB-1");
    w.submit("ABM-1");
    assert.equal(w.dispatch("ABM-1").ok, false, "unapproved recovery cannot be sent");
    w.setReviewerRevoked(true);
    const refused = w.approve("ABM-1");
    assert.equal(refused.ok, false, "revoked authority cannot approve");
    assert.match((refused as { message: string }).message, /revoked|expired/);
    w.setReviewerRevoked(false);
    assert.ok(w.approve("ABM-1").ok);
    assert.equal(rec1.id, "ABM-1");
    assert.ok(w.dispatch("ABM-1").ok);
    confirmed(w, "ABM-1");
    assert.equal(state(w, "ABM-1"), "confirmed");
  });
});

describe("Lifecycle accuracy", () => {
  it("the eight words are never collapsed", () => {
    const w = opened();
    const seen: string[] = [];
    const note = () => seen.push(w.stage(w.action("ACB-1")!).stage);
    note();
    w.approve("ACB-1"); note();
    w.setBehaviour("account-controls", "refuses"); w.dispatch("ACB-1"); note();
    w.setBehaviour("account-controls", "applies"); w.dispatch("ACB-1"); note();
    w.connectorStep("ACB-1"); note();
    w.connectorStep("ACB-1"); w.connectorStep("ACB-1"); note();
    w.readBack("ACB-1"); w.confirm("ACB-1"); note();
    assert.deepEqual(seen, ["proposed", "approved", "retry", "sent", "acknowledged", "applied", "confirmed"]);
  });

  it("an unmatched read-back blocks confirmation", () => {
    const w = opened();
    w.setReadBack("account-controls", "does-not-match");
    approveAndSend(w, "ACB-1"); stepAll(w, "ACB-1");
    w.readBack("ACB-1");
    assert.equal(w.confirm("ACB-1").ok, false);
    assert.equal(state(w, "ACB-1"), "completed");
    assert.equal(operatorView(w).actions.find((a) => a.id === "ACB-1")!.offers.find((o) => o.key === "confirm")!.disabledReason !== undefined, true);
  });

  it("a connected system cannot be spoken for by a person", () => {
    const w = opened();
    approveAndSend(w, "ACB-1");
    const r = w.command({ type: "receive", actionId: "ACB-1" }, w.reviewer(), "x");
    assert.equal(r.ok, false);
    const o = w.command({ type: "receive", actionId: "ACB-1" }, { ...(w.operations() as object), onBehalfOf: "account-controls" } as never, "x");
    assert.equal(o.ok, false);
    assert.equal(state(w, "ACB-1"), "sent");
  });

  it("support outreach is not offered when the customer asked not to be contacted", () => {
    const w = opened(CONTACT_CHOICES[1].id);
    const o = operatorView(w).offers.find((x) => x.key === "propose:support-handover")!;
    assert.ok(o.disabledReason);
    assert.equal(w.supportOutreachPermitted(), false);
  });
});

describe("Privacy boundaries between projections", () => {
  const dump = (x: unknown) => JSON.stringify(x);
  it("the customer sees no internal state, system, attempt, reviewer note or evidence kind", () => {
    const w = opened();
    w.applyPreset("unknown");
    w.approve("ACB-1"); w.dispatch("ACB-1");
    const s = dump(customerView(w));
    for (const banned of ["ACB-1", "account-controls", "Account controls system", "Marketing suppression system", "dispatch_uncertain", "uncertain", "attempt", "SIM-", "awaiting_approval", "Protection reviewer", "reviewer-fictional", "evidence", "refused"]) {
      assert.equal(s.includes(banned), false, `customer view leaked "${banned}"`);
    }
    assert.ok(s.includes(NOTE), "the customer sees their own words");
  });
  it("Protection Operations never sees the customer's words, contact choice or customer notices", () => {
    const w = fullJourney();
    w.propose("support-handover"); w.submit("SUP-1"); w.approve("SUP-1"); w.dispatch("SUP-1");
    const s = dump(operationsView(w));
    assert.equal(s.includes(NOTE), false);
    assert.equal(s.includes("Support may message me"), false);
    assert.equal(s.includes("Your account break is in place"), false);
    assert.equal(s.includes("CAN-1"), false);
    assert.ok(s.includes("Customer C-1042"));
  });
  it("the operator sees the request but not the stand-in systems' internals", () => {
    const w = opened();
    const s = dump(operatorView(w));
    assert.ok(s.includes(NOTE));
    assert.equal(s.includes("reachedAnyway"), false);
    assert.equal(s.includes("LOG-"), false);
  });
  it("a stranger with no responsibility gets nothing from the kernel", () => {
    const w = opened();
    const r = w.tryAs("support", { type: "approve", actionId: "ACB-1", checks: { recipient: true, purpose: true, fields: true, authority: true } }, "x");
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, "not_found");
  });
  it("no projection returns the kernel's state object", () => {
    const w = fullJourney();
    for (const v of [customerView(w), operatorView(w), operationsView(w)]) {
      const s = dump(v);
      assert.equal(s.includes("processedCommands"), false);
      assert.equal(s.includes("processedEvents"), false);
    }
  });
});

describe("No scoring, no automation of consequence", () => {
  it("the configuration contains no scoring, profiling or inference concepts", () => {
    const text = JSON.stringify(w0().config);
    for (const re of [/\brisk\b/i, /\bscor(e|ing)\b/i, /propensit/i, /vulnerab/i, /problem gambl/i, /addict/i, /behaviou?ral/i, /guilt/i, /\brating\b/i]) assert.equal(re.test(text), false, String(re));
  });
  it("automation only prepares proposals: no action is approved, sent or executed by the kernel itself", () => {
    const w = opened();
    assert.ok(w.actions().every((a) => a.approval === null && a.sentAt === null && a.attempts.length === 0));
    assert.ok(w.evidence.every((e) => e.kind !== "execution.attempted"));
  });
  it("the only trigger is the customer's own request; nothing opens without one", () => {
    const w = new ProtectionWorld();
    assert.equal(w.preparePlan().ok, false);
    assert.equal(w.actions().length, 0);
  });
});
function w0() { return new ProtectionWorld(); }
