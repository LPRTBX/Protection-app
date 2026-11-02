import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProtectionWorld } from "../sim/session";
import { customerView, operationsView, operatorView, operatorDo } from "../sim/views";
import { approveAndSend, confirmed, fullJourney, NOTE, opened, stepAll } from "./helpers";
import { CONTACT_CHOICES, FICTIONAL_NOTES } from "../sim/scope";
import { STAGE_LABEL } from "../sim/stage";

const ALLOW = CONTACT_CHOICES[0].id;
const DECLINE = CONTACT_CHOICES[1].id;
const msg = (r: unknown) => (r as { message: string }).message;
const code = (r: unknown) => (r as { code: string }).code;
const APPROVE_ARGS = { recipient: true, purpose: true, fields: true, authority: true } as const;

describe("Contact permission is enforced at the demo's command boundary, not only by hiding a button", () => {
  it("refuses every route to optional support outreach when permission is declined", () => {
    const w = opened(DECLINE);
    // direct commands, bypassing every offer
    const p = w.command({ type: "propose", actionType: "support-handover" }, w.reviewer(), "direct");
    assert.equal(p.ok, false); assert.equal(code(p), "permission_declined");
    assert.equal(w.tryAs("operations", { type: "propose", actionType: "support-handover" }, "x").ok, false);
    assert.equal(w.actions().some((a) => a.typeId === "support-handover"), false, "nothing was created");
    assert.equal(operatorDo(w, "propose:support-handover").ok, false);
    assert.equal(w.propose("support-handover").ok, false);
  });
  it("a stale approval cannot be sent after permission is withdrawn, and the frozen record is not rewritten", () => {
    const w = opened(ALLOW);
    assert.ok(w.propose("support-handover").ok);
    assert.ok(w.submit("SUP-1").ok);
    assert.ok(w.approve("SUP-1").ok);
    const before = JSON.stringify(w.action("SUP-1")!.fields);
    assert.ok(w.changeContactChoice(DECLINE).ok);
    const d = w.dispatch("SUP-1");
    assert.equal(d.ok, false); assert.equal(code(d), "permission_declined");
    assert.equal(w.command({ type: "execute", actionId: "SUP-1" }, w.reviewer(), "direct").ok, false);
    assert.equal(w.action("SUP-1")!.state, "approved");
    assert.equal(w.action("SUP-1")!.sentAt, null);
    assert.equal(JSON.stringify(w.action("SUP-1")!.fields), before, "the disclosure is not rewritten");
    assert.equal(w.action("SUP-1")!.attempts.length, 0, "no attempt was made");
    // a later command needs CURRENT authority: restoring permission makes the same approval usable again
    w.changeContactChoice(ALLOW);
    assert.ok(w.dispatch("SUP-1").ok);
  });
  it("refuses submit and approve once permission is withdrawn", () => {
    const w = opened(ALLOW);
    w.propose("support-handover");
    w.changeContactChoice(DECLINE);
    assert.equal(w.submit("SUP-1").ok, false);
    assert.equal(w.command({ type: "approve", actionId: "SUP-1", checks: APPROVE_ARGS }, w.reviewer(), "direct").ok, false);
    assert.equal(w.action("SUP-1")!.approval, null);
  });
  it("withdrawing permission after a send leaves the sent record frozen", () => {
    const w = opened(ALLOW);
    w.propose("support-handover"); w.submit("SUP-1"); approveAndSend(w, "SUP-1");
    const sent = w.action("SUP-1")!.sentAt;
    w.changeContactChoice(DECLINE);
    assert.equal(w.action("SUP-1")!.sentAt, sent);
    assert.equal(w.action("SUP-1")!.state, "sent");
  });
  it("keeps categories separate: required notices and marketing do not depend on optional outreach", () => {
    const w = opened(DECLINE);
    for (const id of ["ACB-1", "MKT-1"]) { approveAndSend(w, id); confirmed(w, id); }
    approveAndSend(w, "CAN-1"); approveAndSend(w, "CMN-1");
    assert.equal(w.action("CAN-1")!.state, "sent", "a required notice is sent even though outreach is declined");
    assert.equal(w.action("MKT-1")!.state, "confirmed");
  });
  it("support outreach no longer waits for a technical protection to be confirmed", () => {
    const w = opened(ALLOW);
    w.applyPreset("one-fails");
    w.approve("MKT-1"); w.dispatch("MKT-1"); w.dispatch("MKT-1");
    assert.equal(w.action("MKT-1")!.state, "unresolved");
    w.propose("support-handover"); w.submit("SUP-1"); w.approve("SUP-1");
    assert.ok(w.dispatch("SUP-1").ok, "access to support is not held for a technical failure");
  });
  it("the operator view states current and frozen choices separately", () => {
    const w = opened(ALLOW);
    w.changeContactChoice(DECLINE);
    const p = operatorView(w).communicationPermission;
    assert.notEqual(p.choice, p.current);
    assert.equal(p.supportOutreach, false);
    assert.equal(customerView(w).request!.contact, DECLINE);
  });
});

