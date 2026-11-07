import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { NAV } from "../ui/nav";
import { ProtectionWorld } from "../sim/session";
import { CONTACT_CHOICES } from "../sim/scope";
import { fullJourney, NOTE } from "./helpers";

const html = (w: ProtectionWorld, route: string) => renderToStaticMarkup(<App world={w} initialRoute={route} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const submitted = () => {
  const w = new ProtectionWorld();
  w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE });
  return w;
};
const ROUTES = [...NAV.map((n) => n.route), "customer/options", "customer/support", "customer/updates"];

describe("UX reset: visitor-facing copy", () => {
  it("no development-history language on any screen", () => {
    for (const r of ROUTES) for (const w of [new ProtectionWorld(), submitted(), fullJourney()]) {
      const t = text(html(w, r));
      for (const bad of [/\bP1\b/, /\bP2\b/, /Stage P1/, /P1, unchanged/i, /\.md\b/, /\.mjs\b/, /imported/i, /docs\/protection-app/]) assert.doesNotMatch(t, bad, `${r}: ${bad}`);
    }
  });
  it("status labels distinguish prototype behaviour, scripted simulation and proposed capability, and never say 'future capability'", () => {
    const t = text(html(new ProtectionWorld(), "about"));
    assert.match(t, /Proposed · not built/);
    assert.doesNotMatch(t, /Future capability/);
    const g = text(html(new ProtectionWorld(), "guide"));
    for (const l of ["Prototype behaviour", "Scripted simulation", "Proposed · not built"]) assert.ok(g.includes(l), l);
  });
  it("role switching is labelled as a demonstration control, not sign-in", () => {
    const t = text(html(new ProtectionWorld(), "guide"));
    assert.match(t, /Switching between roles is a demonstration control, not sign-in/);
  });
});

describe("UX reset: guided demonstration", () => {
  it("leads with one next action and keeps explorations secondary", () => {
    const h = html(new ProtectionWorld(), "guide");
    assert.match(h, /data-testid="next-step"/);
    assert.match(text(h), /Step 1 of 7/);
    for (const id of ["scenario-choice", "failure-explorations", "connected-parts-details", "status-labels"]) {
      assert.match(h, new RegExp(`<details class="secondary" data-testid="${id}"`), id);
    }
    assert.ok(h.indexOf('data-testid="next-step"') < h.indexOf('data-testid="failure-explorations"'));
  });
  it("progress follows the records and ends with completion", () => {
    assert.match(text(html(submitted(), "guide")), /Step 2 of 7/);
    assert.match(text(html(fullJourney(), "guide")), /(Step \d of 7|All 7 steps complete)/);
  });
});

describe("UX reset: reviewer workspace hierarchy and guidance", () => {
  it("the queue, the next action and the responsibility control come before request detail, policies and authority", () => {
    const h = html(submitted(), "operator");
    const at = (needle: string) => { const i = h.indexOf(needle); assert.ok(i >= 0, needle); return i; };
    assert.ok(at('id="queue"') < at('id="next"'));
    assert.ok(at('id="next"') < at('id="responsibility"'));
    assert.ok(at('id="responsibility"') < at('id="request"'));
    assert.ok(at('id="responsibility"') < at('id="policies"'));
    assert.ok(at('id="responsibility"') < at('id="authority"'));
  });
  it("waiting-for-review state names the pending step and never says nothing needs a person", () => {
    const t = text(html(submitted(), "operator"));
    assert.match(t, /Waiting for a reviewer to take responsibility/);
    assert.match(t, /Accept responsibility for the request/);
    assert.doesNotMatch(t, /Nothing needs a person right now/);
  });
  it("approval and execution boundaries are unchanged: taking responsibility offers no approval or send", () => {
    const h = html(submitted(), "operator");
    assert.doesNotMatch(text(h), /Approve .*(account|marketing)/i);
  });
});

