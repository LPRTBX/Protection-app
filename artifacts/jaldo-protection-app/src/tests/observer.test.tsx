import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { experienceOf } from "../ui/nav";
import { ProtectionWorld } from "../sim/session";
import { operationsView } from "../sim/views";
import { CONTACT_CHOICES, FICTIONAL_NOTES } from "../sim/scope";
import { customerSnapshot, diffSnapshots, operationsSnapshot, reviewerSnapshot, snapshotOf, type PanelId } from "../ui/observer/changes";

const NOTE = FICTIONAL_NOTES[1].text;
const html = (w: ProtectionWorld, route?: string) => renderToStaticMarkup(<App world={w} initialRoute={route} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const at = (h: string, n: string) => { const i = h.indexOf(n); assert.ok(i >= 0, `missing ${n}`); return i; };
const panelOf = (h: string, id: PanelId) => { const s = h.indexOf(`id="panel-${id}"`); const next = ["customer", "reviewer", "operations"].filter((p) => p !== id).map((p) => h.indexOf(`id="panel-${p}"`)).filter((i) => i > s); return h.slice(s, next.length ? Math.min(...next) : h.indexOf("</main>")); };
const submitted = () => { const w = new ProtectionWorld(); assert.ok(w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: NOTE }).ok); return w; };
const planned = () => { const w = submitted(); w.acceptResponsibility(); w.preparePlan(); return w; };
const PANELS: PanelId[] = ["customer", "reviewer", "operations"];
const snaps = (w: ProtectionWorld) => Object.fromEntries(PANELS.map((p) => [p, snapshotOf(p, w)])) as Record<PanelId, ReturnType<typeof snapshotOf>>;
const changed = (before: ReturnType<typeof snaps>, after: ReturnType<typeof snaps>) => Object.fromEntries(PANELS.map((p) => [p, diffSnapshots(before[p], after[p]).map((c) => c.key)])) as Record<PanelId, string[]>;

describe("Cross-panel change detection comes only from real changes in each role's own projection", () => {
  it("an unchanged session reports no change in any panel", () => {
    const w = planned();
    assert.deepEqual(changed(snaps(w), snaps(w)), { customer: [], reviewer: [], operations: [] });
  });
  it("the customer's request changes the reviewer's screen, not Operations", () => {
    const w = new ProtectionWorld(); const before = snaps(w);
    w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: NOTE });
    const c = changed(before, snaps(w));
    assert.ok(c.reviewer.includes("request"), "the reviewer sees the request");
    assert.ok(c.customer.includes("headline"), "the customer's own status changed");
    assert.deepEqual(c.operations, [], "Operations sees nothing yet");
  });
  it("the reviewer taking responsibility changes what the customer sees", () => {
    const w = submitted(); const before = snaps(w);
    w.acceptResponsibility();
    const c = changed(before, snaps(w));
    assert.ok(c.customer.some((k) => k.startsWith("update:") || k === "headline"));
    assert.ok(c.reviewer.includes("request"));
  });
  it("approval alone changes the reviewer's and Operations' records but advances no destination", () => {
    const w = planned(); const log = w.connectorLog.length; const rb = w.readBacks.length; const before = snaps(w);
    assert.ok(w.approve("ACB-1").ok);
    const after = snaps(w); const c = changed(before, after);
    assert.ok(c.reviewer.includes("action:ACB-1"));
    assert.ok(c.operations.includes("row:ACB-1"), "Operations sees that it is approved");
    const row = operationsView(w).account.find((r) => r.id === "ACB-1")!;
    assert.equal(row.stage, "approved"); assert.equal(row.attempts.length, 0); assert.equal(row.nextStep, null, "no destination step is even offered before it is sent");
    assert.equal(w.connectorLog.length, log, "no destination wrote anything"); assert.equal(w.readBacks.length, rb, "no read-back ran");
    assert.deepEqual(c.customer, [], "the customer is told nothing by an approval");
  });
  it("sending reaches the destination but does not make it receive, accept or execute", () => {
    const w = planned(); w.approve("ACB-1"); const before = snaps(w);
    assert.ok(w.dispatch("ACB-1").ok);
    const c = changed(before, snaps(w));
    assert.ok(c.operations.includes("row:ACB-1") && c.reviewer.includes("action:ACB-1"));
    const row = operationsView(w).account.find((r) => r.id === "ACB-1")!;
    assert.equal(row.stage, "sent"); assert.ok(row.attempts.some((a) => a.result === "delivered")); assert.ok(row.nextStep, "the destination's own step is now available");
  });
  it("the destination's receive, accept and execute are separate steps, each visible to the reviewer", () => {
    const w = planned(); w.approve("ACB-1"); w.dispatch("ACB-1");
    const stages: string[] = [];
    for (let i = 0; i < 3; i++) {
      const before = snaps(w);
      assert.ok(w.connectorStep("ACB-1").ok);
      stages.push(operationsView(w).account.find((r) => r.id === "ACB-1")!.stage);
      assert.ok(changed(before, snaps(w)).reviewer.includes("action:ACB-1"), "the reviewer's screen changed with no action in it");
    }
    assert.deepEqual(stages, ["acknowledged", "acknowledged", "applied"]);
  });
  it("only a verified, authorised message changes what the customer is told", () => {
    const w = planned(); w.approve("ACB-1"); w.dispatch("ACB-1");
    for (let i = 0; i < 3; i++) w.connectorStep("ACB-1");
    let before = snaps(w);
    w.readBack("ACB-1");
    assert.deepEqual(changed(before, snaps(w)).customer, [], "a read-back alone tells the customer nothing");
    before = snaps(w); assert.ok(w.confirm("ACB-1").ok);
    assert.deepEqual(changed(before, snaps(w)).customer, [], "nor does the reviewer's confirmation");
    w.approve("CAN-1"); before = snaps(w);
    assert.ok(w.dispatch("CAN-1").ok);
    assert.ok(changed(before, snaps(w)).customer.some((k) => k === "part:account" || k === "headline" || k.startsWith("update:")), "an authorised message does");
  });
  it("a partial failure leaves the successful part and the unresolved gap visible", () => {
    const w = planned(); w.setBehaviour("marketing-suppression", "refuses");
    for (const id of ["ACB-1", "MKT-1"]) { w.approve(id); w.dispatch(id); }
    w.dispatch("MKT-1");
    for (let i = 0; i < 3; i++) w.connectorStep("ACB-1");
    w.readBack("ACB-1"); w.confirm("ACB-1");
    const v = operationsView(w);
    assert.equal(v.account.find((r) => r.id === "ACB-1")!.stage, "confirmed");
    assert.equal(v.marketing.find((r) => r.id === "MKT-1")!.stage, "unresolved");
    assert.ok(v.gaps.some((g) => g.what.includes("MKT-1")), "the gap stays listed");
    const s = operationsSnapshot(w);
    assert.ok(s["gap:" + v.gaps.find((g) => g.what.includes("MKT-1"))!.id]);
  });
});