describe("Applied but not confirmed: a separate, freshly authorised correction", () => {
  const mismatched = () => {
    const w = opened();
    w.applyPreset("mismatch");
    approveAndSend(w, "ACB-1"); stepAll(w, "ACB-1"); w.readBack("ACB-1");
    approveAndSend(w, "MKT-1"); confirmed(w, "MKT-1");
    return w;
  };
  it("shows owner, unconfirmed protection, permitted next action and fresh authorisation", () => {
    const w = mismatched();
    assert.equal(w.action("ACB-1")!.state, "completed");
    assert.equal(w.confirm("ACB-1").ok, false, "a confirmation is never manufactured");
    const c = operatorView(w).corrections;
    assert.equal(c.length, 1);
    assert.match(c[0].reported, /NOT confirmed/);
    assert.match(c[0].owner, /Protection reviewer/);
    assert.match(c[0].authorisation, /fresh approval/i);
    assert.ok(c[0].offers.some((o) => o.key === "propose:account-break-correction"));
    const gap = operationsView(w).gaps.find((g) => g.actionId === "ACB-1")!;
    assert.match(gap.what, /NOT confirmed/);
  });
  it("a correction is not available unless a read-back mismatched (direct command refused)", () => {
    const w = opened();
    approveAndSend(w, "ACB-1"); confirmed(w, "ACB-1");
    const r = w.command({ type: "propose", actionType: "account-break-correction" }, w.reviewer(), "direct");
    assert.equal(r.ok, false); assert.equal(code(r), "correction_not_applicable");
  });
  it("runs the correction end to end without overwriting the original or touching the confirmed marketing control", () => {
    const w = mismatched();
    const mktBefore = JSON.stringify(w.action("MKT-1"));
    const origBefore = JSON.stringify(w.action("ACB-1"));
    assert.ok(w.propose("account-break-correction").ok);
    const x = w.action("ACX-1")!;
    assert.equal(x.approval, null, "fresh: no approval carried over");
    assert.equal(w.stage(x).stage, "proposed");
    w.submit("ACX-1");
    assert.equal(w.dispatch("ACX-1").ok, false, "unapproved correction cannot be sent");
    w.setReviewerRevoked(true);
    assert.equal(w.approve("ACX-1").ok, false, "needs current authority");
    w.setReviewerRevoked(false);
    assert.equal(w.tryAs("operations", { type: "approve", actionId: "ACX-1", checks: APPROVE_ARGS }, "x").ok, false);
    assert.ok(w.approve("ACX-1").ok);
    assert.ok(w.dispatch("ACX-1").ok);
    assert.equal(w.action("ACX-1")!.recipient, "account-controls-manual");
    stepAll(w, "ACX-1");
    assert.equal(w.confirm("ACX-1").ok, false, "needs a FRESH read-back");
    assert.ok(w.readBack("ACX-1").ok);
    assert.ok(w.confirm("ACX-1").ok);
    assert.equal(JSON.stringify(w.action("ACB-1")), origBefore, "the original record is untouched");
    assert.equal(w.action("ACB-1")!.confirmedBy, null);
    assert.equal(JSON.stringify(w.action("MKT-1")), mktBefore, "the confirmed control is untouched");
    // the customer hears only what is confirmed, after a person approves it
    assert.notEqual(customerView(w).parts.find((p) => p.id === "account")!.status, "confirmed");
    assert.ok(w.propose("customer-account-correction-notice").ok);
    w.submit("CAC-1"); approveAndSend(w, "CAC-1");
    assert.equal(w.action("CAC-1")!.state, "sent");
    assert.equal(customerView(w).parts.find((p) => p.id === "account")!.status, "confirmed");
    assert.equal(w.action("ACB-1")!.state, "completed", "the original still reads applied, not confirmed");
    assert.match(operationsView(w).gaps.find((g) => g.actionId === "ACB-1")!.what, /record is kept/);
  });
  it("the customer notice for a correction is blocked by the kernel until the correction is confirmed", () => {
    const w = mismatched();
    w.propose("account-break-correction"); w.submit("ACX-1"); approveAndSend(w, "ACX-1");
    w.propose("customer-account-correction-notice"); w.submit("CAC-1"); w.approve("CAC-1");
    assert.equal(w.dispatch("CAC-1").ok, false);
    assert.equal(w.stage(w.action("CAC-1")!).stage, "waiting");
  });
  it("the customer is told only what a person released, and is not told someone is working on it", () => {
    const w = mismatched();
    assert.equal(customerView(w).parts.find((p) => p.id === "account")!.status, "not-started");
    assert.equal(w.releaseCommunication("c-account-mismatch", "ACB-1").ok, true);
    const c = customerView(w);
    assert.equal(c.parts.find((p) => p.id === "account")!.status, "unconfirmed");
    assert.ok(c.unconfirmed.includes("Your account break"));
    const all = JSON.stringify(c);
    for (const banned of [/working on/i, /actively/i, /being worked/i, /in place/i, /ACB-1|ACX-1/]) assert.equal(banned.test(all), false, String(banned));
  });
  it("a mismatch message is only offered while it is true", () => {
    const w = opened();
    approveAndSend(w, "ACB-1"); confirmed(w, "ACB-1");
    assert.equal(operatorView(w).messages.some((m) => m.templateId.endsWith("-mismatch")), false);
  });
  it("marketing has the same correction path to its own manual desk", () => {
    const w = opened();
    w.setReadBack("marketing-suppression", "does-not-match");
    approveAndSend(w, "MKT-1"); stepAll(w, "MKT-1"); w.readBack("MKT-1");
    assert.ok(w.propose("marketing-suppression-correction").ok);
    w.submit("MKX-1"); approveAndSend(w, "MKX-1");
    assert.equal(w.action("MKX-1")!.recipient, "marketing-suppression-manual");
  });
});

