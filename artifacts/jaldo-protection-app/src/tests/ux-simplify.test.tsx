import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { ProtectionWorld } from "../sim/session";
import { CONTACT_CHOICES } from "../sim/scope";
import { approveAndSend, confirmed, fullJourney, NOTE, opened } from "./helpers";

const html = (w: ProtectionWorld, route: string) => renderToStaticMarkup(<App world={w} initialRoute={route} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const submitted = () => {
  const w = new ProtectionWorld();
  w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE });
  return w;
};
const at = (h: string, needle: string) => { const i = h.indexOf(needle); assert.ok(i >= 0, `missing ${needle}`); return i; };
/** Everything before the first collapsible section is what a visitor sees without expanding anything. */
const primary = (h: string) => { const m = h.indexOf("<main"); return h.slice(m, h.indexOf("<details", m)); };

describe("Guide: introduction and current action first", () => {
  it("leads with the introduction and current action, then a collapsed whole journey, then secondary material", () => {
    const h = html(new ProtectionWorld(), "guide");
    assert.ok(at(h, 'class="lede"') < at(h, 'data-testid="next-step"'));
    assert.ok(at(h, 'data-testid="next-step"') < at(h, 'data-testid="journey-details"'));
    assert.ok(at(h, 'data-testid="journey-details"') < at(h, 'data-testid="scenario-choice"'));
    assert.ok(at(h, 'data-testid="scenario-choice"') < at(h, 'data-testid="failure-explorations"'));
    assert.ok(at(h, 'data-testid="failure-explorations"') < at(h, 'data-testid="learning-entry"'));
    assert.match(h, /<details class="secondary" data-testid="journey-details">/, "journey is collapsed by default");
    assert.match(text(h), /View the whole journey \(0 of 7 steps done\)/);
  });
  it("keeps the full seven steps available inside the collapsed journey", () => {
    const h = html(new ProtectionWorld(), "guide");
    const j = h.slice(at(h, 'data-testid="journey"'), at(h, 'data-testid="scenario-choice"'));
    assert.equal((j.match(/<li data-done=/g) ?? []).length, 7);
  });
  it("shows one concise simulation notice and no implementation explanation in the primary copy", () => {
    const h = html(new ProtectionWorld(), "guide");
    assert.equal((text(h).match(/Fictional data, in this browser only/g) ?? []).length, 1);
    assert.doesNotMatch(text(h), /Everything here is fictional/);
    const p = text(primary(h));
    for (const bad of [/kernel/i, /Core OS/i, /read from the/i, /stand-in/i, /orchestrat/i]) assert.doesNotMatch(p, bad, String(bad));
  });
  it("the current action follows the records in both scenarios", () => {
    assert.match(text(html(new ProtectionWorld(), "guide")), /Step 1 of 7/);
    assert.match(text(html(submitted(), "guide")), /Step 2 of 7/);
    const e = new ProtectionWorld(); e.selectScenario("early-support");
    assert.match(text(html(e, "guide")), /Step 1 of 7/);
  });
});

describe("Reviewer: summary, status and next action together; detail collapsed; checks preserved", () => {
  it("one panel holds the request summary, status, next action and the responsibility control", () => {
    const h = html(submitted(), "operator");
    const panel = h.slice(at(h, 'id="queue"'), at(h, 'id="policies"'));
    for (const t of ['data-testid="request-summary"', 'id="next"', 'id="responsibility"']) assert.ok(panel.includes(t), t);
    const t = text(panel);
    assert.match(t, /REQ-0001/); assert.match(t, /Break request · 7 days/);
    assert.match(t, /Waiting for a reviewer to take responsibility/);
    assert.match(t, /Contact choice now:/);
    assert.match(t, /Accept responsibility for the request/);
    assert.match(t, /Take responsibility for this request/);
  });
  it("every required check stays on the responsibility control", () => {
    const t = text(html(submitted(), "operator"));
    for (const c of ["Authority: I hold the Protection reviewer responsibility", "Conflict: I have no conflict", "Capacity: I can act on this request"]) assert.ok(t.includes(c), c);
  });
  it("applicable requirements and the customer's request stay visible; provenance, authority and audit history collapse", () => {
    const w = opened();
    const h = html(w, "operator");
    const outsideDetails = h.replace(/<details[\s\S]*?<\/details>/g, "");
    assert.match(text(outsideDetails), /Applicable policies/);
    assert.match(text(outsideDetails), /Break request procedure \(fictional\)/);
    assert.match(text(outsideDetails), /Communication permissions/);
    assert.match(text(outsideDetails), /Length of break/);
    for (const id of ["provenance", "authority-details", "audit-history"]) assert.match(h, new RegExp(`<details class="secondary"[^>]*data-testid="${id}"`), id);
    assert.doesNotMatch(h, /<details class="secondary"[^>]*data-testid="(provenance|authority-details|audit-history)" open/);
  });
  it("the order is summary, decision, requirements, request, authority, audit history", () => {
    const h = html(opened(), "operator");
    const order = ['id="queue"', 'id="actions"', 'id="policies"', 'id="request"', 'id="authority"', 'id="record"'].map((x) => at(h, x));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });
  it("a revoked responsibility is visible without expanding anything", () => {
    const w = opened(); w.setReviewerRevoked(true);
    const h = html(w, "operator");
    assert.match(text(h.replace(/<details[\s\S]*?<\/details>/g, "")), /Your responsibility is revoked/);
    assert.match(h, /data-testid="authority-revoked"/);
  });
  it("an approval is still separate from sending: approving offers no send until authorised", () => {
    const h = text(html(opened(), "operator"));
    assert.match(h, /Approve: Account break/); assert.match(h, /Not yet authorised by anyone/);
  });
});

