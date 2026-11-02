import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../ui/App";
import { NAV } from "../ui/nav";
import { ProtectionWorld } from "../sim/session";
import { fullJourney, opened, NOTE } from "./helpers";

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
    assert.ok(t.includes("Account-control execution"));
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
