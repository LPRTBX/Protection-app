import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openCoordination } from "@workspace/jaldo-orchestration";
import { ProtectionWorld } from "../sim/session";
import type { ContextState } from "../sim/scope";
import { customerView, operationsView, operatorView } from "../sim/views";
import { CONTACT_CHOICES, FICTIONAL_NOTES, INTAKE, SCOPE, SIGNAL } from "../sim/scope";
import type { P2PresetId } from "../sim/connectors";
import { opened } from "./helpers";

const A4 = { recipient: true, purpose: true, fields: true, authority: true } as const;
const code = (r: unknown) => (r as { code: string }).code;
const msg = (r: unknown) => (r as { message: string }).message;
const direct = (w: ProtectionWorld, c: Parameters<ProtectionWorld["command"]>[0]) => w.command(c, w.reviewer(), "direct command");
const dump = (x: unknown) => JSON.stringify(x);

/** An admitted early-support review, held by the reviewer, nothing prepared. */
function review(preset: P2PresetId = "p2-current") {
  const w = new ProtectionWorld();
  assert.ok(w.selectScenario("early-support").ok);
  assert.ok(w.applyP2Preset(preset).ok);
  assert.ok(w.admitSignal().ok);
  assert.ok(w.acceptResponsibility().ok);
  return w;
}
const prepared = (preset: P2PresetId = "p2-current") => {
  const w = review(preset);
  assert.ok(w.propose("early-support-checkin").ok);
  assert.ok(w.submit("IAM-1").ok);
  return w;
};
const delivered = (w: ProtectionWorld) => {
  assert.ok(w.approve("IAM-1").ok);
  assert.ok(w.dispatch("IAM-1").ok);
  for (let i = 0; i < 3; i++) assert.ok(w.connectorStep("IAM-1").ok);
};

describe("Event origin: an operator-originated signal is never a customer request", () => {
  it("is admitted by signal intake, with a simulated-integration origin, and never by the customer", () => {
    const w = review();
    const opening = w.evidence.find((e) => e.kind === "request.opened")!;
    assert.equal(opening.actor!.id, INTAKE.memberId);
    assert.notEqual(opening.actor!.kind, "party");
    assert.equal(w.evidence.some((e) => e.actor?.kind === "party" && e.actor.id === "customer"), false, "no record is attributed to the customer");
    const req = Object.fromEntries(w.state!.request.map((f) => [f.id, f.value]));
    assert.equal(req.origin, "Operator-originated early-support review");
    assert.match(req.source, /simulated/);
    assert.equal(req.reference, SIGNAL.reference);
    assert.match(req.ask, /customer has asked for nothing/);
    assert.match(w.history[0].by, /Signal intake/);
  });
  it("never invokes the customer-request path and records no consent", () => {
    const w = new ProtectionWorld();
    w.selectScenario("early-support");
    const r = w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: FICTIONAL_NOTES[1].text });
    assert.equal(r.ok, false); assert.equal(code(r), "wrong_scenario");
    assert.equal(w.state, null);
    w.admitSignal();
    assert.equal(/consent|agree/i.test(dump(w.state!.request)), false, "no consent is recorded on the request");
    assert.equal(w.evidence.some((e) => /consent|agreed to/i.test(e.text)), false);
  });
  it("the intake member holds only 'prepare': it cannot hold, approve or send", () => {
    const w = review();
    w.propose("early-support-checkin"); w.submit("IAM-1");
    for (const c of [{ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, { type: "approve", actionId: "IAM-1", checks: A4 }, { type: "execute", actionId: "IAM-1" }] as const) {
      assert.equal(w.command(c as never, w.intake(), "x").ok, false, c.type);
    }
    assert.equal(w.action("IAM-1")!.approval, null);
  });
  it("the kernel refuses a malformed event: an unknown field, or a missing reviewed field", () => {
    const w = new ProtectionWorld();
    w.selectScenario("early-support");
    const base = (context: Record<string, string>) => ({
      schema: "jaldo.event", id: "evt-x", idempotencyKey: "k-x", type: "protection.review-requested", occurredAt: w.now.toISOString(), scope: SCOPE,
      source: { system: "upstream-protection-source", reference: "SRC-9001" }, provenance: { method: "integration" }, purpose: "early-support-review", classification: "personal", context,
    });
    const good = { who: SIGNAL.alias, ask: "x", duration: "x", contact: "x", note: "x", origin: "x", source: "x", reference: "x", basis: "x", freshness: "Current" };
    const route = { destination: "reviewer-fictional" };
    const facts = { ...w.facts() };
    assert.equal(openCoordination(w.config, base({ ...good, score: "7" }), route, w.intake(), facts).ok, false, "an extra (scoring) field is refused");
    const { basis, ...missing } = good; void basis;
    assert.equal(openCoordination(w.config, base(missing), route, w.intake(), facts).ok, false, "a missing field is refused");
    assert.equal(openCoordination(w.config, { ...base(good), purpose: "marketing" }, route, w.intake(), facts).ok, false, "a wrong purpose is refused");
    assert.equal(openCoordination(w.config, { ...base(good), classification: "sensitive" }, route, w.intake(), facts).ok, false, "a higher data class is refused");
    assert.equal(openCoordination(w.config, base(good), route, w.intake(), facts).ok, true, "the well-formed event is admitted");
  });
});