describe("No eligible recovery and unknown outcomes", () => {
  it("with the manual desk also unavailable, no recovery pathway exists and no substitute is chosen", () => {
    const w = opened();
    approveAndSend(w, "ACB-1"); w.connectorStep("ACB-1"); w.connectorStep("ACB-1");
    w.recordCapacity("account-controls-manual", "unavailable");
    w.recordCapacity("account-controls", "unavailable");
    const rec = w.recommendations().find((r) => r.ruleId === "capacity-lost-after-acceptance")!;
    assert.equal(rec.pathway, null);
    assert.match(rec.title, /no other pathway is configured/);
    assert.equal(w.propose("account-break-manual", rec.id).ok, false);
    assert.equal(w.actions().some((a) => a.typeId === "account-break-manual" && a.state !== "unresolved"), false);
    assert.equal(w.stage(w.action("ACB-1")!).stage, "unresolved");
  });
  it("an unknown dispatch is not a known failure and no path retries it", () => {
    const w = opened();
    w.applyPreset("unknown");
    w.approve("ACB-1"); w.dispatch("ACB-1");
    const a = () => w.action("ACB-1")!;
    assert.equal(a().gap?.kind, "dispatch_uncertain");
    for (const cmd of [{ type: "execute", actionId: "ACB-1" }, { type: "recheck", actionId: "ACB-1" }, { type: "withdraw", actionId: "ACB-1" }, { type: "revokeApproval", actionId: "ACB-1" }, { type: "submit", actionId: "ACB-1" }, { type: "propose", actionType: "account-break" }] as const) {
      assert.equal(w.command(cmd as never, w.reviewer(), "direct").ok, false, cmd.type);
    }
    assert.equal(a().attempts.length, 1);
    assert.match(w.stage(a()).detail, /not retried/);
    assert.equal(w.stage(a()).label, STAGE_LABEL.unresolved);
  });
});

