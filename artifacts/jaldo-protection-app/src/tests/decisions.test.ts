import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { ProtectionWorld } from "../sim/session";
import { operatorView, operationsView, type Offer } from "../sim/views";
import { CONTACT_CHOICES } from "../sim/scope";
import { availableOffer, classifyAction, classifyOffers, classifyOpsRow, nextGuidance, requestDetailRows } from "../ui/decisions";
import { NextSteps } from "../ui/Decisions";
import { approveAndSend, confirmed, fullJourney, NOTE, opened } from "./helpers";

/** The state in the review: both protections authorised and sent, customer-notice approvals held, a pending-status message prepared. */
const sent = () => { const w = opened(); approveAndSend(w, "ACB-1"); approveAndSend(w, "MKT-1"); return w; };
const byId = (v: ReturnType<typeof operatorView>, id: string) => v.actions.find((a) => a.id === id)!;

describe("Decision groups come from existing offers, eligibility and stages", () => {
  it("authorised and sent: customer-notice approvals are waiting (blocked), sent actions wait on the other system, the prepared message is available", () => {
    const v = operatorView(sent());
    for (const id of ["CAN-1", "CMN-1"]) {
      const c = classifyAction(byId(v, id));
      assert.equal(c.group, "waiting", id);
      assert.match(c.blocker ?? "", /Held until: .* confirmed/, id);
      assert.equal(c.available, null, id);
    }
    for (const id of ["ACB-1", "MKT-1"]) assert.equal(classifyAction(byId(v, id)).group, "waiting", id);
    assert.equal(v.messages.length, 1);
    assert.equal(classifyOffers([v.messages[0].offer], "").group, "available");
  });
  it("proposed and approved actions with an enabled primary decision are available; confirmed ones are completed", () => {
    const w = opened();
    assert.equal(classifyAction(byId(operatorView(w), "ACB-1")).group, "available");
    approveAndSend(w, "ACB-1"); confirmed(w, "ACB-1");
    const v = operatorView(w);
    assert.equal(classifyAction(byId(v, "ACB-1")).group, "done");
    assert.equal(classifyAction(byId(v, "MKT-1")).group, "available");
  });
  it("is derived only from offers: an action is available exactly when the view already offers an enabled primary decision", () => {
    for (const w of [opened(), sent(), fullJourney()]) {
      for (const a of operatorView(w).actions) {
        const c = classifyAction(a);
        if (c.group === "available") assert.ok(availableOffer(a.offers), `${a.id} available without an enabled primary offer`);
        if (c.group === "waiting") assert.equal(availableOffer(a.offers), null, `${a.id} waiting but has an enabled primary offer`);
      }
    }
  });
  it("an offer with a disabled reason is never classed as available", () => {
    const blocked: Offer[] = [{ key: "approve", label: "Approve: X", tone: "primary", disabledReason: "Held until: Y." }, { key: "withdraw", label: "Withdraw", tone: "quiet" }];
    const c = classifyOffers(blocked, "fallback");
    assert.equal(c.group, "waiting"); assert.equal(c.blocker, "Held until: Y.");
  });
  it("Operations rows are grouped by whether a simulated step, read-back or reconciliation is available", () => {
    const w = sent();
    const rows = operationsView(w).account;
    assert.equal(classifyOpsRow(rows[0]).group, "available");
    assert.match(classifyOpsRow(rows[0]).available ?? "", /Simulate:/);
    const w2 = fullJourney();
    for (const r of operationsView(w2).account) assert.equal(classifyOpsRow(r).group, "done");
  });
});

describe("Next-step guidance leads to an available action and never implies a blocked one can be completed", () => {
  it("repeated guidance text still has unique React sibling keys", () => {
    const v = operatorView(sent());
    v.next = [v.next[0], v.next[0], v.next[0]];
    const visit = (node: ReactNode): void => {
      if (Array.isArray(node)) {
        const keys = node.flatMap((child) => isValidElement(child) && child.key !== null ? [child.key] : []);
        assert.equal(new Set(keys).size, keys.length, "guidance siblings must not reuse their wording as a key");
        node.forEach(visit);
      } else if (isValidElement<{ children?: ReactNode }>(node)) {
        visit(node.props.children);
      }
    };
    visit(NextSteps({ v, onJump: () => {} }));
  });
  it("authorised and sent: the available release comes first and links to it; the two approvals are blocked with their reason and no link", () => {
    const g = nextGuidance(operatorView(sent()));
    assert.equal(g[0].state, "available");
    assert.match(g[0].what, /^Release the prepared message/);
    assert.match(g[0].target ?? "", /^message-/);
    const blocked = g.filter((x) => x.state === "blocked");
    assert.equal(blocked.length, 2);
    for (const b of blocked) { assert.match(b.what, /^Approve Customer notice/); assert.match(b.reason ?? "", /Held until/); }
    assert.deepEqual(g.map((x) => x.state), ["available", "blocked", "blocked"]);
  });
  it("before responsibility is taken the pending step is available and points at the responsibility control", () => {
    const w = new ProtectionWorld(); w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE });
    const g = nextGuidance(operatorView(w));
    assert.equal(g.length, 1); assert.equal(g[0].state, "available"); assert.equal(g[0].target, "responsibility");
  });
  it("a plan item that cannot be matched to a decision is kept and marked other, never available or blocked", () => {
    const v = operatorView(opened());
    const fake = { ...v, next: [{ what: "Consider something unmatched", who: "The request holder" }] };
    const g = nextGuidance(fake);
    assert.equal(g[0].state, "other"); assert.equal(g[0].target, null);
  });
  it("nothing is invented: every guidance item is a plan item, in the same number", () => {
    const v = operatorView(sent());
    assert.equal(nextGuidance(v).length, v.next.length);
    assert.deepEqual(nextGuidance(v).map((x) => x.what).sort(), v.next.map((x) => x.what).sort());
  });
});

describe("Request details are shown once", () => {
  it("drops fields the summary and provenance already cover and keeps the customer's own words", () => {
    const rows = requestDetailRows(operatorView(opened())).map((r) => r.label);
    for (const covered of ["Length of break", "Contact choice", "Source reference", "Source", "Where this came from"]) assert.ok(!rows.includes(covered), covered);
    assert.ok(rows.includes("In the customer's own words"));
  });
});