describe("Selecting or reading a scenario creates no operational record", () => {
  it("selection, variants and every projection write nothing before the event is admitted", () => {
    const w = new ProtectionWorld();
    w.selectScenario("early-support"); w.applyP2Preset("p2-missing"); w.setVariant({ contact: "not-permitted" });
    customerView(w); operatorView(w); operationsView(w); w.holder(); w.assurance();
    assert.equal(w.state, null); assert.equal(w.evidence.length, 0); assert.equal(w.history.length, 0); assert.equal(w.actions().length, 0);
    const c = dump(customerView(w));
    for (const leak of ["SRC-9001", "R-14", "review", "signal", "Upstream", "Missing", "C-2087"]) assert.equal(c.includes(leak), false, `customer view leaked ${leak} before admission`);
  });
  it("admission is explicit and happens once; nothing is prepared, approved or sent by it", () => {
    const w = new ProtectionWorld();
    w.selectScenario("early-support");
    assert.ok(w.admitSignal().ok);
    assert.equal(w.admitSignal().ok, false);
    assert.equal(w.actions().length, 0);
    assert.equal(w.evidence.some((e) => /^(approval|execution|disclosure)/.test(e.kind)), false);
  });
});

describe("Missing, stale and unsupported source context block the discretionary action", () => {
  for (const preset of ["p2-missing", "p2-stale"] as const) {
    it(`${preset}: the check-in cannot be proposed, submitted, approved or sent (direct commands)`, () => {
      const w = review(preset);
      const expected = preset === "p2-missing" ? "Missing" : "Stale";
      assert.equal(w.state!.request.find((f) => f.id === "freshness")!.value, expected);
      const p = direct(w, { type: "propose", actionType: "early-support-checkin" });
      assert.equal(p.ok, false); assert.equal(code(p), "context_not_current");
      assert.match(msg(p), /Existing protections are not changed/);
      assert.equal(w.actions().length, 0);
      assert.equal(operatorView(w).offers.find((o) => o.key === "propose:early-support-checkin")!.disabledReason !== undefined, true);
    });
  }
  it("clarification is available, goes to the source with reference only, and does not refresh the review", () => {
    const w = review("p2-missing");
    assert.ok(w.propose("context-clarification-request").ok);
    assert.ok(w.submit("CLR-1").ok); assert.ok(w.approve("CLR-1").ok); assert.ok(w.dispatch("CLR-1").ok);
    const fields = w.action("CLR-1")!.fields.map((f) => f.label).join("|");
    assert.equal(/Customer|contact|reason/i.test(fields), false, fields);
    for (let i = 0; i < 3; i++) w.connectorStep("CLR-1");
    assert.equal(w.action("CLR-1")!.state, "completed");
    assert.equal(w.state!.request.find((f) => f.id === "freshness")!.value, "Missing", "a refresh is unavailable; the frozen context is unchanged");
    assert.equal(w.propose("early-support-checkin").ok, false, "completing a clarification does not unblock the check-in");
  });
  it("blocked review shows the reasons, says existing protections are unchanged, and shows the no-action decision as unavailable", () => {
    const w = review("p2-missing");
    const card = operatorView(w).review!;
    assert.equal(card.context.state, "missing");
    assert.equal(card.decisions[0].status, "blocked");
    assert.match(card.decisions[0].why!, /missing/i);
    assert.equal(card.decisions[2].status, "unavailable");
    assert.match(card.protections, /Nothing existing is removed, delayed or weakened/);
    assert.equal(w.actions().some((a) => ["account-break", "marketing-suppression"].includes(a.typeId)), false);
  });
});

describe("No automatic action and no cross-scenario controls", () => {
  it("nothing is prepared, approved or sent automatically, and P1 controls are refused in the early-support scenario", () => {
    const w = review();
    assert.equal(w.preparePlan().ok, false);
    assert.equal(w.actions().length, 0);
    for (const t of ["account-break", "marketing-suppression", "support-handover", "account-break-correction", "customer-account-notice"]) {
      const r = direct(w, { type: "propose", actionType: t });
      assert.equal(r.ok, false, t); assert.equal(code(r), "not_in_scenario", t);
    }
    assert.equal(w.actions().length, 0);
  });
  it("the reverse also holds: early-support actions are refused in the customer-requested scenario", () => {
    const w = opened();
    for (const t of ["early-support-checkin", "context-clarification-request"]) assert.equal(code(direct(w, { type: "propose", actionType: t })), "not_in_scenario");
  });
  it("a signal never becomes the customer's request for a break", () => {
    const w = prepared(); delivered(w);
    assert.equal(w.actions().some((a) => a.typeId === "account-break"), false);
    assert.equal(w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: FICTIONAL_NOTES[0].text }).ok, false);
  });
});

