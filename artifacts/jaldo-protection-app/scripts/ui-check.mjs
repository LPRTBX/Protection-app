/**
 * Browser verification of the Protection app prototype (local; needs the pre-installed Chromium through Playwright).
 *
 *   pnpm --filter @workspace/jaldo-protection-app run build && pnpm --filter @workspace/jaldo-protection-app run ui-check
 *
 * Checks at 390px and 1440px: no horizontal scroll, axe (light and dark) on every screen, keyboard operation, the full journey
 * through the real UI, the four failure scenarios, privacy boundaries in the rendered DOM and transition accuracy.
 * Writes screenshots when SHOTS_DIR is set (resolved against the repository root).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// CI installs playwright as a devDependency of this package. Locally a global install may be used with CHROMIUM_PATH.
const { chromium } = require("playwright");
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PORT = Number(process.env.PROTECTION_UI_PORT ?? 23582);
const BASE = `http://localhost:${PORT}/protection-app/`;
const builtHtml = readFileSync(path.join(here, "..", "dist", "public", "index.html"), "utf8");
const builtAsset = builtHtml.match(/<script[^>]+src="([^"]+)"/)?.[1];
if (!builtAsset) throw new Error("Build the Protection app before running browser checks.");
const SHOTS = process.env.SHOTS_DIR ? path.resolve(here, "..", "..", "..", process.env.SHOTS_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const failures = [];
const browserIssues = [];
const observedPages = new WeakSet();
const ok = (c, m) => { if (!c) { failures.push(m); console.log("  FAIL", m); } else console.log("  ok  ", m); };
const server = spawn("pnpm", ["exec", "vite", "preview", "--config", "vite.config.ts", "--port", String(PORT), "--strictPort"], { cwd: path.join(here, ".."), stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
process.on("exit", () => { try { server.kill("SIGTERM"); } catch { /* stopped */ } });
let ready = false;
for (let i = 0; i < 60; i++) {
  if (server.exitCode !== null) throw new Error(`Test preview exited; port ${PORT} may be occupied. Set PROTECTION_UI_PORT to an unused port.`);
  try {
    const response = await fetch(BASE);
    if (response.ok && (await response.text()).includes(builtAsset)) { ready = true; break; }
  } catch { /* retry */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) throw new Error(`Test preview did not serve this build (${builtAsset}); refusing to test another running app.`);
console.log(`Verified test build: ${builtAsset}`);

const ROUTES = ["guide", "customer/today", "customer/options", "customer/support", "customer/updates", "operator", "operations", "simulation", "about"];
const MOBILE = { width: 390, height: 844 }, DESKTOP = { width: 1440, height: 900 };

async function axeRun(page, label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(bad.length === 0, `axe: no serious/critical violations on ${label}${bad.length ? " -> " + bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].html.slice(0, 100)}`).join(" | ") : ""}`);
  const minor = res.violations.filter((v) => !bad.includes(v));
  if (minor.length) console.log("       notes:", minor.map((v) => `${v.id}[${v.impact}]`).join(", "));
}
const shot = async (page, name, full = true) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full }); };
const body = (page) => page.locator("body").innerText();
const observePage = (page) => {
  if (observedPages.has(page)) return;
  observedPages.add(page);
  page.on("console", (message) => { if (message.type() === "error") browserIssues.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => browserIssues.push(`page error: ${error.message}`));
};
const open = async (page, r) => { observePage(page); await page.goto(`${BASE}#/${r}`); await page.waitForSelector("h1"); };
const click = (page, name, opts = {}) => page.getByRole("button", { name, ...opts }).click();
const checkAll = async (scope) => { for (const cb of await scope.getByRole("checkbox").all()) await cb.check(); };

/** Tick every check inside the fieldset that holds this button, then press it. */
async function reviewed(page, region, name) {
  await control(page, region, name);
  const fs = region.locator("fieldset.review", { has: page.getByRole("button", { name }) }).first();
  await checkAll(fs);
  await fs.getByRole("button", { name }).click();
}

/** As a person would: open the "Review this action" entry that holds a control, then return the control. */
async function control(page, scope, name) {
  const closed = scope.locator("details.review-action:not([open])", { has: page.locator("button", { hasText: name }) });
  for (const d of await closed.all()) await d.locator(":scope > summary").click();
  return scope.getByRole("button", { name });
}
/** Open every closed "Review this action" entry inside a scope, to read what the review shows. */
async function openReview(scope) {
  for (const d of await scope.locator("details.review-action:not([open])").all()) await d.locator(":scope > summary").click();
}
/** Simulation controls are one collapsed section; open it, as a person demonstrating a failure would. */
async function openSimulationControls(page) {
  const d = page.locator("details#simulation-controls");
  if (!(await d.evaluate((e) => e.open))) await d.locator(":scope > summary").click();
}
const card = (page, id) => page.locator(`article[aria-label="${id}"]`);

try {
  const browser = await chromium.launch(launchOptions);

  // 1. Layout: both widths, every route, empty and populated world
  for (const [label, vp] of [["390px", MOBILE], ["1440px", DESKTOP]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    console.log(`\nLayout at ${label}`);
    for (const r of ROUTES) {
      await open(page, r);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 0, `${r}: no horizontal scroll at ${label} (overflow ${over})`);
      const small = await page.evaluate(() => [...document.querySelectorAll("a[href],button,input,select,textarea,summary")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && !e.closest(".sr-only") && (b.height < 24 || b.width < 24) && getComputedStyle(e).visibility !== "hidden" && e.type !== "checkbox" && e.type !== "radio"; }).map((e) => e.textContent.trim().slice(0, 30)));
      ok(small.length === 0, `${r}: touch targets at least 24px at ${label}${small.length ? " -> " + small.join(",") : ""}`);
    }
    if (vp.width < 960) {
      await open(page, "guide");
      await click(page, "Menu");
      ok((await page.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")) === "true", "menu opens at mobile width");
      ok(await page.locator("#primary-nav").getByRole("link", { name: /Operations/ }).isVisible(), "all destinations are reachable from the menu");
    } else {
      ok(await page.getByRole("navigation", { name: "JALDO Protection prototype" }).isVisible(), "navigation is visible at desktop width");
    }
    await ctx.close();
  }

  // 2. Accessibility: axe on every screen, light and dark, populated world
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: scheme });
    const page = await ctx.newPage();
    console.log(`\nAccessibility (${scheme})`);
    for (const r of ROUTES) { await open(page, r); await axeRun(page, `${r} [${scheme}, empty]`); }
    await ctx.close();
  }

  // 3. Keyboard operation of the customer flow
  {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    console.log("\nKeyboard");
    await open(page, "customer/options");
    await page.keyboard.press("Tab");
    const firstTab = await page.evaluate(() => { const e = document.activeElement; return { skip: e?.className === "skip", what: `${e?.tagName}.${e?.className} "${(e?.textContent ?? "").trim().slice(0, 30)}"` }; });
    ok(firstTab.skip, `first Tab lands on the skip link${firstTab.skip ? "" : " (focus went to " + firstTab.what + ")"}`);
    await page.keyboard.press("Enter");
    ok(await page.evaluate(() => location.hash.includes("main") || document.activeElement?.id === "main"), "skip link moves to the main content");
    const ask = page.getByRole("button", { name: "Ask for a break" });
    await ask.focus(); await page.keyboard.press("Enter");
    ok(await page.getByRole("heading", { name: "Take a break" }).isVisible(), "Enter opens the break form");
    const r30 = page.getByRole("radio", { name: /30 days/ });
    await r30.focus(); await page.keyboard.press("Space");
    ok(await r30.isChecked(), "Space chooses a length of break");
    await page.getByRole("radio", { name: /7 days/ }).focus(); await page.keyboard.press("ArrowDown");
    ok(await r30.isChecked(), "arrow keys move within the radio group");
    const focusRing = await page.evaluate(() => { const b = document.querySelector("button[type=submit]"); b.focus(); const s = getComputedStyle(b); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
    ok(focusRing, "a visible focus outline is drawn on buttons");
    const sel = page.getByRole("combobox");
    await sel.focus(); await sel.selectOption({ index: 1 });
    ok((await page.getByRole("textbox").count()) === 0, "the customer form has no free-text box");
    await page.getByRole("button", { name: "Review your request" }).focus(); await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Send my request" }).focus(); await page.keyboard.press("Enter");
    await page.waitForSelector("[data-testid=headline]");
    ok(await page.evaluate(() => document.activeElement?.id === "screen-title"), "after sending, focus moves to the new screen's title");
    ok((await body(page)).includes("Request received"), "the request is sent by keyboard alone");
    await ctx.close();
  }

  // 3a. Fictional, governed learning lifecycle and separate customer projection
  {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    console.log("\nGoverned learning");
    // The scenario selector lives on Start here (inside a disclosure); learning is its own optional route.
    await open(page, "guide");
    await page.getByText("Choose a different scenario").click();
    const scenarioPicker = page.getByTestId("scenario-picker");
    ok(await scenarioPicker.getByRole("radio").count() === 2, "the existing two scenarios remain; no high-risk scenario is added");
    ok(await page.getByTestId("learning-entry").getByRole("link", { name: /governed learning/ }).isVisible() && !(await page.locator("#learning-review").count()), "Start here links to learning as an optional entry and does not inline the walkthrough");
    await page.getByTestId("learning-entry").getByRole("link", { name: /governed learning/ }).click();
    await page.waitForSelector("#learning-review");
    const learning = page.locator("#learning-review");
    ok(await learning.getByText("not a production access-control boundary").first().isVisible(), "operator learning is labelled as a demonstration, not a production access boundary");
    const evidenceRegion = learning.getByRole("region", { name: /Fictional evidence timestamps/ });
    await evidenceRegion.focus();
    ok(await evidenceRegion.evaluate((el) => document.activeElement === el), "the wide evidence table can be reached by keyboard");

    await click(page, "Run first V1 occurrence");
    ok((await learning.innerText()).includes("Run 1 · first occurrence"), "the first fixed fictional sequence is recorded under V1");
    ok((await learning.innerText()).includes("Unknown / unmeasured"), "the customer effect remains explicitly unknown");
    ok((await learning.innerText()).includes("does not show that the action helped or reduced harm"), "execution verification does not claim benefit");

    await click(page, "Propose V2 after first V1 run");
    ok(await learning.getByRole("button", { name: "Activate V2 for simulation only" }).isDisabled(), "activation is unavailable before the dry run and authorized approval");
    await click(page, "Test proposal as dry run");
    ok((await learning.innerText()).includes("V1 review:") && (await learning.innerText()).includes("V2 review:"), "the dry run compares the same scripted sequence before and after");
    const approval = learning.locator("fieldset.lr-checks").first();
    await checkAll(approval);
    await click(page, "Record human reviewer approval");
    ok((await learning.innerText()).includes("Approved, not yet active"), "authorised approval remains distinct from activation");
    await click(page, "Activate V2 for simulation only");
    ok((await learning.locator(".lr-fact").first().innerText()).includes("Policy V2"), "the versioned simulation is activated only after approval");
    await click(page, "Replay fixed sequence with V2");
    ok((await learning.innerText()).includes("Run 2 · fresh replay") && (await learning.innerText()).includes("Policy V2"), "V2 replays the fixed sequence and records a separate result");

    await click(page, "Attempt duplicate event/action replay");
    ok((await learning.innerText()).includes("Replay rejected; no duplicate was added."), "duplicate replay is refused without changing history");
    await click(page, "Rollback future runs to V1");
    ok((await learning.locator(".lr-fact").first().innerText()).includes("Policy V1 · rolled back"), "rollback changes only the version used for future runs");
    ok((await learning.innerText()).includes("Run 1 · first occurrence") && (await learning.innerText()).includes("Run 2 · fresh replay"), "rollback leaves prior run history intact");
    await click(page, "Replay fixed sequence with V1");
    ok((await learning.innerText()).includes("Run 3 · after rollback"), "a later run uses the rolled-back version without rewriting prior runs");

    await learning.getByRole("radio", { name: /Withdraw the proposal/ }).check();
    await click(page, "Record selected human alternative");
    ok((await learning.innerText()).includes("Recorded: withdraw proposal"), "an inconclusive alert can be withdrawn by a human");
    await learning.getByRole("radio", { name: /Refine for later review/ }).check();
    await click(page, "Record selected human alternative");
    ok((await learning.innerText()).includes("Recorded: refine for later human review"), "an inconclusive alert can instead be refined for later human review");

    await learning.getByRole("radio", { name: /Customer summary preview/ }).check();
    const customerSummary = await learning.innerText();
    ok(customerSummary.includes("Customer-facing summary preview"), "the customer summary projection is available");
    ok(!/Active for future runs|Policy V[12]|Run history|Fictional evidence timestamps|inconclusive alert/i.test(customerSummary), "the customer summary omits internal learning details");
    await learning.getByRole("radio", { name: /Operator learning demonstration/ }).check();
    ok((await learning.innerText()).includes("Run 3 · after rollback"), "operator learning history remains available in its separate demonstration view");
    await ctx.close();
  }

  // 4. The complete journey through the real UI, with screenshots
  {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    console.log("\nJourney (390px customer, then desktop operator and operations)");
    await open(page, "guide");
    ok(await page.getByTestId("progress").innerText() === "Step 1 of 7", "a fresh browser journey starts at step 1 of 7");
    ok(await page.getByTestId("journey").locator('li[data-done="true"]').count() === 0, "a fresh browser journey has no completed steps");
    await shot(page, "01-guide-390");
    await open(page, "customer/today"); await shot(page, "02-customer-today-empty-390", false);
    await open(page, "customer/options"); await shot(page, "03-customer-options-390");
    await click(page, "Ask for a break"); await shot(page, "04-customer-break-form-390");
    await click(page, "Review your request"); await shot(page, "05-customer-review-390");
    await click(page, "Send my request");
    await page.waitForSelector("[data-testid=headline]");
    ok((await page.locator("[data-testid=headline]").innerText()).includes("Request received"), "customer sees 'Request received' straight after sending");
    await shot(page, "06-customer-today-requested-390", false);

    // switch viewport to desktop for the operator, keeping the same in-memory world (hash navigation only)
    await page.setViewportSize(DESKTOP);
    await open(page, "operator");
    await shot(page, "07-operator-review-1440");
    await reviewed(page, page, "Take responsibility for this request");
    ok(await page.getByText("Break request procedure (fictional)").first().isVisible(), "Core prepares proposals and lists applicable policies after responsibility is accepted");
    ok((await body(page)).includes("Needs attention") === false, "no policy check needs attention for a request with contact permitted");
    await shot(page, "08-operator-policies-authority-1440");
    const acb = card(page, "Account break ACB-1");
    ok((await acb.getAttribute("data-stage")) === "proposed", "account break starts as Proposed");
    await reviewed(page, acb, "Approve: Account break");
    ok((await acb.getAttribute("data-stage")) === "approved", "after approval it is Approved, not Sent");
    ok((await acb.innerText()).includes("Authorised by"), "the authorising person is named");
    const mkt = card(page, "Marketing suppression MKT-1");
    ok((await mkt.getAttribute("data-stage")) === "proposed", "approving the account break did not approve marketing");
    await reviewed(page, mkt, "Approve: Marketing suppression");
    await (await control(page, acb, /Send to/)).click();
    await (await control(page, mkt, /Send to/)).click();
    ok((await acb.getAttribute("data-stage")) === "sent" && (await mkt.getAttribute("data-stage")) === "sent", "both are Sent");
    await shot(page, "09-operator-actions-sent-1440");

    // customer, mid-journey: only approved information
    await open(page, "customer/today");
    {
      // The customer's status items must stack in one column at desktop width (a shared class once made them three narrow columns).
      const lefts = await page.locator(".phone ul.parts > li").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      ok(lefts.length >= 2 && lefts.every((x) => x === lefts[0]), "customer status items stack in a single column at desktop width");
    }
    const mid = await body(page);
    ok(!/Account controls|Marketing suppression system|ACB-1|dispatch|attempt/i.test(mid), "customer view shows no system names, ids or attempts");
    ok(!/Your break is confirmed|recorded as confirmed|simulated check in this demo matched/.test(mid), "customer is not told anything is confirmed yet");

    await open(page, "operations");
    await shot(page, "10-operations-sent-1440");
    const oAcb = card(page, "Account break ACB-1");
    const oMkt = card(page, "Marketing suppression MKT-1");
    for (const [c, expect] of [[oAcb, "acknowledged"], [oAcb, "acknowledged"], [oAcb, "applied"]]) {
      await (await control(page, c, /Simulate:/)).click();
      ok((await c.getAttribute("data-stage")) === expect, `account system advances to ${expect}`);
    }
    for (let i = 0; i < 3; i++) await (await control(page, oMkt, /Simulate:/)).click();
    ok((await oMkt.getAttribute("data-stage")) === "applied", "marketing system is Applied");
    ok((await body(page)).includes("not independently confirmed") || (await body(page)).includes("not confirmed"), "Operations says applied is not confirmed");
    await shot(page, "11-operations-applied-1440");
    await (await control(page, oAcb, "Run simulated read-back")).click();
    await (await control(page, oMkt, "Run simulated read-back")).click();
    ok((await oAcb.getAttribute("data-stage")) === "applied", "a read-back alone does not confirm: still Applied");

    await open(page, "operator");
    await (await control(page, card(page, "Account break ACB-1"), "Record confirmation")).click();
    await (await control(page, card(page, "Marketing suppression MKT-1"), "Record confirmation")).click();
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "reviewer records confirmation");
    for (const [name, label] of [["Customer notice: account break CAN-1", "Approve: Customer notice: account break"], ["Customer notice: marketing CMN-1", "Approve: Customer notice: marketing"]]) {
      const c = card(page, name);
      await reviewed(page, c, label);
      await (await control(page, c, /Send to the customer/)).click();
    }
    await shot(page, "12-operator-complete-1440");
    await open(page, "operations");
    await shot(page, "13-operations-complete-1440");
    ok((await page.getByTestId("gaps").count()) === 0, "no unresolved gaps remain, said as a statement about records");

    await page.setViewportSize(MOBILE);
    await open(page, "customer/today");
    ok((await page.locator("[data-testid=headline]").innerText()).includes("Your break is confirmed"), "customer sees 'Your break is confirmed' only after both are confirmed and notices approved");
    await shot(page, "14-customer-today-confirmed-390", false);
    await open(page, "customer/updates"); await shot(page, "15-customer-updates-390");
    await open(page, "customer/support"); await shot(page, "16-customer-support-390");
    // Scoped to the customer's own screen. The surrounding demonstration shell names every role, as a real customer's app would not.
    const final = await page.getByTestId("customer-app").innerText();
    ok(!/Account controls system|reviewer/i.test(final) && !/always available/i.test(final), "customer Support screen has no operator content and no availability promise");
    await open(page, "customer/today"); await axeRun(page, "customer/today [populated, 390]");
    await open(page, "operator"); await axeRun(page, "operator [populated]");
    await open(page, "operations"); await axeRun(page, "operations [populated]");
    await open(page, "guide");
    ok(await page.getByTestId("progress").innerText() === "All 7 steps complete", "the completed browser journey reports all 7 steps complete");
    ok(await page.getByTestId("journey").locator('li[data-done="true"]').count() === 7, "all 7 browser journey records are reflected in the guide");
    await ctx.close();
  }

  // 5. Failure and interruption through the real UI
  const fresh = async (preset) => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    await open(page, "simulation");
    await page.getByRole("radio", { name: new RegExp(preset) }).check();
    await open(page, "customer/options"); await click(page, "Ask for a break"); await click(page, "Review your request"); await click(page, "Send my request");
    await open(page, "operator");
    await reviewed(page, page, "Take responsibility for this request");
    return { ctx, page };
  };
  const approveSend = async (page, short, id) => {
    const c = card(page, `${short} ${id}`);
    await reviewed(page, c, `Approve: ${short}`);
    await (await control(page, c, /Send/)).click();
    return c;
  };

  {
    console.log("\nOne succeeds, one fails");
    const { ctx, page } = await fresh("One succeeds");
    await approveSend(page, "Account break", "ACB-1");
    const m = await approveSend(page, "Marketing suppression", "MKT-1");
    ok((await m.getAttribute("data-stage")) === "retry", "a refused attempt leaves marketing at 'Retry available — not sent', not Sent and not Queued");
    ok(!/queued/i.test(await body(page)), "the word Queued appears nowhere");
    await (await control(page, m, /Send again/)).click();
    ok((await m.getAttribute("data-stage")) === "unresolved", "after the permitted attempts marketing is Unresolved");
    await open(page, "operations");
    ok((await page.getByTestId("gaps").innerText()).includes("MKT-1"), "Protection Operations lists the marketing gap");
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "sent", "the account action is unaffected");
    await shot(page, "17-operations-one-failed-1440");
    await ctx.close();
  }
  {
    console.log("\nUnknown outcome");
    const { ctx, page } = await fresh("One outcome is unknown");
    const c = await approveSend(page, "Account break", "ACB-1");
    ok((await c.getAttribute("data-stage")) === "unresolved", "an unknown outcome is Unresolved, not Sent");
    ok(!(await c.locator("button", { hasText: /Send/ }).count()), "no retry is offered for an unknown outcome");
    await open(page, "operations");
    const o = card(page, "Account break ACB-1");
    ok((await o.innerText()).includes("outcome of this send is unknown"), "Operations sees the unknown outcome");
    await openReview(o);
    await o.getByRole("textbox").fill("The receiving system's log shows the request arrived.");
    await shot(page, "18-operations-unknown-1440");
    await (await control(page, o, /Record: it was delivered/)).click();
    ok((await o.getAttribute("data-stage")) === "sent", "after a separate reconciliation it is recorded as Sent");
    await ctx.close();
  }
  {
    console.log("\nApproved but never accepted");
    const { ctx, page } = await fresh("Approved but never accepted");
    await approveSend(page, "Account break", "ACB-1");
    await open(page, "operations");
    const o = card(page, "Account break ACB-1");
    ok(await o.getByText("Not yet accepted").isVisible(), "flagged 'Not yet accepted'");
    ok((await (await control(page, o, /Simulate:/)).isDisabled()), "the system's step is unavailable");
    await open(page, "simulation"); await click(page, "Advance one day");
    await open(page, "operator");
    ok((await body(page)).includes("An authorised action has not been accepted"), "after a day the reviewer is told the expectation passed");
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "sent", "still Sent, nothing re-sent");
    await shot(page, "19-operator-unaccepted-1440");
    await open(page, "customer/today");
    ok(!/not been accepted|Account break/.test(await body(page)), "the customer is told nothing about it");
    await ctx.close();
  }
  {
    console.log("\nInterruption and recovery");
    const { ctx, page } = await fresh("Interrupted after accepting");
    await approveSend(page, "Account break", "ACB-1");
    await open(page, "operations");
    const o = card(page, "Account break ACB-1");
    await (await control(page, o, /Simulate:/)).click(); await (await control(page, o, /Simulate:/)).click();
    await openSimulationControls(page);
    await page.locator("li.card", { hasText: "Account controls system" }).getByRole("button", { name: "Record as unavailable" }).click();
    ok((await o.getAttribute("data-stage")) === "unresolved", "accepted, then interrupted, is Unresolved");
    await openSimulationControls(page);
    await page.getByRole("button", { name: /Try to approve/ }).click();
    ok(await page.getByRole("alert").innerText().then((t) => t.includes("Not allowed")), "Protection Operations cannot approve: the kernel refuses");
    await open(page, "operator");
    await (await control(page, page, /Propose: Ask the manual desk/)).click();
    const rec = card(page, "Account break (manual desk) ABM-1");
    ok((await rec.getAttribute("data-stage")) === "proposed", "the recovery is a fresh proposal: Proposed, with no approval carried over");
    ok((await rec.innerText()).includes("Not yet authorised by anyone"), "the earlier approval is not reused");
    await (await control(page, rec, "Put forward for approval")).click();
    await open(page, "simulation"); await page.getByLabel(/Revoke the reviewer/).check();
    await open(page, "operator");
    await reviewed(page, rec, "Approve: Account break (manual desk)");
    ok(/revoked|expired/i.test(await page.getByRole("alert").innerText()), "with the reviewer's authority revoked, approval is refused");
    await shot(page, "20-operator-recovery-refused-1440");
    await open(page, "simulation"); await page.getByLabel(/Revoke the reviewer/).uncheck();
    await open(page, "operator");
    await reviewed(page, rec, "Approve: Account break (manual desk)");
    ok((await rec.getAttribute("data-stage")) === "approved", "with authority restored a person's fresh approval is recorded");
    await ctx.close();
  }

  // 5b. Applied, but the simulated read-back does not match: a separate, freshly authorised correction
  {
    console.log("\nApplied but not confirmed: correction");
    const { ctx, page } = await fresh("Applied, but the read-back");
    await approveSend(page, "Account break", "ACB-1");
    await approveSend(page, "Marketing suppression", "MKT-1");
    await open(page, "operations");
    const oa = card(page, "Account break ACB-1"), om = card(page, "Marketing suppression MKT-1");
    for (let i = 0; i < 3; i++) { await (await control(page, oa, /Simulate:/)).click(); await (await control(page, om, /Simulate:/)).click(); }
    await (await control(page, oa, "Run simulated read-back")).click();
    await (await control(page, om, "Run simulated read-back")).click();
    ok(/did NOT match|NOT confirmed/.test(await page.getByTestId("gaps").innerText()), "Operations lists the unconfirmed protection and its owner");
    await open(page, "operator");
    await (await control(page, card(page, "Marketing suppression MKT-1"), "Record confirmation")).click();
    ok(await (await control(page, card(page, "Account break ACB-1"), "Record confirmation")).isDisabled(), "confirmation cannot be recorded for a mismatched read-back");
    await openReview(card(page, "Account break ACB-1"));
    ok((await card(page, "Account break ACB-1").innerText()).includes("did not match"), "the reason is stated beside the disabled button");
    const corr = page.getByTestId("correction");
    await openReview(corr);
    ok((await corr.innerText()).includes("Authorisation required") && (await corr.innerText()).includes("fresh approval"), "the card states the owner, next action and the fresh authorisation required");
    await shot(page, "22-operator-unconfirmed-correction-1440");
    await (await control(page, corr, /Propose: Account break correction/)).click();
    const acx = card(page, "Account break correction ACX-1");
    ok((await acx.innerText()).includes("Not yet authorised by anyone"), "the correction starts with no approval carried over");
    await (await control(page, acx, "Put forward for approval")).click();
    await reviewed(page, acx, "Approve: Account break correction");
    await (await control(page, acx, /Send to/)).click();
    await open(page, "operations");
    const ox = card(page, "Account break correction ACX-1");
    for (let i = 0; i < 3; i++) await (await control(page, ox, /Simulate:/)).click();
    await (await control(page, ox, "Run simulated read-back")).click();
    await open(page, "operator");
    await (await control(page, card(page, "Account break correction ACX-1"), "Record confirmation")).click();
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "applied", "the original is still Applied, never overwritten or confirmed");
    ok((await card(page, "Marketing suppression MKT-1").getAttribute("data-stage")) === "confirmed", "the already-confirmed control is untouched");
    await shot(page, "23-operator-correction-confirmed-1440");
    await axeRun(page, "operator [correction]");
    await ctx.close();
  }

  // 5c. No contact permission: direct refusal, and a withdrawn permission makes an approval stale
  {
    console.log("\nNo contact permission");
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    await open(page, "customer/options"); await click(page, "Ask for a break");
    await page.getByRole("radio", { name: /Updates in the app only/ }).check();
    await click(page, "Review your request"); await click(page, "Send my request");
    await open(page, "operator");
    await reviewed(page, page, "Take responsibility for this request");
    const prop = page.getByRole("button", { name: "Propose a support handover" });
    ok(await prop.isDisabled(), "optional support outreach is not offered when permission is declined");
    ok((await body(page)).includes("NOT permitted right now"), "the operator sees why, and that the refusal is also at the command boundary");
    await shot(page, "24-operator-no-permission-1440");
    await open(page, "customer/support"); await shot(page, "25-customer-support-1440", false);
    ok((await body(page)).includes("cannot apply a real break"), "Support states the demo's limits");
    ok(!/always available/i.test(await body(page)), "no unconditional availability promise");
    await ctx.close();
  }

  // 5e. A pending correction goes stale when the original is later confirmed
  {
    console.log("\nStale correction");
    const { ctx, page } = await fresh("Applied, but the read-back");
    await approveSend(page, "Account break", "ACB-1");
    await open(page, "operations");
    const oa = card(page, "Account break ACB-1");
    for (let i = 0; i < 3; i++) await (await control(page, oa, /Simulate:/)).click();
    await (await control(page, oa, "Run simulated read-back")).click();
    await open(page, "operator");
    await page.getByRole("button", { name: "Propose a support handover" }).click();
    await (await control(page, card(page, "Support handover SUP-1"), "Put forward for approval")).click();
    const sup = await card(page, "Support handover SUP-1").innerText();
    ok(/current permission/.test(sup) && !/both protections|independent/i.test(sup), "the support approval checks state the optional-outreach authority, not a protection prerequisite");
    ok(!/both protections|independent/i.test(await page.locator("#policies").innerText()), "the rendered policy explanation has no stale support sequence");
    await shot(page, "29-operator-support-authority-1440");
    await (await control(page, page.getByTestId("correction"), /Propose: Account break correction/)).click();
    const acx = card(page, "Account break correction ACX-1");
    await (await control(page, acx, "Put forward for approval")).click();
    await reviewed(page, acx, "Approve: Account break correction");
    ok(await (await control(page, acx, /Send to/)).isVisible(), "an approved, applicable correction can be sent");
    await open(page, "simulation");
    await page.locator("#r-account-controls").selectOption("matches");
    await open(page, "operations");
    await (await control(page, card(page, "Account break ACB-1"), "Run simulated read-back")).click();
    await open(page, "operator");
    await (await control(page, card(page, "Account break ACB-1"), "Record confirmation")).click();
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "the original is confirmed after a newer matching read-back");
    const stale = card(page, "Account break correction ACX-1");
    ok(await stale.getByTestId("not-applicable").isVisible(), "the pending correction says it is no longer applicable");
    ok((await stale.locator("button", { hasText: /Send/ }).count()) === 0, "no send is offered for it");
    ok((await stale.getAttribute("data-stage")) === "approved", "its approval history is kept, not erased or re-approved");
    await shot(page, "27-operator-stale-correction-1440");
    await open(page, "operations");
    ok((await page.getByTestId("gaps").innerText()).includes("no longer applicable"), "Protection Operations sees it as an open item");
    await shot(page, "28-operations-stale-correction-1440");
    await open(page, "operator");
    await (await control(page, card(page, "Account break correction ACX-1"), "Withdraw: no longer applicable")).click();
    ok((await card(page, "Account break correction ACX-1").getAttribute("data-stage")) === "closed", "withdrawal closes it and records it");
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "the original confirmation stands");
    await axeRun(page, "operator [stale correction withdrawn]");
    await ctx.close();
  }

  // ───────────────────────── P2: operator-originated early-support review ─────────────────────────
  const p2 = async (variant, width = DESKTOP) => {
    const ctx = await browser.newContext({ viewport: width });
    const page = await ctx.newPage();
    await open(page, "simulation");
    await page.getByRole("radio", { name: /Operator-originated early-support review/ }).check();
    await page.getByRole("radio", { name: new RegExp(variant) }).check();
    return { ctx, page };
  };
  const admit = async (page) => {
    await click(page, "Admit the simulated review event");
    await open(page, "operator");
    await reviewed(page, page, "Take responsibility for this request");
  };
  const ops = (page, name) => card(page, name);
  const CHECKIN = "In-app message IAM-1";

  {
    console.log("\nP2: current context, the full path");
    const { ctx, page } = await p2("Current context, contact permitted");
    await shot(page, "30-p2-simulation-selector-1440");
    ok(await page.getByTestId("scenario-picker").isVisible(), "the scenario selector is shown in Simulation controls");
    // selecting creates nothing: operator queue is empty, customer sees nothing
    await open(page, "operator");
    ok((await body(page)).includes("No review requests are waiting"), "selecting a scenario creates no record");
    await open(page, "customer/today");
    ok(!/review|signal|SRC-9001|Upstream/i.test(await page.getByTestId("customer-app").innerText()), "the customer sees nothing before the event is admitted");
    await open(page, "simulation");
    await click(page, "Admit the simulated review event");
    ok(await page.getByRole("radio", { name: /Customer-requested break/ }).isDisabled(), "the other scenario is locked once records exist");
    await open(page, "customer/today");
    ok(!/review|signal|SRC-9001|Upstream|C-2087|R-14/i.test(await page.getByTestId("customer-app").innerText()), "admitting the event discloses nothing to the customer");
    await shot(page, "34-p2-customer-before-release-390", false);
    await open(page, "operator");
    await reviewed(page, page, "Take responsibility for this request");
    const rc = page.getByTestId("review-card");
    ok(await rc.isVisible(), "the 'Why this needs review' card opens the workspace");
    const t = await rc.innerText();
    ok(/Simulated source/.test(t) && /SRC-9001/.test(t) && /What is not known/.test(t) && /not evidence that harm or wrongdoing occurred/.test(t) && /Who decides/.test(t) && /What would be shared/.test(t), "the card shows source, limits, knowns and unknowns, who decides and what is shared");
    ok(!/risk score|rating|vulnerab/i.test(t), "the card scores and labels nobody");
    await shot(page, "31-p2-operator-review-1440");
    await page.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    const esc = card(page, CHECKIN);
    ok((await esc.getAttribute("data-stage")) === "proposed", "the check-in is prepared as a proposal, not approved or sent");
    ok((await page.locator("button", { hasText: /Send to/ }).count()) === 0, "nothing can be sent yet");
    await (await control(page, esc, "Put forward for approval")).click();
    ok(await (await control(page, esc, "Record decision: do not proceed")).isVisible(), "a recorded 'do not proceed' decision is offered");
    await reviewed(page, esc, "Approve: In-app message");
    ok((await esc.innerText()).includes("Authorised by"), "a named person is recorded as the authoriser");
    await (await control(page, esc, /Send to/)).click();
    await shot(page, "32-p2-operator-checkin-sent-1440");
    await open(page, "customer/today");
    ok(!/message from the team|support is available/i.test(await page.getByTestId("customer-app").innerText()), "an authorised, sent message is still not visible to the customer");
    await open(page, "operations");
    const oe = card(page, CHECKIN);
    const ot = await oe.innerText();
    ok(!/R-14|Reason code|Contact choice|Updates in the app|support is available|Source context/.test(await body(page)), "Operations sees no context, contact record or invitation text");
    for (const expect of ["acknowledged", "acknowledged", "applied"]) { await (await control(page, oe, /Simulate:/)).click(); ok((await oe.getAttribute("data-stage")) === expect, `the channel advances to ${expect}`); }
    await shot(page, "33-p2-operations-delivery-1440");
    await open(page, "customer/today");
    ok((await page.getByTestId("invitation").count()) === 1, "the invitation appears once the channel reports it delivered");
    ok(!/risk|vulnerab|bonus|reward/i.test(await page.getByTestId("invitation").innerText()), "the invitation is supportive and non-promotional");
    await open(page, "operations");
    await (await control(page, card(page, CHECKIN), "Run simulated read-back")).click();
    await open(page, "operator");
    await (await control(page, card(page, CHECKIN), "Record confirmation")).click();
    ok((await card(page, CHECKIN).getAttribute("data-stage")) === "confirmed", "confirmation is recorded after the simulated read-back");
    await page.setViewportSize(MOBILE);
    await open(page, "customer/today");
    await shot(page, "35-p2-customer-invitation-390");
    await axeRun(page, "customer/today [P2 invitation, 390]");
    await page.getByRole("button", { name: /No thanks: no more optional support messages/ }).click();
    ok(await page.getByTestId("opted-out").isVisible(), "a decline is recorded as the customer's choice, with no penalty");
    ok(await page.getByTestId("invitation").isVisible(), "the message is not taken back");
    await shot(page, "36-p2-customer-declined-390");
    await open(page, "customer/options");
    ok(/separate request/.test(await body(page)), "a later break is shown as a separate request, not started from the message");
    await open(page, "customer/support");
    ok(await page.getByRole("radio", { name: /Updates in the app only/ }).isChecked(), "Support shows the customer's current contact choice");
    await page.setViewportSize(DESKTOP);
    for (const r of ["operator", "operations", "guide", "simulation"]) { await open(page, r); await axeRun(page, `${r} [P2]`); }
    // reset returns to the customer-requested scenario with nothing carried over
    await open(page, "simulation");
    await page.getByRole("button", { name: "Reset to choose another scenario" }).first().click();
    ok(await page.getByRole("radio", { name: /Customer-requested break/ }).isChecked(), "reset returns to the customer-requested scenario");
    await open(page, "customer/today");
    ok(!/message from the team|SRC-9001|C-2087/.test(await body(page)), "nothing from the early-support scenario leaks after reset");
    await open(page, "operator");
    ok((await body(page)).includes("No requests are waiting"), "the operator queue is empty after reset");
    await ctx.close();
  }
  {
    console.log("\nP2: missing context");
    const { ctx, page } = await p2("Missing source context");
    await admit(page);
    const rc = page.getByTestId("review-card");
    ok((await rc.getAttribute("data-context")) === "missing" && /Missing/.test(await rc.innerText()), "the card states the context is missing");
    ok(await page.getByRole("button", { name: "Prepare the early-support check-in" }).isDisabled(), "the discretionary check-in is blocked");
    ok(/Existing protections|Nothing existing is removed/.test(await rc.innerText()), "the card says existing protections are unchanged");
    ok(/Unavailable/.test(await rc.innerText()), "a review-level no-action decision is shown as unavailable, with its dependency");
    await shot(page, "37-p2-operator-missing-context-1440");
    await page.getByRole("button", { name: "Request clarification from the source" }).click();
    const clr = card(page, "Context clarification request CLR-1");
    await (await control(page, clr, "Put forward for approval")).click();
    await reviewed(page, clr, "Approve: Context clarification request");
    await (await control(page, clr, /Send to/)).click();
    await open(page, "operations");
    const oc = card(page, "Context clarification request CLR-1");
    for (let i = 0; i < 3; i++) await (await control(page, oc, /Simulate:/)).click();
    ok((await oc.getAttribute("data-stage")) === "applied", "the clarification request is applied: sent, received, accepted, reported done");
    ok(!(await oc.textContent()).includes("Run simulated read-back"), "no confirmation is invented for a clarification");
    await open(page, "operator");
    ok(await page.getByRole("button", { name: "Prepare the early-support check-in" }).isDisabled(), "completing a clarification does not refresh or unblock the review");
    await axeRun(page, "operator [P2 missing context]");
    await ctx.close();
  }
  {
    console.log("\nP2: stale context");
    const { ctx, page } = await p2("Stale source context");
    await admit(page);
    ok(/older than the configured limit/.test(await page.getByTestId("review-card").innerText()), "the card explains that the context is stale");
    ok(await page.getByRole("button", { name: "Prepare the early-support check-in" }).isDisabled(), "the check-in is blocked for stale context");
    await ctx.close();
  }
  {
    console.log("\nP2: no optional-contact permission");
    const { ctx, page } = await p2("No optional-contact permission on file");
    await admit(page);
    ok(await page.getByRole("button", { name: "Prepare the early-support check-in" }).isDisabled(), "the check-in is blocked without permission, although the context is current");
    ok(/Fresh context does not create contact permission/.test(await page.getByTestId("review-card").innerText()), "the card says fresh context does not create permission");
    await shot(page, "38-p2-operator-no-permission-1440");
    await ctx.close();
  }
  {
    console.log("\nP2: delivery refused");
    const { ctx, page } = await p2("Delivery refused");
    await admit(page);
    await page.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    const esc = card(page, CHECKIN);
    await (await control(page, esc, "Put forward for approval")).click();
    await reviewed(page, esc, "Approve: In-app message");
    await (await control(page, esc, /Send to/)).click();
    ok((await esc.getAttribute("data-stage")) === "retry", "a refused attempt leaves 'Retry available — not sent'");
    await (await control(page, esc, /Send again/)).click();
    ok((await esc.getAttribute("data-stage")) === "unresolved", "after the permitted attempts it is unresolved");
    ok((await esc.locator("button", { hasText: /Send/ }).count()) === 0, "no further send is offered");
    await open(page, "operations");
    ok((await page.getByTestId("gaps").innerText()).includes("IAM-1"), "Operations lists the gap");
    await shot(page, "39-p2-operations-delivery-failed-1440");
    await open(page, "customer/today");
    ok(!/message from the team/i.test(await body(page)), "the customer is not told anything");
    await open(page, "operator");
    await (await control(page, card(page, CHECKIN), /Re-check and propose again/)).click();
    ok((await card(page, CHECKIN).innerText()).includes("Not yet authorised by anyone"), "re-checking returns it to proposed with no approval carried over");
    await shot(page, "40-p2-operator-recheck-1440");
    await ctx.close();
  }
  {
    console.log("\nP2: delivery outcome unknown");
    const { ctx, page } = await p2("Delivery outcome unknown");
    await admit(page);
    await page.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    const esc = card(page, CHECKIN);
    await (await control(page, esc, "Put forward for approval")).click();
    await reviewed(page, esc, "Approve: In-app message");
    await (await control(page, esc, /Send to/)).click();
    ok((await esc.getAttribute("data-stage")) === "unresolved" && (await esc.locator("button", { hasText: /Send/ }).count()) === 0, "an unknown outcome is unresolved and cannot be retried");
    await open(page, "operations");
    const o = card(page, CHECKIN);
    ok((await o.innerText()).includes("outcome of this send is unknown"), "Operations sees the unknown outcome");
    await openReview(o);
    await o.getByRole("textbox").fill("The receiving system's log shows the request arrived.");
    await (await control(page, o, /Record: it was delivered/)).click();
    ok((await o.getAttribute("data-stage")) === "sent", "a separate reconciliation records it as Sent, not delivered to the customer");
    await open(page, "customer/today");
    ok(!/message from the team/i.test(await body(page)), "the customer still sees nothing");
    await ctx.close();
  }
  {
    console.log("\nP2: channel unavailable after accepting");
    const { ctx, page } = await p2("Channel unavailable after accepting");
    await admit(page);
    await page.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    const esc = card(page, CHECKIN);
    await (await control(page, esc, "Put forward for approval")).click();
    await reviewed(page, esc, "Approve: In-app message");
    await (await control(page, esc, /Send to/)).click();
    await open(page, "operations");
    const o = card(page, CHECKIN);
    await (await control(page, o, /Simulate:/)).click(); await (await control(page, o, /Simulate:/)).click();
    await openSimulationControls(page);
    await page.locator("li.card", { hasText: "In-app message channel" }).getByRole("button", { name: "Record as unavailable" }).click();
    ok((await o.getAttribute("data-stage")) === "unresolved", "accepted, then unavailable, is Unresolved");
    await open(page, "operator");
    const t = await body(page);
    ok(/no other pathway is configured/.test(t), "the operator is told plainly that no permitted route is configured");
    ok(!/someone is (working|handling)|actively/i.test(t), "no claim that anyone is handling it");
    ok(!(await page.getByRole("button", { name: /Propose: / }).count()), "no alternative recipient or channel is offered");
    await shot(page, "41-p2-operator-no-route-1440");
    await ctx.close();
  }
  {
    console.log("\nP2: enlarged text and 320px reflow");
    const { ctx, page } = await p2("Current context, contact permitted", MOBILE);
    await admit(page);
    await page.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    await open(page, "operator");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, "operator review card: no horizontal scroll at 200% text on 390px");
    await shot(page, "42-p2-operator-review-200pc-390", false);
    await page.reload();
    await page.setViewportSize({ width: 320, height: 700 });
    await open(page, "operator");
    ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, "operator review card reflows at 320px");
    await ctx.close();
  }

  // 5c. Availability groups, compact summaries with a review entry, collapsed simulation controls, and jump links that reveal and focus
  {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const page = await ctx.newPage();
    console.log("\nDecision groups, review entries and jump links");
    await open(page, "customer/options");
    await click(page, "Ask for a break"); await click(page, "Review your request"); await click(page, "Send my request");
    await open(page, "operator");
    // Jump links to collapsed sections reveal them and move keyboard focus inside
    for (const [label, id] of [["Authority", "authority"], ["Audit history", "record"], ["Request", "request"], ["Requirements", "policies"]]) {
      await page.locator("nav.jump").getByRole("link", { name: label }).click();
      const state = await page.evaluate((i) => { const el = document.getElementById(i); const a = document.activeElement; return { open: el instanceof HTMLDetailsElement ? el.open : null, focusInside: !!a && el.contains(a), tag: a?.tagName }; }, id);
      ok(state.focusInside, `the "${label}" link moves focus into the section (focus on ${state.tag})`);
      if (state.open !== null) ok(state.open === true, `the "${label}" link opens the collapsed section`);
    }
    await page.locator("nav.jump").getByRole("link", { name: "Authority" }).focus();
    await page.keyboard.press("Enter");
    ok(await page.evaluate(() => document.activeElement?.tagName === "SUMMARY" && document.activeElement.parentElement.id === "authority"), "activating the Authority link from the keyboard lands on its summary");
    await reviewed(page, page, "Take responsibility for this request");
    for (const [id, label] of [["Account break ACB-1", "Approve: Account break"], ["Marketing suppression MKT-1", "Approve: Marketing suppression"]]) {
      const c = card(page, id);
      await reviewed(page, c, label);
      await (await control(page, c, /Send to/)).click();
    }
    // The state under review: authorised and sent. Customer-notice approvals are blocked; the prepared message is available.
    const group = (g) => page.locator(`section#decisions-${g}`);
    ok((await group("available").locator(":scope > .decision").count()) >= 1 && (await group("available").innerText()).includes("Prepared customer message"), "the prepared pending-status message is under Available for your decision now");
    ok((await group("waiting").locator("article[data-group=waiting]").count()) === 4, "sent actions and held customer-notice approvals are under Waiting");
    const notice = card(page, "Customer notice: account break CAN-1");
    ok((await notice.getAttribute("data-group")) === "waiting", "a customer-notice approval is in the Waiting group");
    ok((await notice.locator("[data-testid=blocker]").innerText()).includes("Held until: Account break confirmed"), "its blocker is visible in the summary without opening the review");
    ok(await notice.locator("details.review-action").evaluate((d) => !d.open), "the review entry is closed by default");
    const nextBlock = page.locator("[data-testid=next-steps]");
    ok((await nextBlock.innerText()).includes("Cannot be completed now"), "next-step guidance says a blocked approval cannot be completed now");
    ok((await nextBlock.getByRole("link", { name: "Go to this decision" }).count()) === 1, "only the available item links to a decision");
    await nextBlock.getByRole("link", { name: "Go to this decision" }).click();
    ok(await page.evaluate(() => { const a = document.activeElement; return a?.tagName === "SUMMARY" && a.textContent.includes("Review this action") && a.closest("section")?.id?.startsWith("message-"); }), "the link takes keyboard focus to the available decision's review entry");
    // Review entry: opens by keyboard; shows context, exact sharing, requirements and individual checks before the decision control
    const rv = card(page, "Customer notice: marketing CMN-1");
    ok(await rv.locator("details.review-action").evaluate((d) => !d.open), "an action nobody has opened is still collapsed");
    await rv.locator("details.review-action > summary").focus();
    await page.keyboard.press("Space");
    ok(await rv.locator("details.review-action").evaluate((d) => d.open), "the review entry opens with the keyboard");
    const order = await rv.locator(".review-body").evaluate((el) => ["Exactly what would be shared", "Never shared", "Policy requirements", "Your decision"].map((t) => el.innerText.indexOf(t)));
    ok(order.every((n) => n >= 0) && order.every((n, i) => i === 0 || order[i - 1] < n), "the review shows exact sharing, then policy requirements, then the decision control");
    await page.keyboard.press("Enter");
    ok(await rv.locator("details.review-action").evaluate((d) => !d.open), "it closes again with the keyboard");
    // An action that has moved between groups keeps its review open
    const opened = card(page, "Account break ACB-1");
    ok(await opened.locator("details.review-action").evaluate((d) => d.open), "a review a person opened stays open while the action changes group");
    // Simulation controls are collapsed and labelled; opening them reveals the controls
    await open(page, "operations");
    ok(await page.locator("details#simulation-controls").evaluate((d) => !d.open), "simulation controls are collapsed by default");
    ok((await page.locator("details#simulation-controls > summary").innerText()).startsWith("Simulation controls"), "they are labelled as simulation controls");
    ok((await page.locator("section#ops-available article").first().locator("[data-testid=available-line]").innerText()).includes("Available now"), "Operations leads with what is available now");
    await openSimulationControls(page);
    ok(await page.getByRole("button", { name: /Try to approve/ }).isVisible(), "opening them reveals the role check");
    await ctx.close();
  }

  // 5d. Enlarged text (200%) and 320px reflow
  {
    console.log("\nEnlarged text");
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    for (const r of ["customer/today", "customer/options", "customer/support", "operator", "operations", "guide"]) {
      await open(page, r);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 0, `${r}: no horizontal scroll at 200% text on 390px (overflow ${over})`);
    }
    await open(page, "customer/today");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await shot(page, "26-customer-today-200pc-390", false);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.reload();
    for (const r of ["customer/today", "operator", "guide"]) { await open(page, r); ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, `${r}: reflows at 320px`); }
    await ctx.close();
  }

  // 6. Dark-mode screenshot for review
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: "dark" });
    const page = await ctx.newPage();
    await open(page, "customer/today"); await shot(page, "21-customer-today-dark-390", false);
    await ctx.close();
  }
  await browser.close();
} catch (e) {
  failures.push(`script error: ${e.stack || e}`);
  console.log(e);
}
ok(browserIssues.length === 0, `browser console and page errors are clear${browserIssues.length ? ` -> ${browserIssues.join(" | ")}` : ""}`);
console.log(failures.length ? `\n${failures.length} FAILED` : "\nAll browser checks passed");
process.exit(failures.length ? 1 : 0);
