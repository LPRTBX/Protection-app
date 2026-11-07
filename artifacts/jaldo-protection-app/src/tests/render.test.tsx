import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { NAV } from "../ui/nav";
import { ProtectionWorld } from "../sim/session";
import { fullJourney, opened, NOTE } from "./helpers";
import { CONTACT_CHOICES } from "../sim/scope";

const html = (w: ProtectionWorld, route: string) => renderToStaticMarkup(<App world={w} initialRoute={route} />);
const text = (h: string) => h.replace(/<p class="note" data-disclaimer[^>]*>.*?<\/p>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const ROUTES = [...NAV.map((n) => n.route), "customer/options", "customer/support", "customer/updates"];

describe("Rendered structure", () => {
  it("every screen has landmarks, a skip link, exactly one h1 and the prototype label", () => {
    for (const r of ROUTES) {
      for (const w of [new ProtectionWorld(), fullJourney()]) {
        const h = html(w, r);
        assert.match(h, /<a class="skip" href="#main">/, r);
        assert.match(h, /role="banner"/, r);
        assert.match(h, /<nav[^>]*aria-label="JALDO Protection prototype"/, r);
        assert.match(h, /<main id="main"/, r);
        assert.match(h, /role="contentinfo"/, r);
        assert.equal((h.match(/<h1[ >]/g) ?? []).length, 1, `${r}: one h1`);
        assert.match(text(h), /Fictional data, in this browser only/, r);
      }
    }
  });

  it("every screen carries a prominent return link to the Protection overview, and Start here shows how the parts connect", () => {
    for (const r of ROUTES) {
      const h = html(new ProtectionWorld(), r);
      assert.match(h, /<a class="overview-link" href="https:\/\/wearejaldo\.com\/protection" data-testid="overview-link">/, r);
      assert.ok(text(h).includes("Explore JALDO Protection"), r);
    }
    const g = text(html(new ProtectionWorld(), "guide"));
    for (const t of ["How the three parts connect", "System", "Reviewer", "Customer", "Operations"]) assert.ok(g.includes(t), t);
    const c = html(new ProtectionWorld(), "customer/today");
    assert.match(c, /href="#\/operator"/);
  });

  it("the customer app has four labelled tabs and marks the current one", () => {
    const h = html(new ProtectionWorld(), "customer/support");
    const nav = h.slice(h.indexOf('aria-label="Customer app"'));
    for (const t of ["Today", "Protection options", "Support", "My updates"]) assert.ok(nav.includes(t), t);
    assert.match(nav, /href="#\/customer\/support" aria-current="page"/);
  });

  it("every lifecycle chip carries a word, not only a colour", () => {
    const h = html(fullJourney(), "operator");
    for (const m of h.matchAll(/<span class="stage stage-(\w+)"[^>]*>(.*?)<\/span>(?=<)/g)) assert.ok(text(m[0]).trim().length > 3);
    assert.ok(text(h).includes("Confirmed (simulated read-back)"));
  });

  it("customer screens never show another role's content", () => {
    const w = opened();
    w.applyPreset("one-fails");
    w.approve("ACB-1"); w.dispatch("ACB-1");
    for (const r of ["customer/today", "customer/options", "customer/support", "customer/updates"]) {
      const h = html(w, r);
      const t = text(h.slice(h.indexOf('data-testid="customer-app"'), h.indexOf("</nav>", h.indexOf('aria-label="Customer app"'))));
      for (const banned of ["ACB-1", "Account controls system", "Marketing suppression", "attempt", "reviewer-fictional", "kernel", "dispatch"]) assert.equal(t.includes(banned), false, `${r} leaked ${banned}`);
    }
  });

  it("operations screens never show the customer's words", () => {
    const t = text(html(fullJourney(), "operations"));
    assert.equal(t.includes(NOTE), false);
    // Execution is grouped by availability; the connected system is named on each row.
    assert.ok(t.includes("Account break") && t.includes("System: Account controls system"));
    assert.equal(/Customer notice|CAN-1|CMN-1/.test(t), false, "Operations never sees the customer notices");
  });

  it("no screen uses scoring, profiling or inference language outside a marked disclaimer", () => {
    for (const r of ROUTES) {
      const t = text(html(fullJourney(), r));
      for (const re of [/risk (score|rating|level)/i, /behaviou?ral/i, /propensity/i, /vulnerab/i, /problem gambler/i, /addict/i, /guilt/i, /\bflagged as\b/i]) assert.equal(re.test(t), false, `${r}: ${re}`);
    }
  });

  it("makes no claim of live integration", () => {
    const t = text(html(new ProtectionWorld(), "about"));
    assert.match(t, /not connected to a live/i);
    assert.equal(/\bis connected to (a )?live/i.test(t), false);
  });

  it("labels operator learning as a fictional demonstration, not a production access boundary", () => {
    // The learning walkthrough now lives behind its own optional route; Start here only links to it.
    const t = text(html(new ProtectionWorld(), "learning"));
    assert.match(t, /Operator learning demonstration/);
    assert.match(t, /not a production access-control boundary/);
    assert.doesNotMatch(t, /Restricted internal learning/);
    assert.match(text(html(new ProtectionWorld(), "guide")), /same app, kernel and three role views/);
    assert.match(t, /Customer-visible:.*Internal rule details, alert rationale and reviewer discussion are not included/);
  });
});

describe("Static boundaries", () => {
  const root = path.join(import.meta.dirname, "..");
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? (f === "tests" ? null : walk(p)) : files.push(p); } };
  walk(root);
  it("source makes no network call and uses no storage", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const re of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /navigator\.(geolocation|mediaDevices)/, /Notification\b\./, /document\.cookie/]) assert.equal(re.test(s), false, `${path.relative(root, f)} matches ${re}`);
    }
  });
  it("does not import the public Protection demonstration or the api-server", () => {
    for (const f of files) assert.equal(/api-server|coordination-model\.mjs|private\/protection/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), false, f);
  });
  it("defines no second orchestration engine: no action-state vocabulary is declared outside the kernel", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      assert.equal(/ACTION_STATES|applyCommand\s*=|function applyCommand|function handle\(/.test(s.replace(/import[^;]*;/g, "")), false, f);
    }
  });
});