describe("Contact permission is never implied", () => {
  it("fresh context does not create permission: every route to the check-in is refused at the boundary", () => {
    const w = review("p2-no-permission");
    assert.equal(w.contextState(), "current");
    const r = direct(w, { type: "propose", actionType: "early-support-checkin" });
    assert.equal(r.ok, false); assert.equal(code(r), "permission_declined");
    assert.match(msg(r), /Fresh context does not create contact permission/);
    assert.equal(w.propose("early-support-checkin").ok, false);
    assert.equal(w.actions().length, 0);
    assert.equal(operatorView(w).policies.find((p) => p.id === "early-support-review-procedure")!.checks.some((c) => c.result === "needs-attention"), true);
  });
  it("clarification is still available without contact permission, and sends nothing to the customer", () => {
    const w = review("p2-no-permission");
    assert.ok(w.propose("context-clarification-request").ok);
    assert.equal(customerView(w).invitation, null);
  });
  it("only the customer's own recorded choice permits it, and only from then on", () => {
    const w = review("p2-no-permission");
    assert.equal(w.propose("early-support-checkin").ok, false);
    assert.ok(w.changeContactChoice(CONTACT_CHOICES[0].id).ok);
    assert.ok(w.propose("early-support-checkin").ok);
  });
  it("a stale approval cannot be sent after permission is withdrawn, and works again if the customer permits it again", () => {
    const w = prepared();
    assert.ok(w.approve("IAM-1").ok);
    const frozen = dump(w.action("IAM-1")!.fields);
    w.changeContactChoice(CONTACT_CHOICES[1].id);
    const d = w.dispatch("IAM-1");
    assert.equal(d.ok, false); assert.equal(code(d), "permission_declined");
    assert.equal(w.action("IAM-1")!.attempts.length, 0);
    assert.equal(dump(w.action("IAM-1")!.fields), frozen, "the disclosure is not rewritten");
    w.changeContactChoice(CONTACT_CHOICES[0].id);
    assert.ok(w.dispatch("IAM-1").ok);
  });
  it("withdrawn permission also stops submit and approve", () => {
    const w = review();
    w.propose("early-support-checkin");
    w.changeContactChoice(CONTACT_CHOICES[1].id);
    assert.equal(w.submit("IAM-1").ok, false);
    assert.equal(direct(w, { type: "approve", actionId: "IAM-1", checks: A4 }).ok, false);
  });
});

describe("Human authority", () => {
  it("revoked authority refuses approval and send; restored authority is checked afresh", () => {
    const w = prepared();
    w.setReviewerRevoked(true);
    assert.equal(w.approve("IAM-1").ok, false);
    assert.match(msg(w.approve("IAM-1")), /revoked|expired/);
    w.setReviewerRevoked(false);
    assert.ok(w.approve("IAM-1").ok);
    w.setReviewerRevoked(true);
    assert.equal(w.dispatch("IAM-1").ok, false);
    assert.equal(w.action("IAM-1")!.sentAt, null);
  });
  it("Operations and a support agent have no standing; the reviewer alone approves, with named authority recorded", () => {
    const w = prepared();
    assert.equal(w.tryAs("operations", { type: "approve", actionId: "IAM-1", checks: A4 }, "x").ok, false);
    assert.equal(w.tryAs("support", { type: "approve", actionId: "IAM-1", checks: A4 }, "x").ok, false);
    assert.ok(w.approve("IAM-1").ok);
    assert.equal(w.action("IAM-1")!.approval!.by.id, "reviewer-fictional");
  });
  it("a decision not to proceed is recorded, not erased, and sends nothing", () => {
    const w = prepared();
    assert.ok(w.refuseApproval("IAM-1").ok);
    assert.equal(w.action("IAM-1")!.state, "not_approved");
    assert.ok(w.evidence.some((e) => e.kind === "approval.refused" && e.actionId === "IAM-1"));
    assert.equal(w.dispatch("IAM-1").ok, false);
    assert.equal(customerView(w).invitation, null);
  });
});

