import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProtectionWorld } from "../sim/session";
import { operationsView, operatorView, customerView } from "../sim/views";
import { approveAndSend, confirmed, opened, stepAll } from "./helpers";

const A4 = { recipient: true, purpose: true, fields: true, authority: true } as const;
const code = (r: unknown) => (r as { code: string }).code;
const direct = (w: ProtectionWorld, command: Parameters<ProtectionWorld["command"]>[0]) => w.command(command, w.reviewer(), "direct command");

/** A completed (applied) action whose latest read-back is `result`, or has none. */
function applied(typeId: "account" | "marketing", readBack: "none" | "mismatch" | "match") {
  const w = opened();
  const [id, sys] = typeId === "account" ? (["ACB-1", "account-controls"] as const) : (["MKT-1", "marketing-suppression"] as const);
  if (readBack === "mismatch") w.setReadBack(sys, "does-not-match");
  approveAndSend(w, id); stepAll(w, id);
  if (readBack !== "none") w.readBack(id);
  return { w, id, sys };
}

describe("Direct confirm commands need the latest matching simulated read-back (common command boundary)", () => {
  for (const kind of ["account", "marketing"] as const) {
    for (const rb of ["none", "mismatch"] as const) {
      it(`${kind}: ${rb === "none" ? "no read-back recorded (unknown)" : "a mismatching read-back"} refuses a direct confirm`, () => {
        const { w, id } = applied(kind, rb);
        const r = direct(w, { type: "confirm", actionId: id });
        assert.equal(r.ok, false);
        assert.equal(code(r), "readback_required");
        assert.equal(w.action(id)!.state, "completed");
        assert.equal(w.action(id)!.confirmedBy, null);
        assert.equal(w.evidence.some((e) => e.kind === "confirmation.recorded" && e.actionId === id), false);
      });
    }
  }
  it("the helper and the direct command give the same answer, from one check", () => {
    const { w, id } = applied("account", "mismatch");
    const viaHelper = w.confirm(id), viaCommand = direct(w, { type: "confirm", actionId: id });
    assert.equal(code(viaHelper), code(viaCommand));
  });
  it("a correction action also needs its own matching read-back", () => {
    const { w } = applied("account", "mismatch");
    w.propose("account-break-correction"); w.submit("ACX-1"); approveAndSend(w, "ACX-1"); stepAll(w, "ACX-1");
    assert.equal(direct(w, { type: "confirm", actionId: "ACX-1" }).ok, false, "no read-back for the correction");
    w.setReadBack("account-controls-manual", "does-not-match"); w.readBack("ACX-1");
    assert.equal(direct(w, { type: "confirm", actionId: "ACX-1" }).ok, false, "mismatching read-back for the correction");
    assert.equal(w.action("ACX-1")!.confirmedBy, null);
  });
  it("a refused confirm does not unlock the customer-confirmed notice", () => {
    const { w } = applied("account", "none");
    direct(w, { type: "confirm", actionId: "ACB-1" });
    w.approve("CAN-1");
    assert.equal(w.dispatch("CAN-1").ok, false);
    assert.notEqual(customerView(w).parts.find((p) => p.id === "account")!.status, "confirmed");
  });
  it("a matching read-back lets the direct command through; ordinary kernel authority still applies", () => {
    const { w, id } = applied("account", "match");
    assert.equal(w.tryAs("operations", { type: "confirm", actionId: id }, "x").ok, false, "Operations holds no such authority");
    assert.equal(w.command({ type: "confirm", actionId: id }, w.supportAgent(), "x").ok, false, "a support agent holds no such authority");
    assert.equal(w.action(id)!.state, "completed");
    assert.ok(direct(w, { type: "confirm", actionId: id }).ok);
    assert.equal(w.action(id)!.state, "confirmed");
  });
  it("a read-back is the LATEST one: a later mismatch withdraws the basis", () => {
    const { w, id, sys } = applied("account", "match");
    w.setReadBack(sys, "does-not-match"); w.readBack(id);
    assert.equal(direct(w, { type: "confirm", actionId: id }).ok, false);
  });
});