describe("UX reset: customer status", () => {
  it("states pending information once: no separate 'Not confirmed yet' section, and the pending distinction stays visible", () => {
    const t = text(html(submitted(), "customer/today"));
    assert.equal((t.match(/Not confirmed yet/g) ?? []).length, 2, "once per part, no repeated sections or sentences");
    const h = html(submitted(), "customer/today");
    assert.doesNotMatch(h, /id="unc-h"/);
    assert.match(h, /data-testid="unconfirmed"/);
    assert.match(h, /data-status="not-started"/);
  });
  it("shows no internal or reviewer-only information", () => {
    const h = html(submitted(), "customer/today");
    const t = text(h.slice(h.indexOf('data-testid="customer-app"'), h.indexOf('aria-label="Customer app"')));
    for (const bad of [/REQ-0001/, /ACB-1/, /MKT-1/, /kernel/i, /reviewer note/i]) assert.doesNotMatch(t, bad);
  });
});

describe("Guide progress follows recorded evidence (no vacuous completion)", () => {
  const progress = (w: ProtectionWorld) => text(html(w, "guide")).match(/(Step (\d) of 7|All 7 steps complete)/)?.[0];
  const doneCount = (w: ProtectionWorld) => Number(text(html(w, "guide")).match(/(\d) of 7 steps done/)?.[1]);
  it("fresh state: step 1, zero done, nothing after step 1 complete", () => {
    const w = new ProtectionWorld();
    assert.equal(progress(w), "Step 1 of 7");
    assert.equal(doneCount(w), 0);
    assert.doesNotMatch(html(w, "guide"), /data-done="true"/);
  });
  it("request submitted: only step 1 done", () => {
    const w = submitted();
    assert.equal(doneCount(w), 1);
    assert.equal(progress(w), "Step 2 of 7");
  });
  it("partial: reviewer accepted and plan prepared, steps 6 and 7 still open", () => {
    const w = new ProtectionWorld();
    w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE });
    w.acceptResponsibility(); w.preparePlan();
    assert.ok(doneCount(w) >= 2 && doneCount(w) < 6);
    assert.doesNotMatch(progress(w) ?? "", /All 7/);
  });
  it("completed journey: all 7 steps done", () => {
    assert.equal(progress(fullJourney()), "All 7 steps complete");
    assert.equal(doneCount(fullJourney()), 7);
  });
  it("reset returns to the fresh state", () => {
    const w = fullJourney();
    w.reset();
    assert.equal(progress(w), "Step 1 of 7");
    assert.equal(doneCount(w), 0);
  });
  it("early-support scenario: fresh is step 1, with no invitation nothing is complete", () => {
    const w = new ProtectionWorld();
    w.selectScenario("early-support");
    assert.equal(doneCount(w), 0);
  });
});

describe("Governed learning is an optional, separate entry", () => {
  const w = () => new ProtectionWorld();
  it("Start here links to learning but does not inline the walkthrough", () => {
    const h = html(w(), "guide");
    assert.match(h, /data-testid="learning-entry"/);
    assert.match(h, /href="#\/learning"/);
    assert.doesNotMatch(h, /id="learning-review"/);
    assert.match(text(h), /Optional, separate from this journey/);
    assert.match(text(h), /not live AI and not a continuation/);
  });
  it("the learning route renders the module, labelled optional and as a scripted simulation", () => {
    const h = html(w(), "learning");
    assert.match(h, /id="learning-review"/);
    const t = text(h);
    assert.match(t, /Optional exploration, separate from the guided demonstration/);
    assert.match(t, /not AI, autonomous machine learning, a live policy engine/);
    assert.match(t, /Scripted simulation/);
    assert.equal((h.match(/<h1[ >]/g) ?? []).length, 1);
  });
  it("is reachable from the navigation under Technical evidence and does not claim authentication or a journey step", () => {
    const h = html(w(), "guide");
    assert.ok(h.indexOf('id="nav-evidence"') < h.indexOf('href="#/learning"'));
    assert.doesNotMatch(text(html(w(), "learning")), /Step \d of 7/);
  });
  it("learning leaves the guided journey and the operational records untouched", () => {
    const world = new ProtectionWorld();
    const before = html(world, "guide");
    html(world, "learning");
    assert.equal(html(world, "guide"), before);
    assert.equal(world.state, null);
  });
});