describe("One permitted action, with exactly the evidence each step supports", () => {
  it("proposal → approval → dispatch → receipt → acceptance → completion → confirmation, each distinct", () => {
    const w = prepared();
    const stage = () => w.stage(w.action("IAM-1")!).label;
    assert.equal(stage(), "Proposed");
    assert.ok(w.approve("IAM-1").ok); assert.equal(stage(), "Approved");
    assert.ok(w.dispatch("IAM-1").ok); assert.equal(stage(), "Sent");
    w.connectorStep("IAM-1"); assert.equal(stage(), "Acknowledged — received");
    w.connectorStep("IAM-1"); assert.equal(stage(), "Acknowledged — accepted");
    w.connectorStep("IAM-1"); assert.match(stage(), /^Applied — reported/);
    assert.equal(w.confirm("IAM-1").ok, false, "confirmation needs the simulated read-back");
    assert.ok(w.readBack("IAM-1").ok);
    assert.ok(direct(w, { type: "confirm", actionId: "IAM-1" }).ok);
    assert.match(stage(), /^Confirmed/);
    const text = w.evidence.filter((e) => e.actionId === "IAM-1").map((e) => e.text).join(" ");
    assert.match(text, /Sending is not receipt/);
    assert.match(text, /Completion is not confirmation/);
    assert.match(text, /not proof that anyone is safe/);
    assert.equal(/reduced harm|improved|resolved|time saved/i.test(text), false);
  });
  it("the check-in discloses to the channel only the reference, template and wording", () => {
    const w = prepared(); delivered(w);
    const d = w.action("IAM-1")!.disclosure!;
    assert.deepEqual(d.fields.map((f) => f.label), ["Customer", "Template", "Message wording"]);
    const all = dump(d.fields);
    for (const never of ["R-14", "SRC-9001", "Reason code", "Contact choice", "Upstream", "Missing", "Stale"]) assert.equal(all.includes(never), false, never);
    assert.ok(d.withheld.length >= 3, "what was withheld is recorded");
  });
});

describe("Customer: no disclosure before release; a respectful invitation after", () => {
  it("sees nothing at any stage until the channel reports delivery", () => {
    const w = review();
    const clean = () => {
      const c = dump(customerView(w));
      for (const leak of ["SRC-9001", "R-14", "review", "signal", "Upstream", "IAM-1", "in-app-channel", "In-app message channel", "Protection reviewer", "C-2087"]) assert.equal(c.includes(leak), false, `leaked ${leak}`);
      assert.equal(customerView(w).invitation, null);
      assert.equal(customerView(w).updates.length, 0);
    };
    clean();
    w.propose("early-support-checkin"); clean();
    w.submit("IAM-1"); clean();
    w.approve("IAM-1"); clean();
    w.dispatch("IAM-1"); clean();
    w.connectorStep("IAM-1"); clean();
    w.connectorStep("IAM-1"); clean();
    w.connectorStep("IAM-1");
    assert.notEqual(customerView(w).invitation, null);
  });
  it("then sees only the fixed, supportive, non-promotional wording: no label, inducement, account feed or AI claim", () => {
    const w = prepared(); delivered(w);
    const v = customerView(w);
    assert.equal(v.invitation!.title, "A message from the team");
    assert.match(v.invitation!.body, /support is available if you would ever like it/);
    assert.match(v.invitation!.body, /Nothing on your account changes unless you ask/);
    const all = dump(v);
    for (const bad of [/risk/i, /vulnerab/i, /problem/i, /bonus|offer|free|reward|deposit/i, /\bAI\b/, /\bwe noticed\b/i, /IAM-1|SRC-9001|R-14/]) assert.equal(bad.test(all), false, String(bad));
    assert.equal(v.parts.length, 0, "no account activity feed or protection status");
    assert.equal(v.hasRequest, false, "the customer has no request; none is invented");
  });
  it("a decline is recorded as their choice, stops optional outreach, and is not a penalty or a resolution", () => {
    const w = prepared(); delivered(w);
    assert.ok(w.changeContactChoice(CONTACT_CHOICES[1].id).ok);
    const v = customerView(w);
    assert.equal(v.optedOut, true);
    assert.notEqual(v.invitation, null, "the message is not taken back");
    assert.equal(w.actions().some((a) => ["account-break", "marketing-suppression"].includes(a.typeId)), false, "no restriction follows");
    assert.equal(w.propose("early-support-checkin").ok, false, "no further optional outreach");
    assert.equal(w.action("IAM-1")!.state, "completed", "operator responsibilities and records remain");
    assert.equal(dump(v).includes("resolved"), false);
  });
  it("opening the message is not recorded and is not consent; not responding changes nothing", () => {
    const w = prepared(); delivered(w);
    const before = w.history.length, ev = w.evidence.length;
    customerView(w); customerView(w);
    assert.equal(w.history.length, before); assert.equal(w.evidence.length, ev);
    assert.equal(w.evidence.some((e) => e.actor?.kind === "party" && e.actor.id === "customer"), false);
  });
  it("a later break needs the customer's own separately recorded request and is unavailable in this scenario", () => {
    const w = prepared(); delivered(w);
    const r = w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: FICTIONAL_NOTES[0].text });
    assert.equal(r.ok, false); assert.equal(code(r), "wrong_scenario");
    assert.equal(w.actions().length, 1);
  });
});