describe("A pending correction is revalidated at propose, submit, approve and send", () => {
  /** Original reported applied and mismatched; its correction is proposed and approved but not sent. */
  function pending(kind: "account" | "marketing") {
    const { w, id, sys } = applied(kind, "mismatch");
    const [corr, cid, manual] = kind === "account" ? (["account-break-correction", "ACX-1", "account-controls-manual"] as const) : (["marketing-suppression-correction", "MKX-1", "marketing-suppression-manual"] as const);
    assert.ok(w.propose(corr).ok);
    assert.ok(w.submit(cid).ok);
    assert.ok(w.approve(cid).ok);
    return { w, id, sys, corr, cid, manual };
  }
  /** The original is later read back as matching and confirmed. */
  const confirmOriginal = (w: ProtectionWorld, id: string, sys: "account-controls" | "marketing-suppression") => {
    w.setReadBack(sys, "matches"); assert.ok(w.readBack(id).ok); assert.ok(w.confirm(id).ok);
  };

  for (const kind of ["account", "marketing"] as const) {
    it(`${kind}: an approved correction does not dispatch once the original is confirmed (UI helper and direct command)`, () => {
      const { w, id, sys, cid } = pending(kind);
      confirmOriginal(w, id, sys);
      assert.equal(w.action(id)!.state, "confirmed");
      const viaHelper = w.dispatch(cid);
      const viaCommand = direct(w, { type: "execute", actionId: cid });
      assert.equal(viaHelper.ok, false); assert.equal(viaCommand.ok, false);
      assert.equal(code(viaCommand), "correction_not_applicable");
      const a = w.action(cid)!;
      assert.equal(a.state, "approved");
      assert.equal(a.attempts.length, 0);
      assert.equal(a.sentAt, null);
    });
    it(`${kind}: history is preserved and nothing is silently completed or re-approved`, () => {
      const { w, id, sys, cid } = pending(kind);
      const approval = JSON.stringify(w.action(cid)!.approval);
      const evBefore = w.evidence.length;
      confirmOriginal(w, id, sys);
      direct(w, { type: "execute", actionId: cid });
      assert.equal(JSON.stringify(w.action(cid)!.approval), approval, "approval untouched");
      assert.equal(w.action(id)!.confirmedBy !== null, true, "original confirmation stands");
      assert.equal(w.readBacks.filter((r) => r.actionId === id).length, 2, "original read-backs kept");
      assert.equal(w.evidence.filter((e) => e.kind.startsWith("execution.") && e.actionId === cid).length, 0);
      assert.ok(w.evidence.length >= evBefore);
    });
    it(`${kind}: a no-longer-applicable correction offers withdrawal, not a send`, () => {
      const { w, id, sys, cid } = pending(kind);
      confirmOriginal(w, id, sys);
      const row = operatorView(w).actions.find((a) => a.id === cid)!;
      assert.ok(row.notApplicable, "the reason is shown");
      assert.equal(row.offers.some((o) => o.key === "dispatch" && !o.disabledReason), false, "no enabled send");
      assert.ok(row.offers.some((o) => o.key === "withdraw"));
      assert.ok(w.withdraw(cid).ok);
      assert.equal(w.action(cid)!.state, "withdrawn");
      assert.ok(w.evidence.some((e) => e.actionId === cid && e.kind === "action.withdrawn"), "withdrawal is recorded, not erased");
    });
    it(`${kind}: the prerequisite becoming unknown or no longer a mismatch refuses approval and send`, () => {
      const { w, id, sys } = applied(kind, "mismatch");
      const corr = kind === "account" ? "account-break-correction" : "marketing-suppression-correction";
      const cid = kind === "account" ? "ACX-1" : "MKX-1";
      w.propose(corr); w.submit(cid);
      // the mismatch no longer holds: a newer matching read-back, original not yet confirmed
      w.setReadBack(sys, "matches"); w.readBack(id);
      const ap = direct(w, { type: "approve", actionId: cid, checks: A4 });
      assert.equal(ap.ok, false); assert.equal(code(ap), "correction_not_applicable");
      assert.equal(w.action(cid)!.approval, null);
      assert.equal(direct(w, { type: "execute", actionId: cid }).ok, false);
    });
    it(`${kind}: a correction that was already SENT is not blocked or rewritten when the original is later confirmed`, () => {
      const { w, id, sys, cid } = pending(kind);
      assert.ok(w.dispatch(cid).ok);
      confirmOriginal(w, id, sys);
      assert.equal(w.action(cid)!.state, "sent");
      assert.equal(w.action(cid)!.attempts.length, 1);
    });
  }
  it("account: submit of a proposed correction is refused once the original is confirmed", () => {
    const { w, id, sys } = applied("account", "mismatch");
    w.propose("account-break-correction");
    w.setReadBack(sys, "matches"); w.readBack(id); w.confirm(id);
    const r = direct(w, { type: "submit", actionId: "ACX-1" });
    assert.equal(r.ok, false); assert.equal(code(r), "correction_not_applicable");
    assert.equal(w.action("ACX-1")!.state, "proposed");
  });
  it("the Operations view shows a stale approved correction as an open item, with no customer detail", () => {
    const { w, id, sys } = pending("account");
    confirmOriginal(w, id, sys);
    const g = operationsView(w).gaps.find((x) => x.actionId === "ACX-1")!;
    assert.match(g.what, /no longer applicable/);
    assert.equal(JSON.stringify(operationsView(w)).includes("Withdraw: no longer"), false, "the reviewer-only withdrawal route is not shown to Operations");
  });
});