describe("Role boundaries hold in the snapshots and in every panel", () => {
  it("each role's snapshot contains only that role's information", () => {
    const w = planned(); w.approve("ACB-1"); w.dispatch("ACB-1");
    const c = JSON.stringify(customerSnapshot(w)), r = JSON.stringify(reviewerSnapshot(w)), o = JSON.stringify(operationsSnapshot(w));
    for (const bad of [/ACB-1|MKT-1|CAN-1/, /REQ-0001/, /reviewer/i, /Account controls system/]) assert.doesNotMatch(c, bad, `customer ${bad}`);
    for (const bad of [/Simulate/, /read-back/i]) assert.doesNotMatch(r, bad, `reviewer ${bad}`);
    for (const bad of [new RegExp(NOTE.slice(0, 20)), /Updates in the app/, /Customer notice/, /CAN-1|CMN-1/]) assert.doesNotMatch(o, bad, `operations ${bad}`);
  });
  it("the three panels render only their own role's information", () => {
    const w = planned(); w.approve("ACB-1"); w.dispatch("ACB-1");
    const h = html(w, "observe");
    const c = text(panelOf(h, "customer")), r = text(panelOf(h, "reviewer")), o = text(panelOf(h, "operations"));
    for (const bad of [/ACB-1|MKT-1|CAN-1|CMN-1/, /REQ-0001/, /Protection reviewer \(fictional\)/, /Simulated destination/, /Account controls system/, /kernel/i, /Authorised by/]) assert.doesNotMatch(c, bad, `customer panel ${bad}`);
    for (const bad of [/Simulated destination controls/, /Simulate:/, /Run simulated read-back/, /When it is sent a request/]) assert.doesNotMatch(r, bad, `reviewer panel ${bad}`);
    for (const bad of [new RegExp(NOTE.slice(0, 20)), /Updates in the app/, /Customer notice/, /CAN-1|CMN-1/, /Take responsibility/, /Prepared customer message/, /Authority: I hold/]) assert.doesNotMatch(o, bad, `Operations panel ${bad}`);
  });
});