describe("Recipient isolation", () => {
  it("Operations receives only the scoped instruction fields: no context, basis, freshness, contact record or invitation text", () => {
    const w = prepared(); delivered(w);
    w.propose("context-clarification-request"); w.submit("CLR-1"); w.approve("CLR-1"); w.dispatch("CLR-1");
    const ops = operationsView(w);
    assert.deepEqual(ops.delivery[0].fields.map((f) => f.label), ["Customer", "Template"]);
    assert.deepEqual(ops.clarification[0].fields.map((f) => f.label), ["Source reference", "Request"]);
    const s = dump(ops);
    for (const never of ["R-14", "Reason code", "Basis supplied by the source", "Source context", "Current", "Contact choice", "Updates in the app", "support is available", "Nothing on your account"]) {
      assert.equal(s.includes(never), false, `Operations saw "${never}"`);
    }
    assert.equal(ops.evidence.some((e) => /R-14|Reason code|Updates in the app/.test(e.text)), false);
    assert.equal(ops.connectorLog.some((l) => /R-14|Reason/.test(l.text)), false);
  });
  it("Operations errors and gaps do not echo the customer's information", () => {
    const w = prepared(); w.approve("IAM-1"); w.dispatch("IAM-1");
    const r = w.tryAs("operations", { type: "approve", actionId: "IAM-1", checks: A4 }, "x");
    assert.equal(/R-14|SRC-9001|Updates in the app/.test(msg(r)), false);
    assert.equal(/R-14|SRC-9001/.test(dump(operationsView(w).gaps)), false);
  });
  it("the operator sees the review card; the customer never does", () => {
    const w = review();
    const card = operatorView(w).review!;
    assert.match(card.received, /customer has asked for nothing/);
    assert.match(card.limitations.join(" "), /not evidence that harm or wrongdoing occurred/);
    assert.equal(card.source.reference, SIGNAL.reference);
    assert.match(card.source.simulated, /Simulated/);
    assert.equal(card.policy.length, 2);
    assert.ok(card.unknowns.length >= 3);
    assert.equal(operatorView(opened()).review, null, "P1 shows no early-support card");
  });
  it("no projection returns the kernel's state object or a score, label or risk wording", () => {
    const w = prepared(); delivered(w);
    for (const v of [customerView(w), operatorView(w), operationsView(w)]) {
      const s = dump(v);
      assert.equal(s.includes("processedCommands"), false);
      assert.equal(/risk (score|rating|level)|vulnerab|propensity|behaviou?ral|problem gambl/i.test(s), false);
    }
  });
});