describe("Lifecycle and evidence wording match what is known", () => {
  it("never uses 'Queued', and names the two real situations precisely", () => {
    const w = opened();
    w.approve("CAN-1");
    const waiting = w.stage(w.action("CAN-1")!);
    assert.equal(waiting.label, "Approved — waiting for prerequisite");
    assert.match(waiting.detail, /not sent/);
    w.applyPreset("one-fails");
    w.approve("MKT-1"); w.dispatch("MKT-1");
    assert.equal(w.stage(w.action("MKT-1")!).label, "Retry available — not sent");
    for (const l of Object.values(STAGE_LABEL)) assert.equal(/queue/i.test(l), false, l);
    const all = JSON.stringify([operatorView(w), operationsView(w)]);
    assert.equal(/queue/i.test(all), false);
  });
  it("keeps received and accepted distinct", () => {
    const w = opened();
    approveAndSend(w, "ACB-1"); w.connectorStep("ACB-1");
    assert.equal(w.stage(w.action("ACB-1")!).label, "Acknowledged — received");
    w.connectorStep("ACB-1");
    assert.equal(w.stage(w.action("ACB-1")!).label, "Acknowledged — accepted");
    w.connectorStep("ACB-1");
    assert.match(w.stage(w.action("ACB-1")!).label, /^Applied — reported/);
    assert.match(w.stage(w.action("ACB-1")!).detail, /not a check/);
  });
  it("describes the check as a simulated read-back and claims no real-world assurance", () => {
    const w = fullJourney();
    const text = JSON.stringify([customerView(w), operatorView(w), operationsView(w)]);
    assert.equal(/independent(ly)? (confirm|read|check)/i.test(text), false);
    assert.match(STAGE_LABEL.confirmed, /simulated read-back/);
    assert.match(w.stage(w.action("ACB-1")!).detail, /Not proof of wellbeing, reduced harm or operator compliance/);
  });
  it("Protection Operations sees no optional-support history, customer narrative or notice detail", () => {
    const w = fullJourney();
    w.propose("support-handover"); w.submit("SUP-1"); approveAndSend(w, "SUP-1");
    w.connectorStep("SUP-1");
    const ops = operationsView(w);
    const row = ops.support[0];
    assert.deepEqual(row.fields, []);
    assert.deepEqual(row.attempts, []);
    const s = JSON.stringify(ops);
    assert.equal(ops.evidence.some((e) => /SUP-1|Support handover/.test(e.text)), false);
    assert.equal(ops.connectorLog.some((l) => l.actionId === "SUP-1"), false);
    assert.equal(/in-app message|current permission|contact choice/i.test(s.replace(/"label":"[^"]*"/g, "")), false);
    for (const banned of [NOTE, "CAN-1", "CMN-1", "Customer notice"]) assert.equal(s.includes(banned), false, banned);
  });
});

describe("Fictional inputs only", () => {
  it("refuses free text at the command boundary", () => {
    const w = new ProtectionWorld();
    const r = w.submitRequest({ duration: "7 days", contact: ALLOW, note: "My name is Jo and my account number is 1234" });
    assert.equal(r.ok, false); assert.equal(code(r), "fictional_input_only");
    assert.equal(w.state, null);
    assert.match(msg(r), /fictional example/);
  });
  it("accepts every listed fictional example", () => {
    for (const n of FICTIONAL_NOTES) assert.ok(new ProtectionWorld().submitRequest({ duration: "7 days", contact: ALLOW, note: n.text }).ok, n.id);
  });
  it("the customer view makes no availability promise the demo cannot keep", () => {
    const w = opened();
    const t = JSON.stringify(customerView(w));
    assert.equal(/always available/i.test(t), false);
  });
});

describe("Support authority wording matches the optional-outreach sequence", () => {
  it("no configured text says support waits for both protections or for independent confirmation", () => {
    const w = new ProtectionWorld();
    const texts = w.config.actions.flatMap((a) => [a.purpose, a.authority.label, a.authority.text, ...a.fields.map((f) => ("fixed" in f.source ? f.source.fixed : ""))]);
    for (const t of texts) {
      assert.equal(/both protections|independently (confirm|check)|independent (read|check)/i.test(t), false, t);
    }
    const support = w.config.actions.find((a) => a.id === "support-handover")!;
    assert.match(support.authority.text, /current permission/);
    assert.match(support.authority.text, /does not wait for any protection/);
    assert.deepEqual(support.prerequisites, []);
  });
  it("the disclosure frozen at send carries the current wording", () => {
    const w = opened();
    w.propose("support-handover"); w.submit("SUP-1"); approveAndSend(w, "SUP-1");
    assert.match(w.action("SUP-1")!.disclosure!.authority, /current permission/);
    assert.equal(/independent/i.test(JSON.stringify(w.action("SUP-1")!.disclosure)), false);
  });
  it("the rendered operator policy explanation states the same sequence", () => {
    const w = opened();
    w.propose("support-handover");
    const p = operatorView(w).policies.find((x) => x.id === "support-contact-standard")!;
    assert.equal(/both protections|independent/i.test(JSON.stringify(p)), false);
    assert.match(JSON.stringify(p), /CURRENT permission/);
  });
});

describe("Duration wording reads as an adjective", () => {
  it("never says 'your 7 days break'", () => {
    for (const d of ["24 hours", "7 days", "30 days"] as const) {
      const w = new ProtectionWorld();
      w.submitRequest({ duration: d, contact: ALLOW, note: FICTIONAL_NOTES[0].text });
      const t = JSON.stringify(customerView(w));
      assert.equal(/\d+ (days|hours) break/.test(t), false, t);
      assert.match(t, /\d+-(day|hour) break/);
    }
  });
});