describe("The observer view: layout, labelling, no scripted advance, no role switching", () => {
  it("is its own route and the primary entry on the front door", () => {
    assert.deepEqual(experienceOf("#/observe"), { experience: "observe" });
    const h = html(new ProtectionWorld());
    const order = [...h.matchAll(/data-testid="experience-(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ["observe", "explore", "reviewer"]);
    assert.match(text(h), /See coordination across roles/);
    assert.match(h, /href="#\/observe"/); assert.match(h, /href="#\/guide"/); assert.match(h, /href="#\/reviewer"/);
  });
  it("is labelled a demonstration observer view and states the layout is presentation, not authentication", () => {
    const t = text(html(new ProtectionWorld(), "observe"));
    assert.match(t, /Demonstration observer view/);
    assert.match(t, /This layout is presentation, not authentication\. Server-enforced access remains a production requirement/);
    assert.match(t, /Nothing here advances by itself/);
    assert.match(t, /each person sees only their own screen/);
    assert.match(t, /A change made in one panel appears in the others as soon as it happens/);
  });
  it("shows the three roles together, in order, each named, with one page heading", () => {
    const h = html(new ProtectionWorld(), "observe");
    const order = ['id="panel-customer"', 'id="panel-reviewer"', 'id="panel-operations"'].map((x) => at(h, x));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal((h.match(/<h1[ >]/g) ?? []).length, 1);
    assert.doesNotMatch(h, / hidden=""/, "on a wide screen no panel is hidden");
  });
  it("has no link from any panel to another role's screens, and no story-stage control", () => {
    const OTHER: Record<PanelId, RegExp> = {
      customer: /href="#\/(reviewer|operator|operations|simulation|guide|learning)/,
      reviewer: /href="#\/(customer|operator|operations|simulation|guide|learning)/,
      operations: /href="#\/(customer|reviewer|operator|operations|simulation|guide|learning)/,
    };
    for (const w of [new ProtectionWorld(), submitted(), planned()]) {
      const h = html(w, "observe");
      for (const p of PANELS) assert.doesNotMatch(panelOf(h, p), OTHER[p], `${p} panel`);
      // Panel links are panel-scoped fragments. A page route ("#/...") inside a panel would be taken over by any host that turns such links into navigation.
      for (const p of PANELS) assert.doesNotMatch(panelOf(h, p), /href="#\//, `${p} panel has no page-route link`);
      assert.doesNotMatch(text(h), /next step|advance the story|play the story|continue the story/i);
    }
  });
  it("labels the simulated destination controls beside their system, as played by the demonstration", () => {
    const planned1 = panelOf(html(planned(), "observe"), "operations");
    assert.match(planned1, /aria-label="Simulated destination controls for Account controls system \(simulated\)"/);
    assert.match(text(planned1), /Simulated destination controls · Account controls system/);
    assert.match(text(planned1), /Played by the demonstration\. These settings decide how this system answers; they are not Operations staff and not the reviewer/);
    assert.ok((planned1.match(/Simulated destination</g) ?? []).length >= 2, "each destination is labelled simulated");
    const w = planned(); w.approve("ACB-1"); w.dispatch("ACB-1");
    const ops = text(panelOf(html(w, "observe"), "operations"));
    assert.match(ops, /Played by the demonstration, not by Operations staff or the reviewer/);
    assert.match(ops, /approving or sending never presses it/);
    assert.match(ops, /Simulated destination controls · Account controls system \(simulated\)/);
  });
  it("a destination states what it has actually been sent, and never calls a prepared or refused instruction received", () => {
    const w = planned();
    let ops = text(panelOf(html(w, "observe"), "operations"));
    assert.match(ops, /Prepared, not yet approved/);
    assert.doesNotMatch(ops, /Received from the reviewer's send/);
    w.approve("ACB-1");
    ops = text(panelOf(html(w, "observe"), "operations"));
    assert.match(ops, /Approved by the reviewer, not sent/); assert.doesNotMatch(ops, /Received from the reviewer's send/);
    w.dispatch("ACB-1");
    ops = text(panelOf(html(w, "observe"), "operations"));
    assert.match(ops, /Received from the reviewer's send: Account break/);
    const f = planned(); f.setBehaviour("marketing-suppression", "refuses"); f.approve("MKT-1"); f.dispatch("MKT-1");
    ops = text(panelOf(html(f, "observe"), "operations"));
    assert.match(ops, /A send was attempted and refused/); assert.doesNotMatch(ops, /Received from the reviewer's send: Marketing/);
  });
  it("keeps the reviewer-only experience, Explore and the governed-learning demonstration", () => {
    assert.match(text(html(new ProtectionWorld(), "reviewer")), /Reviewer role preview/);
    assert.match(html(new ProtectionWorld(), "guide"), /href="#\/learning"/);
    assert.match(html(new ProtectionWorld(), "learning"), /id="learning-review"/);
  });
  it("each panel has its own navigation and a focusable, named scroll region", () => {
    const h = html(new ProtectionWorld(), "observe");
    assert.equal((h.match(/class="obs-scroll"[^>]*tabindex="0"[^>]*role="region"/g) ?? []).length, 3);
    assert.match(h, /aria-label="Reviewer steps"/); assert.match(h, /aria-label="Operations sections"/); assert.match(h, /aria-label="Customer app"/);
  });
  it("an early-support session is flagged, not silently shown without a customer", () => {
    const w = new ProtectionWorld(); w.selectScenario("early-support");
    assert.match(html(w, "observe"), /data-testid="wrong-scenario"/);
  });
});