describe("Interruption: no blind retry, no new channel, no new recipient, fresh approval and current permission", () => {
  it("a refused delivery leaves a retry, then an unresolved gap; re-checking needs a fresh approval and current permission", () => {
    const w = prepared("p2-refused"); w.approve("IAM-1");
    assert.ok(w.dispatch("IAM-1").ok);
    assert.equal(w.stage(w.action("IAM-1")!).label, "Retry available — not sent");
    assert.ok(w.dispatch("IAM-1").ok);
    const a = () => w.action("IAM-1")!;
    assert.equal(a().state, "unresolved"); assert.equal(a().gap!.kind, "execution_failed");
    assert.equal(a().recipient, "in-app-channel");
    assert.equal(a().attempts.length, 2);
    assert.equal(w.dispatch("IAM-1").ok, false, "no third automatic attempt");
    assert.ok(operationsView(w).gaps.some((g) => g.actionId === "IAM-1"));
    assert.equal(customerView(w).invitation, null);
    // the authorised next step: re-check -> proposed -> fresh approval
    assert.ok(w.recheck("IAM-1").ok);
    assert.equal(a().approval, null, "the earlier approval is not reused");
    w.changeContactChoice(CONTACT_CHOICES[1].id);
    assert.equal(w.submit("IAM-1").ok, false, "current permission is checked again");
    w.changeContactChoice(CONTACT_CHOICES[0].id);
    assert.ok(w.submit("IAM-1").ok);
    w.setReviewerRevoked(true);
    assert.equal(w.approve("IAM-1").ok, false, "approval authority is checked again");
    w.setReviewerRevoked(false);
    assert.ok(w.approve("IAM-1").ok);
    assert.equal(a().attempts.length, 2, "approval does not itself send");
  });
  it("an unknown outcome is not a known failure: never retried, reconciled by a separate person against the receiving log", () => {
    const w = prepared("p2-unknown"); w.approve("IAM-1"); w.dispatch("IAM-1");
    const a = () => w.action("IAM-1")!;
    assert.equal(a().gap!.kind, "dispatch_uncertain"); assert.equal(a().sentAt, null);
    for (const c of [{ type: "execute", actionId: "IAM-1" }, { type: "recheck", actionId: "IAM-1" }, { type: "withdraw", actionId: "IAM-1" }, { type: "submit", actionId: "IAM-1" }, { type: "propose", actionType: "early-support-checkin" }] as const) {
      assert.equal(direct(w, c as never).ok, false, c.type);
    }
    assert.equal(w.command({ type: "reconcileDispatch", actionId: "IAM-1", finding: "verified_delivered", evidenceReference: "LOG-IN-1", account: "I looked myself.", basis: { kind: "purpose-grant" } }, w.reviewer(), "x").ok, false, "the holder cannot reconcile their own send");
    const log = w.receivingSystemLog("IAM-1")!;
    assert.ok(w.reconcile("IAM-1", log.delivered ? "verified_delivered" : "verified_not_delivered", log.reference, "The receiving system's log shows the request arrived.").ok);
    assert.equal(a().attempts.length, 1);
    assert.equal(customerView(w).invitation, null, "reconciled as sent is still not delivered to the customer");
  });
  it("approved but never accepted stays Sent and flagged; the expectation passes after a day; nothing is re-sent or re-routed", () => {
    const w = prepared("p2-unaccepted"); w.approve("IAM-1"); w.dispatch("IAM-1");
    assert.equal(w.connectorStep("IAM-1").ok, false);
    assert.equal(operationsView(w).delivery[0].notYetAccepted, true);
    assert.equal(w.recommendations().length, 0);
    w.advanceDays(1);
    const rec = w.recommendations();
    assert.equal(rec[0].ruleId, "expectation-passed"); assert.equal(rec[0].pathway, null);
    assert.equal(w.dispatch("IAM-1").ok, false);
    assert.equal(w.action("IAM-1")!.attempts.length, 1);
    assert.equal(customerView(w).invitation, null);
  });
  it("unavailable after accepting: no permitted route is configured, and the app says so without inventing a provider", () => {
    const w = prepared("p2-unavailable"); w.approve("IAM-1"); w.dispatch("IAM-1"); w.connectorStep("IAM-1"); w.connectorStep("IAM-1");
    assert.ok(w.recordCapacity("in-app-channel", "unavailable").ok);
    assert.equal(w.stage(w.action("IAM-1")!).stage, "unresolved");
    const rec = w.recommendations().find((r) => r.ruleId === "capacity-lost-after-acceptance")!;
    assert.equal(rec.pathway, null);
    assert.match(rec.title, /no other pathway is configured/);
    const card = dump(operatorView(w));
    assert.equal(/someone is (working|handling)|actively/i.test(card + dump(operationsView(w)) + dump(customerView(w))), false);
    assert.equal(direct(w, { type: "propose", actionType: "early-support-checkin" }).ok, false, "no second check-in to another route");
    assert.equal(w.actions().filter((a) => a.typeId === "early-support-checkin").length, 1);
    assert.equal(customerView(w).invitation, null);
  });
  it("a stale approval is refused even while recovering: the boundary reads current permission at every step", () => {
    const w = prepared("p2-refused"); w.approve("IAM-1"); w.dispatch("IAM-1"); w.dispatch("IAM-1"); w.recheck("IAM-1"); w.submit("IAM-1"); w.approve("IAM-1");
    w.changeContactChoice(CONTACT_CHOICES[1].id);
    assert.equal(w.dispatch("IAM-1").ok, false);
  });
});

describe("Preserved P1 boundaries still apply in and across scenarios", () => {
  it("a direct confirm needs the latest matching read-back for the check-in", () => {
    const w = prepared(); w.approve("IAM-1"); w.dispatch("IAM-1"); for (let i = 0; i < 3; i++) w.connectorStep("IAM-1");
    assert.equal(code(direct(w, { type: "confirm", actionId: "IAM-1" })), "readback_required");
    w.setReadBack("in-app-channel", "does-not-match"); w.readBack("IAM-1");
    assert.equal(code(direct(w, { type: "confirm", actionId: "IAM-1" })), "readback_required");
    assert.equal(w.action("IAM-1")!.confirmedBy, null);
  });
  it("P1 corrections are not available in P2", () => {
    const w = review();
    assert.equal(code(direct(w, { type: "propose", actionType: "account-break-correction" })), "not_in_scenario");
  });
});