function early(stage: "selected" | "admitted" | "delivered") {
  const w = new ProtectionWorld();
  w.selectScenario("early-support");
  if (stage === "selected") return w;
  w.admitSignal(); w.acceptResponsibility();
  if (stage === "admitted") return w;
  w.propose("early-support-checkin"); w.submit("IAM-1"); w.approve("IAM-1"); w.dispatch("IAM-1");
  for (let i = 0; i < 3; i++) w.connectorStep("IAM-1");
  return w;
}

describe("Early-support (P2) rendered structure and wording", () => {
  it("every screen has landmarks and exactly one h1 in each stage of the scenario", () => {
    for (const stage of ["selected", "admitted", "delivered"] as const) {
      for (const r of ROUTES) {
        const h = html(early(stage), r);
        assert.equal((h.match(/<h1[ >]/g) ?? []).length, 1, `${r} (${stage})`);
        assert.match(h, /<main id="main"/, r);
        assert.match(h, /role="contentinfo"/, r);
      }
    }
  });
  it("the customer screens show nothing about the review before delivery, and only the invitation after", () => {
    const cut = (h: string) => text(h.slice(h.indexOf('data-testid="customer-app"'), h.indexOf("</nav>", h.indexOf('aria-label="Customer app"'))));
    for (const stage of ["selected", "admitted"] as const) {
      for (const r of ["customer/today", "customer/options", "customer/support", "customer/updates"]) {
        const t = cut(html(early(stage), r));
        for (const leak of ["SRC-9001", "R-14", "review request", "Upstream", "signal", "C-2087", "early-support", "Early-support", "check-in"]) assert.equal(t.includes(leak), false, `${r} (${stage}) leaked ${leak}`);
      }
    }
    const d = cut(html(early("delivered"), "customer/today"));
    assert.match(d, /A message from the team/);
    assert.match(d, /support is available if you would ever like it/);
    assert.match(d, /Opening this message is not a request/);
    assert.match(d, /Not available in this prototype/);
    for (const bad of [/risk/i, /vulnerab/i, /bonus|reward|free bet/i, /\bAI\b/]) assert.equal(bad.test(d), false, String(bad));
  });
  it("the operator card is complete and labelled simulated; Operations never shows the context", () => {
    const o = text(html(early("admitted"), "operator"));
    for (const want of ["Why this needs review", "Simulated source", "What is known", "What is not known", "What you can decide", "Who decides", "What would be shared", "not evidence that harm or wrongdoing occurred"]) assert.ok(o.includes(want), want);
    const p = text(html(early("delivered"), "operations"));
    for (const never of ["R-14", "Reason code", "Source context", "Contact choice", "support is available"]) assert.equal(p.includes(never), false, never);
    assert.ok(p.includes("In-app message delivery"));
    for (const never of ["early-support", "Early-support", "check-in", "invitation", "optional", "contact choice", "review request"]) assert.equal(p.toLowerCase().includes(never.toLowerCase()), false, `Operations text mentions "${never}"`);
  });
  it("Simulation and Start here carry the scenario selector, and the reset affordance appears only with records", () => {
    assert.match(html(new ProtectionWorld(), "simulation"), /data-testid="scenario-picker"/);
    assert.match(html(new ProtectionWorld(), "guide"), /data-testid="scenario-picker"/);
    assert.equal(/Reset to choose another scenario/.test(html(early("selected"), "simulation")), false);
    assert.match(html(early("admitted"), "simulation"), /Reset to choose another scenario/);
    assert.equal(/disabled=""[^>]*name="sc-scenario"|name="sc-scenario"[^>]*disabled=""/.test(html(early("admitted"), "simulation")), true);
  });
  it("no early-support screen uses scoring, profiling or inference language", () => {
    for (const stage of ["selected", "admitted", "delivered"] as const) {
      for (const r of ROUTES) {
        const t = text(html(early(stage), r));
        for (const re of [/risk (score|rating|level)/i, /behaviou?ral/i, /propensity/i, /vulnerab/i, /problem gambler/i, /addict/i, /guilt/i, /flagged as/i]) assert.equal(re.test(t), false, `${r} (${stage}): ${re}`);
      }
    }
  });
  it("the P1 customer-requested scenario renders unchanged for P1 routes (no early-support controls)", () => {
    const t = text(html(opened(), "operator"));
    assert.equal(/Why this needs review|Early-support actions/.test(t), false);
    void CONTACT_CHOICES; void NOTE;
  });
});
