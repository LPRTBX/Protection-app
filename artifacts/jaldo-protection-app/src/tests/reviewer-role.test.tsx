import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { experienceOf, REVIEWER_STEPS, routeOf } from "../ui/nav";
import { ProtectionWorld } from "../sim/session";
import { operatorView } from "../sim/views";
import { decisionCounts } from "../ui/decisions";
import { followGroup, followThrough } from "../ui/reviewer/follow";
import { EXAMPLES, loadExample } from "../ui/reviewer/example";
import { approveAndSend, opened, stepAll } from "./helpers";

const html = (w: ProtectionWorld, route?: string) => renderToStaticMarkup(<App world={w} initialRoute={route} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const at = (h: string, n: string) => { const i = h.indexOf(n); assert.ok(i >= 0, `missing ${n}`); return i; };
const loaded = (id: "customer-break" | "early-support" = "customer-break") => { const w = new ProtectionWorld(); assert.ok(loadExample(w, id).ok); return w; };
const sent = () => { const w = loaded(); w.acceptResponsibility(); w.preparePlan(); approveAndSend(w, "ACB-1"); approveAndSend(w, "MKT-1"); return w; };
const STEPS = REVIEWER_STEPS.map((s) => s.path);
/** Hrefs that would take the reviewer into another role's view. */
const EXPLORE_HREF = /href="#\/(customer|operator|operations|simulation|guide|learning|about)\b/;

describe("Two separate experiences: routing", () => {
  it("an empty hash is the front door; explore routes keep working; reviewer steps are their own routes", () => {
    assert.equal(experienceOf("").experience, "start");
    assert.equal(experienceOf("#/start").experience, "start");
    for (const h of ["#/guide", "#/customer/today", "#/operator", "#/operations", "#/simulation", "#/learning", "#/about", "#/bogus"]) assert.equal(experienceOf(h).experience, "explore", h);
    assert.deepEqual(experienceOf("#/reviewer"), { experience: "reviewer", step: "my-work" });
    assert.deepEqual(experienceOf("#/reviewer/situation"), { experience: "reviewer", step: "situation" });
    assert.deepEqual(experienceOf("#/reviewer/decision"), { experience: "reviewer", step: "decision" });
    assert.deepEqual(experienceOf("#/reviewer/follow-through"), { experience: "reviewer", step: "follow-through" });
    assert.deepEqual(experienceOf("#/reviewer/nonsense"), { experience: "reviewer", step: "my-work" });
    assert.equal(routeOf("#/guide").route, "guide");
  });
  it("the front door offers Explore the system and Experience the reviewer role as separate entries", () => {
    const h = html(new ProtectionWorld());
    assert.match(h, /data-testid="experience-explore"/); assert.match(h, /data-testid="experience-reviewer"/);
    const t = text(h);
    assert.match(t, /For partners and funders/); assert.match(t, /For a fictional operator protection reviewer/);
    assert.match(t, /guided journey/); assert.match(t, /optional governed-learning demonstration/);
    assert.match(h, /href="#\/guide"/); assert.match(h, /href="#\/reviewer"/);
  });
  it("Explore the system keeps its guided journey, role switching, scenario controls and learning in its navigation", () => {
    const h = html(new ProtectionWorld(), "guide");
    for (const r of ["guide", "customer", "operator", "operations", "simulation", "learning"]) assert.ok(h.includes(`href="#/${r}"`), r);
    assert.match(h, /href="#\/start"/);
    assert.match(text(h), /Protection · Explore the system/);
  });
});

describe("The reviewer experience: one role, four steps, no switching", () => {
  it("has exactly My work, Situation, Decision and Follow-through, in order", () => {
    assert.deepEqual(REVIEWER_STEPS.map((s) => s.label), ["My work", "Situation", "Decision", "Follow-through"]);
    const h = html(loaded(), "reviewer");
    const nav = h.slice(at(h, 'aria-label="Reviewer workspace"'), at(h, "</nav>"));
    assert.deepEqual([...nav.matchAll(/href="#\/(reviewer[^"]*)"/g)].map((m) => m[1]), STEPS);
  });
  it("never links to the customer, Operations, Simulation, guide or learning views, in any step or state", () => {
    const states = [new ProtectionWorld(), loaded(), opened(), sent(), loaded("early-support")];
    for (const w of states) for (const r of STEPS) assert.doesNotMatch(html(w, r), EXPLORE_HREF, `${r}`);
  });
  it("shows no customer view and no Operations workspace content in the reviewer's workspace", () => {
    const w = sent();
    for (const r of STEPS) {
      const h = html(w, r);
      const main = h.slice(at(h, "<main"), at(h, "</main>"));
      assert.doesNotMatch(main, /data-testid="customer-app"|Protection options|Where everything stands|Need to stop right now/, r);
      assert.doesNotMatch(main, /Simulate:|Run simulated read-back|Record as unavailable|Try to approve/, `${r}: no simulated responses in the reviewer's workspace`);
    }
  });
  it("states on every step that navigation is presentation, not authentication, and that server-enforced access is a production requirement", () => {
    for (const r of STEPS) {
      const t = text(html(loaded(), r));
      assert.match(t, /presentation, not authentication/, r);
      assert.match(t, /server-enforced access remains a production requirement/i, r);
    }
    assert.match(text(html(new ProtectionWorld())), /Server-enforced access remains a production requirement/);
    assert.match(text(html(new ProtectionWorld(), "about")), /Server-enforced access for each role/);
  });
  it("is labelled a fictional simulation and offers a way out that is not a role switch", () => {
    const t = text(html(loaded(), "reviewer"));
    assert.match(t, /Fictional data, in this browser only/); assert.match(t, /No live systems/);
    assert.match(html(loaded(), "reviewer"), /data-testid="leave-preview"[^>]*>Choose a different experience|href="#\/start"[^>]*data-testid="leave-preview"/);
  });
});

describe("Load fictional example: demonstration setup using existing commands", () => {
  it("is explicit, labelled demonstration setup, and offers the two scenarios separately", () => {
    const h = html(new ProtectionWorld(), "reviewer");
    const t = text(h);
    assert.match(t, /Load fictional example/); assert.match(t, /Demonstration setup\./);
    assert.match(t, /not part of the reviewer's work/);
    assert.equal(EXAMPLES.length, 2);
    assert.match(t, /Load fictional example: customer-requested break/); assert.match(t, /Load fictional example: early-support review/);
    assert.match(t, /separate scenarios\. Loading one does not continue into the other, and no workflow joins them/);
  });
  it("loading the break example sends the fixed fictional request through the existing customer command", () => {
    const w = loaded();
    assert.equal(w.scenario, "customer-break");
    const v = operatorView(w);
    assert.equal(v.status, "awaiting_acceptance");
    assert.equal(v.request?.ref, "REQ-0001");
    assert.ok(v.request!.fields.some((f) => f.label === "Length of break" && f.value === "7 days"));
    assert.ok(w.history.some((h) => h.did === "Submitted a break request"));
    assert.equal(w.actions().length, 0, "setup prepares, approves and sends nothing");
  });
  it("loading the early-support example admits the existing simulated source event and sends no customer request", () => {
    const w = loaded("early-support");
    assert.equal(w.scenario, "early-support");
    const v = operatorView(w);
    assert.equal(v.status, "awaiting_acceptance");
    assert.ok(v.review, "the early-support review card exists");
    assert.ok(!w.history.some((h) => h.did === "Submitted a break request"));
    assert.equal(w.actions().length, 0);
  });
  it("does not combine the scenarios: a loaded session refuses another example until it is reset", () => {
    const w = loaded();
    const r = loadExample(w, "early-support");
    assert.equal(r.ok, false);
    assert.equal(w.scenario, "customer-break");
    w.reset();
    assert.ok(loadExample(w, "early-support").ok);
    assert.equal(loadExample(w, "customer-break").ok, false);
  });
  it("the loader is disabled while a session is loaded, with the reason stated", () => {
    const h = html(loaded(), "reviewer");
    assert.match(h, /A fictional session is already loaded/);
  });
});

describe("Reviewer steps reuse the existing projection, offers and eligibility", () => {
  it("My work counts agree with the decision groups the Decision step shows", () => {
    const w = sent();
    const c = decisionCounts(operatorView(w));
    const my = text(html(w, "reviewer"));
    assert.match(my, new RegExp(`${c.available} available for your decision now`));
    assert.match(my, new RegExp(`${c.waiting} waiting on another system or prerequisite`));
    const d = html(w, "reviewer/decision");
    assert.match(d, new RegExp(`id="decisions-available"[^>]*data-count="${c.available}"`));
    assert.match(d, new RegExp(`id="decisions-waiting"[^>]*data-count="${c.waiting}"`));
  });
  it("Decision keeps exact sharing, policy requirements and the individual approvals, and the blocked notice approvals say why", () => {
    const d = html(sent(), "reviewer/decision");
    assert.match(d, /Exactly what would be shared/); assert.match(d, /Policy requirements/);
    assert.match(d, /Before you decide, check each/);
    assert.match(text(d), /Not available yet: Held until: Account break confirmed/);
    assert.match(text(d), /Contact choice now:/);
  });
  it("Situation keeps policy, contact permissions and what is not inferred visible", () => {
    const t = text(html(opened(), "reviewer/situation"));
    assert.match(t, /Applicable policies/); assert.match(t, /Communication permissions/); assert.match(t, /Nothing is inferred about the customer/);
  });
  it("early-support Situation keeps what is not known and the source's limits visible", () => {
    const t = text(html(loaded("early-support"), "reviewer/situation"));
    assert.match(t, /What is not known/); assert.match(t, /Known limits of this source/);
  });
  it("taking responsibility still needs each of its three checks, before the decision panel exists", () => {
    const d = html(loaded(), "reviewer/decision");
    for (const c of ["Authority: I hold the Protection reviewer responsibility", "Conflict: I have no conflict of interest", "Capacity: I can act on this request"]) assert.ok(text(d).includes(c), c);
    assert.doesNotMatch(d, /id="decisions-available"/);
  });
});

describe("Follow-through: sent is not another system acting", () => {
  it("places actions from their existing stage and offers, and keeps unconfirmed outcomes visible", () => {
    const f = followThrough(operatorView(sent()));
    assert.equal(f.groups["with-others"].length, 2);
    assert.equal(f.groups.held.length, 2);
    assert.equal(f.unconfirmed.length, 2);
    assert.equal(f.groups.confirmed.length, 0);
  });
  it("after the reviewer approves and sends, follow-through says the other system has not responded", () => {
    const h = html(sent(), "reviewer/follow-through");
    const t = text(h);
    assert.match(t, /Approving and sending are your steps\. Another system has acted only when its own response is recorded/);
    assert.match(t, /2 not confirmed/);
    assert.match(t, /Not yet accepted|has not said it received it/);
    assert.doesNotMatch(t, /Applied — reported by the system|Confirmed — simulated read-back/);
  });
  it("another system's response appears only after the presenter runs it, never because of the reviewer's send", () => {
    const w = sent();
    const before = followThrough(operatorView(w)).groups["with-others"].map((a) => a.stage);
    assert.deepEqual(before, ["sent", "sent"]);
    stepAll(w, "ACB-1");
    const after = operatorView(w).actions.find((a) => a.id === "ACB-1")!;
    assert.equal(after.stage, "applied");
    assert.equal(operatorView(w).actions.find((a) => a.id === "MKT-1")!.stage, "sent", "the other protection is unaffected");
  });
  it("classifies each case by existing state: needs you, with others, held, confirmed", () => {
    const v = operatorView(sent());
    const g = Object.fromEntries(v.actions.map((a) => [a.id, followGroup(a)]));
    assert.equal(g["ACB-1"], "with-others"); assert.equal(g["CAN-1"], "held");
    const w = opened();
    assert.equal(followGroup(operatorView(w).actions[0]), "needs-you");
  });
});

describe("The presenter panel is a separate surface outside the reviewer's role", () => {
  it("is an aside after the workspace, collapsed, labelled, and not in the reviewer's navigation", () => {
    const h = html(sent(), "reviewer/decision");
    assert.ok(at(h, "</main>") < at(h, 'data-testid="presenter-panel"'));
    assert.match(h, /<aside class="presenter" aria-label="Presenter panel, demonstration only"/);
    assert.match(h, /<details id="presenter-panel" class="presenter-details">/);
    assert.doesNotMatch(h.slice(at(h, 'aria-label="Reviewer workspace"'), at(h, "</nav>")), /presenter/i);
    assert.match(text(h), /Presenter panel · demonstration only, outside the reviewer's role/);
  });
  it("says it is not the reviewer and that no other system acts because the reviewer approved or sent something", () => {
    const t = text(html(sent(), "reviewer"));
    assert.match(t, /This is not the reviewer\./);
    assert.match(t, /No other system acts because the reviewer approved or sent something/);
    assert.match(t, /Nothing here is the reviewer's authority/);
  });
  it("holds the demonstration setup and the simulated responses, with the response buttons directly available to the presenter", () => {
    const h = html(sent(), "reviewer");
    const p = h.slice(at(h, 'data-testid="presenter-panel"'));
    assert.match(text(p), /Demonstration setup/); assert.match(text(p), /Load fictional example/);
    assert.match(text(p), /Simulated responses from other systems and teams/);
    assert.match(text(p), /Available to simulate now/);
    assert.match(p, /data-testid="presenter-steps"/);
    assert.match(p, /Simulate: system acknowledges receipt/);
    assert.match(text(p), /Reset the whole simulation/);
  });
});

describe("No development-history wording in the early-support states", () => {
  it("renders no file references or internal design-doc citations on any step or in Explore's reviewer, in the early-support scenario", () => {
    const w = loaded("early-support");
    for (const r of [...STEPS, "operator", "operations", "customer/today"]) {
      const t = text(html(w, r));
      for (const bad of [/docs\//, /\.md\b/, /P2-design/, /\bP1\b/, /\bP2\b/, /§\s?\d/]) assert.doesNotMatch(t, bad, `${r}: ${bad}`);
    }
  });
});