describe("Scenario switching and reset: no state leaks across scenarios", () => {
  it("switching with records is refused until an explicit reset; reset clears records, permissions, approvals, messages, scripts and variants", () => {
    const w = prepared("p2-refused"); w.approve("IAM-1"); w.dispatch("IAM-1"); w.changeContactChoice(CONTACT_CHOICES[1].id); w.setReviewerRevoked(true);
    const r = w.selectScenario("customer-break");
    assert.equal(r.ok, false); assert.equal(code(r), "reset_required");
    assert.equal(w.scenario, "early-support");
    w.reset();
    assert.equal(w.scenario, "customer-break");
    assert.equal(w.state, null); assert.equal(w.evidence.length, 0); assert.equal(w.history.length, 0); assert.equal(w.readBacks.length, 0); assert.equal(w.connectorLog.length, 0);
    assert.equal(w.currentContact, null); assert.equal(w.reviewerRevoked, false); assert.equal(w.variant.context, "current"); assert.equal(w.variant.contact, "permitted");
    assert.equal(w.scripts["in-app-channel"].behaviour, "applies");
    assert.equal(w.unavailable.size, 0);
  });
  it("after a P2 journey and reset, P1 starts clean and shows nothing from P2; the reverse holds too", () => {
    const w = prepared(); delivered(w);
    w.reset();
    assert.ok(w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: FICTIONAL_NOTES[1].text }).ok);
    assert.equal(customerView(w).invitation, null);
    const s = dump([customerView(w), operatorView(w)]);
    for (const leak of ["SRC-9001", "R-14", "C-2087", "IAM-1", "Early-support"]) assert.equal(s.includes(leak), false, `P1 leaked P2 content: ${leak}`);
    assert.equal(w.selectScenario("early-support").ok, false);
    w.reset(); w.selectScenario("early-support"); w.admitSignal();
    const t = dump([customerView(w), operatorView(w), operationsView(w)]);
    assert.equal(t.includes("REQ-0001"), false); assert.equal(t.includes("C-1042"), false);
  });
  it("selecting the same or the other scenario with no records changes nothing but the selection, and clears director scripts", () => {
    const w = new ProtectionWorld();
    w.setBehaviour("account-controls", "refuses");
    w.selectScenario("early-support");
    assert.equal(w.scripts["account-controls"].behaviour, "applies");
    assert.equal(w.state, null); assert.equal(w.history.length, 0);
  });
  it("the variant is frozen once the event is admitted", () => {
    const w = review();
    assert.equal(w.setVariant({ context: "missing" }).ok, false);
    assert.equal(w.applyP2Preset("p2-missing").ok, false);
    assert.equal(w.contextState(), "current");
  });
});

/**
 * COMMAND-BOUNDARY TEST, NOT A SOURCE REFRESH.
 *
 * Source context is frozen when the event is admitted, and a refresh is not implemented (a Core gap: one request event per
 * coordination). So the only way to exercise the post-proposal context guard on an EXISTING action is a test fixture that supplies
 * the context input: this subclass overrides the single read of the context input (`contextState()`). Nothing in the app does this.
 * Permission is present, the reviewer holds current authority, and the action exists in the stage under test, so the only thing that
 * can refuse each command is the context guard.
 */
class ContextFixtureWorld extends ProtectionWorld {
  fixture: ContextState | null = null;
  override contextState(): ContextState {
    return this.fixture ?? super.contextState();
  }
}
type Stage = "proposed" | "awaiting_approval" | "approved";
const STAGES: { stage: Stage; command: () => Parameters<ProtectionWorld["command"]>[0]; after: string; label: string }[] = [
  { stage: "proposed", command: () => ({ type: "submit", actionId: "IAM-1" }), after: "awaiting_approval", label: "submit" },
  { stage: "awaiting_approval", command: () => ({ type: "approve", actionId: "IAM-1", checks: A4 }), after: "approved", label: "approve" },
  { stage: "approved", command: () => ({ type: "execute", actionId: "IAM-1" }), after: "sent", label: "send" },
];
function existingCheckin(stage: Stage): ContextFixtureWorld {
  const w = new ContextFixtureWorld();
  assert.ok(w.selectScenario("early-support").ok);
  assert.ok(w.admitSignal().ok);
  assert.ok(w.acceptResponsibility().ok);
  assert.ok(w.propose("early-support-checkin").ok);
  if (stage !== "proposed") assert.ok(w.submit("IAM-1").ok);
  if (stage === "approved") assert.ok(w.approve("IAM-1").ok);
  // The preconditions the refusal must NOT rest on:
  assert.equal(w.action("IAM-1")!.state, stage === "proposed" ? "proposed" : stage === "awaiting_approval" ? "awaiting_approval" : "approved");
  assert.equal(w.supportOutreachPermitted(), true, "permission is present");
  assert.equal(w.reviewerRevoked, false, "the reviewer's authority is current");
  assert.equal(w.contextState(), "current");
  return w;
}
const snapshot = (w: ProtectionWorld) => ({
  action: dump(w.action("IAM-1")),
  evidence: w.evidence.length,
  kinds: w.evidence.map((e) => e.kind).join(","),
  attempts: w.action("IAM-1")!.attempts.length,
  readBacks: w.readBacks.length,
  connectorLog: w.connectorLog.length,
});