describe("Operations and Customer: action first, pending and unknown states kept", () => {
  it("Operations shows what is still open first, then counts, then execution grouped by availability, then collapsed simulation controls and evidence", () => {
    const h = html(fullJourney(), "operations");
    const order = ['id="gaps"', 'id="overview"', 'id="work"', 'id="ops-available"', 'id="ops-waiting"', 'id="ops-done"', 'id="simulation-controls"', 'id="evidence"'].map((x) => at(h, x));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.match(h, /<details class="secondary" id="evidence" data-testid="evidence-details">/);
    assert.match(h, /<details class="secondary" data-testid="state-definitions">/);
    assert.match(text(h), /Sent is not received\. Received is not accepted\./);
  });
  it("simulation controls are one labelled, collapsed section and are not part of the primary flow", () => {
    const h = html(opened(), "operations");
    assert.match(h, /<details class="secondary" id="simulation-controls" data-testid="simulation-controls">/);
    const outside = h.replace(/<details[\s\S]*?<\/details>/g, "");
    assert.doesNotMatch(outside, /Record as unavailable|Try to approve/);
    assert.match(h.slice(at(h, 'id="simulation-controls"')), /Record as unavailable[\s\S]*Try to approve/);
    assert.match(text(h), /not part of a real operator's workflow/);
  });
  it("Customer keeps pending parts and the stop-now help visible; the step list is collapsed but present", () => {
    const h = html(submitted(), "customer/today");
    const visible = text(h.replace(/<details[\s\S]*?<\/details>/g, ""));
    assert.equal((visible.match(/Not confirmed yet/g) ?? []).length, 2);
    assert.match(visible, /Need to stop right now\?/);
    assert.match(visible, /Please do not rely on any part marked as not confirmed/);
    assert.match(h, /<details class="secondary" data-testid="what-happens">/);
    assert.match(text(h), /What happens next/);
  });
  it("Customer still shows no internal information", () => {
    const h = html(submitted(), "customer/today");
    const t = text(h.slice(h.indexOf('data-testid="customer-app"'), h.indexOf('aria-label="Customer app"')));
    for (const bad of [/REQ-0001/, /ACB-1/, /MKT-1/, /kernel/i, /reviewer note/i]) assert.doesNotMatch(t, bad);
  });
});

const sent = () => { const w = opened(); approveAndSend(w, "ACB-1"); approveAndSend(w, "MKT-1"); return w; };
const stripDetails = (h: string) => h.replace(/<details[\s\S]*?<\/details>/g, "");
const article = (h: string, id: string) => { const i = h.indexOf(`id="action-${id}"`); assert.ok(i >= 0, id); return h.slice(i, h.indexOf("</article>", i)); };

describe("Reviewer decisions: available, waiting and completed are distinct and accurate", () => {
  it("renders the three groups in order with counts, using the view's own state", () => {
    const h = html(sent(), "operator");
    const order = ['id="decisions-available"', 'id="decisions-waiting"', 'id="decisions-done"'].map((x) => at(h, x));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.match(text(h), /Available for your decision now \(\d+\)/);
    assert.match(text(h), /Waiting on another system or prerequisite \(4\)/);
    assert.match(text(h), /Completed \(0\)/);
  });
  it("authorised and sent: customer-notice approvals sit under waiting with their blocker; the prepared message sits under available", () => {
    const h = html(sent(), "operator");
    const avail = h.slice(at(h, 'id="decisions-available"'), at(h, 'id="decisions-waiting"'));
    const wait = h.slice(at(h, 'id="decisions-waiting"'), at(h, 'id="decisions-done"'));
    assert.match(avail, /Prepared customer message/);
    assert.match(avail, /Release this message to the customer/);
    assert.doesNotMatch(avail, /Customer notice: account break|Customer notice: marketing/);
    for (const id of ["CAN-1", "CMN-1"]) assert.match(article(wait, id) + "", /data-group="waiting"/);
    assert.match(text(stripDetails(wait)), /Not available yet: Held until: Account break confirmed/);
    assert.match(text(stripDetails(wait)), /Not available yet: Held until: Marketing suppression confirmed/);
  });
  it("a blocked approval is never presented as completable now", () => {
    const h = html(sent(), "operator");
    const next = text(h.slice(at(h, 'data-testid="next-steps"'), at(h, 'id="responsibility"')));
    assert.match(next, /Available for your decision now[\s\S]*Release the prepared message/);
    assert.match(next, /Not available yet[\s\S]*Approve Customer notice: account break[\s\S]*Cannot be completed now\. Held until/);
    const block = h.slice(at(h, 'data-testid="next-steps"'), at(h, 'id="responsibility"'));
    assert.equal((block.match(/Go to this decision/g) ?? []).length, 1, "only the available item links to a decision");
  });
  it("the guidance leads with an available action and says so plainly when none exists", () => {
    const w = opened(); approveAndSend(w, "ACB-1"); approveAndSend(w, "MKT-1");
    const t = text(html(w, "operator"));
    assert.ok(t.indexOf("Available for your decision now") < t.indexOf("Not available yet"));
  });
  it("completed actions move to Completed", () => {
    const w = opened(); approveAndSend(w, "ACB-1"); confirmed(w, "ACB-1");
    const h = html(w, "operator");
    assert.match(article(h.slice(at(h, 'id="decisions-done"')), "ACB-1"), /data-group="done"/);
  });
});

describe("Compact action summaries with an explicit review entry", () => {
  it("each action shows stage, authorisation and any blocker in the summary, with a closed 'Review this action' entry", () => {
    const h = html(sent(), "operator");
    const a = article(h, "CAN-1");
    assert.match(a, /<details class="review-action" data-testid="review-action">/);
    assert.doesNotMatch(a, /review-action"[^>]*open/);
    assert.match(text(stripDetails(a)), /Proposed/);
    assert.match(text(stripDetails(a)), /Not yet authorised by anyone/);
    assert.match(text(stripDetails(a)), /Not available yet: Held until/);
    assert.match(text(a), /Review this action/);
  });
  it("opened, the review shows context, exact sharing, policy requirements and the individual checks before the decision control", () => {
    const h = html(opened(), "operator");
    const a = article(h, "ACB-1");
    const body = a.slice(a.indexOf('class="review-body"'));
    const order = ["Exactly what would be shared", "Never shared", "Policy requirements", "Your decision", "Before you decide, check each", "Approve: Account break"].map((x) => { const i = body.indexOf(x); assert.ok(i >= 0, x); return i; });
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    for (const c of ["Recipient:", "Purpose:", "Exact fields:", "Authority:"]) assert.ok(body.includes(c), c);
    assert.match(text(body), /Met/);
  });
  it("an exception stays in the summary: an unconfirmed protection is visible without opening anything", () => {
    const w = opened(); approveAndSend(w, "ACB-1");
    const t = text(stripDetails(html(w, "operator")));
    assert.match(t, /Not yet accepted|has not said it received it/);
  });
  it("Operations rows use the same entry; simulated steps live inside it, labelled as simulated", () => {
    const h = html(sent(), "operations");
    const row = h.slice(at(h, 'id="ops-ACB-1"'));
    assert.match(row, /<details class="review-action" data-testid="review-action">/);
    const visible = text(stripDetails(row.slice(0, row.indexOf("</article>"))));
    assert.match(visible, /Available now: Simulate:/);
    assert.doesNotMatch(h.slice(at(h, 'id="ops-ACB-1"'), at(h, 'id="ops-ACB-1"') + 600), /<button/);
    assert.match(text(row), /Simulated step/);
  });
});

describe("Request details are not repeated", () => {
  it("the length of break and contact choice appear in the summary, not again in the request section", () => {
    const h = html(opened(), "operator");
    const summary = text(h.slice(at(h, 'data-testid="request-summary"'), at(h, 'id="next"')));
    assert.match(summary, /7 days/); assert.match(summary, /Contact choice now/);
    const requestPanel = text(stripDetails(h.slice(at(h, 'id="request"'), at(h, 'id="authority"'))));
    assert.doesNotMatch(requestPanel, /Length of break/);
    assert.doesNotMatch(requestPanel, /Source reference/);
    assert.match(requestPanel, /In the customer's own words/);
  });
});