describe("Command-boundary context guard on an EXISTING check-in (test fixture supplies the context input; not a source refresh)", () => {
  for (const { stage, command, after, label } of STAGES) {
    it(`${label}: with current context the command succeeds (positive control, ${stage})`, () => {
      const w = existingCheckin(stage);
      const r = w.command(command(), w.reviewer(), `direct ${label}`);
      assert.ok(r.ok, msg(r));
      assert.equal(w.action("IAM-1")!.state, after);
    });
    for (const ctx of ["stale", "missing"] as const) {
      it(`${label}: ${ctx} context is refused with context_not_current, and nothing changes`, () => {
        const w = existingCheckin(stage);
        w.fixture = ctx;
        const before = snapshot(w);
        const historyBefore = w.history.length;
        const r = w.command(command(), w.reviewer(), `direct ${label}`);
        assert.equal(r.ok, false);
        assert.equal(code(r), "context_not_current", "the specific context refusal, not a permission, authority or state refusal");
        assert.match(msg(r), new RegExp(`source context is ${ctx}`));
        assert.match(msg(r), /Clarification can be requested instead/);
        assert.match(msg(r), /Existing protections are not changed/);
        assert.equal(/contact choice|permission|revoked|Not found/i.test(msg(r).replace(/Fresh context does not create contact permission\./, "")), false, "the refusal does not rest on permission, authority or standing");
        // preserved history and no side effects
        const after2 = snapshot(w);
        assert.deepEqual(after2, before, "action, approval, disclosure, evidence, attempts and logs are unchanged");
        assert.equal(w.action("IAM-1")!.state, stage === "proposed" ? "proposed" : stage === "awaiting_approval" ? "awaiting_approval" : "approved");
        assert.equal(w.action("IAM-1")!.attempts.length, 0, "no dispatch attempt");
        assert.equal(w.action("IAM-1")!.sentAt, null);
        assert.equal(w.action("IAM-1")!.disclosure, null, "nothing was disclosed");
        assert.equal(w.evidence.some((e) => /^execution\./.test(e.kind) || e.kind === "disclosure.made"), false, "no execution or disclosure evidence was written");
        assert.equal(customerView(w).invitation, null);
        // the refusal is itself recorded in the session history, in the boundary's own words
        assert.equal(w.history.length, historyBefore + 1);
        assert.equal(w.history[w.history.length - 1].ok, false);
        // the context was the ONLY blocker: the same command succeeds once the fixture is current again
        w.fixture = null;
        assert.ok(w.command(command(), w.reviewer(), `direct ${label}`).ok);
        assert.equal(w.action("IAM-1")!.state, after);
      });
    }
  }
  it("approval history is preserved: an approved check-in stays approved, with its named approver, when context goes stale before send", () => {
    const w = existingCheckin("approved");
    const approval = dump(w.action("IAM-1")!.approval);
    w.fixture = "stale";
    assert.equal(code(w.command({ type: "execute", actionId: "IAM-1" }, w.reviewer(), "direct send")), "context_not_current");
    assert.equal(dump(w.action("IAM-1")!.approval), approval);
    assert.equal(w.action("IAM-1")!.approval!.by.id, "reviewer-fictional");
  });
  it("clarification is not blocked by the same guard (it is the permitted alternative)", () => {
    const w = existingCheckin("proposed");
    w.fixture = "stale";
    assert.ok(w.propose("context-clarification-request").ok);
  });
});

describe("The review card's decision list matches the records (inspection findings)", () => {
  it("a prepared, approved or sent check-in is no longer listed as available to prepare", () => {
    const w = review();
    assert.equal(operatorView(w).review!.decisions[0].status, "available");
    w.propose("early-support-checkin");
    const d = operatorView(w).review!.decisions[0];
    assert.equal(d.status, "unavailable");
    assert.match(d.why!, /Already prepared as IAM-1: Proposed/);
    w.submit("IAM-1"); w.approve("IAM-1"); w.dispatch("IAM-1");
    assert.match(operatorView(w).review!.decisions[0].why!, /Already prepared as IAM-1: Sent/);
    assert.equal(operatorView(w).review!.decisions[0].status, "unavailable");
  });
  it("a recorded decision not to proceed is shown as such, not as an open choice", () => {
    const w = review(); w.propose("early-support-checkin"); w.submit("IAM-1"); w.refuseApproval("IAM-1");
    assert.match(operatorView(w).review!.decisions[0].why!, /decision not to proceed/);
  });
  it("a requested clarification is no longer offered again, and says it does not refresh the review", () => {
    const w = review("p2-missing"); w.propose("context-clarification-request");
    const d = operatorView(w).review!.decisions[1];
    assert.equal(d.status, "unavailable");
    assert.match(d.why!, /does not refresh this review/);
  });
  it("where no pathway exists, 'who decides' does not imply a recovery can be proposed", () => {
    const w = prepared("p2-unavailable"); w.approve("IAM-1"); w.dispatch("IAM-1"); w.connectorStep("IAM-1"); w.connectorStep("IAM-1");
    w.recordCapacity("in-app-channel", "unavailable");
    const rec = operatorView(w).recommendations.find((r) => /no other pathway is configured/.test(r.title))!;
    assert.ok(rec);
    assert.equal(/propose the recovery/i.test(rec.whoDecides), false);
    assert.match(rec.whoDecides, /Where a pathway is configured/);
  });
});
