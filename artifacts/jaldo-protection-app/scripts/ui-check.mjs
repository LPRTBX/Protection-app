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
const PORT = 23582;
const BASE = `http://localhost:${PORT}/protection-app/`;
const SHOTS = process.env.SHOTS_DIR ? path.resolve(here, "..", "..", "..", process.env.SHOTS_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const failures = [];
const ok = (c, m) => { if (!c) { failures.push(m); console.log("  FAIL", m); } else console.log("  ok  ", m); };
const server = spawn("pnpm", ["exec", "vite", "preview", "--config", "vite.config.ts", "--port", String(PORT)], { cwd: path.join(here, ".."), stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
process.on("exit", () => { try { server.kill("SIGTERM"); } catch { /* stopped */ } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 500)); }

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
const open = async (page, r) => { await page.goto(`${BASE}#/${r}`); await page.waitForSelector("h1"); };
const click = (page, name, opts = {}) => page.getByRole("button", { name, ...opts }).click();
const checkAll = async (scope) => { for (const cb of await scope.getByRole("checkbox").all()) await cb.check(); };

/** Tick every check inside the fieldset that holds this button, then press it. */
async function reviewed(page, region, name) {
  const fs = region.locator("fieldset.review", { has: page.getByRole("button", { name }) }).first();
  await checkAll(fs);
  await fs.getByRole("button", { name }).click();
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
      ok(await page.locator("#primary-nav").getByRole("link", { name: /Protection Operations/ }).isVisible(), "all destinations are reachable from the menu");
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
    ok(await page.evaluate(() => document.activeElement?.className === "skip"), "first Tab lands on the skip link");
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

  // 4. The complete journey through the real UI, with screenshots
  {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    console.log("\nJourney (390px customer, then desktop operator and operations)");
    await open(page, "guide"); await shot(page, "01-guide-390");
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
    await click(page, "Prepare the configured plan");
    ok(await page.getByText("Break request procedure (fictional)").first().isVisible(), "applicable policies are listed after the plan is prepared");
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
    await acb.getByRole("button", { name: /Send to/ }).click();
    await mkt.getByRole("button", { name: /Send to/ }).click();
    ok((await acb.getAttribute("data-stage")) === "sent" && (await mkt.getAttribute("data-stage")) === "sent", "both are Sent");
    await shot(page, "09-operator-actions-sent-1440");

    // customer, mid-journey: only approved information
    await open(page, "customer/today");
    const mid = await body(page);
    ok(!/Account controls|Marketing suppression system|ACB-1|dispatch|attempt/i.test(mid), "customer view shows no system names, ids or attempts");
    ok(!/Your break is confirmed|recorded as confirmed|simulated check in this demo matched/.test(mid), "customer is not told anything is confirmed yet");

    await open(page, "operations");
    await shot(page, "10-operations-sent-1440");
    const oAcb = card(page, "Account break ACB-1");
    const oMkt = card(page, "Marketing suppression MKT-1");
    for (const [c, expect] of [[oAcb, "acknowledged"], [oAcb, "acknowledged"], [oAcb, "applied"]]) {
      await c.getByRole("button", { name: /Simulate:/ }).click();
      ok((await c.getAttribute("data-stage")) === expect, `account system advances to ${expect}`);
    }
    for (let i = 0; i < 3; i++) await oMkt.getByRole("button", { name: /Simulate:/ }).click();
    ok((await oMkt.getAttribute("data-stage")) === "applied", "marketing system is Applied");
    ok((await body(page)).includes("not independently confirmed") || (await body(page)).includes("not confirmed"), "Operations says applied is not confirmed");
    await shot(page, "11-operations-applied-1440");
    await oAcb.getByRole("button", { name: "Run simulated read-back" }).click();
    await oMkt.getByRole("button", { name: "Run simulated read-back" }).click();
    ok((await oAcb.getAttribute("data-stage")) === "applied", "a read-back alone does not confirm: still Applied");

    await open(page, "operator");
    await card(page, "Account break ACB-1").getByRole("button", { name: "Record confirmation" }).click();
    await card(page, "Marketing suppression MKT-1").getByRole("button", { name: "Record confirmation" }).click();
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "reviewer records confirmation");
    for (const [name, label] of [["Customer notice: account break CAN-1", "Approve: Customer notice: account break"], ["Customer notice: marketing CMN-1", "Approve: Customer notice: marketing"]]) {
      const c = card(page, name);
      await reviewed(page, c, label);
      await c.getByRole("button", { name: /Send to the customer/ }).click();
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
    const final = await body(page);
    ok(!/Account controls system|reviewer/i.test(final) && !/always available/i.test(final), "customer Support screen has no operator content and no availability promise");
    await open(page, "customer/today"); await axeRun(page, "customer/today [populated, 390]");
    await open(page, "operator"); await axeRun(page, "operator [populated]");
    await open(page, "operations"); await axeRun(page, "operations [populated]");
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
    await click(page, "Prepare the configured plan");
    return { ctx, page };
  };
  const approveSend = async (page, short, id) => {
    const c = card(page, `${short} ${id}`);
    await reviewed(page, c, `Approve: ${short}`);
    await c.getByRole("button", { name: /Send/ }).click();
    return c;
  };

  {
    console.log("\nOne succeeds, one fails");
    const { ctx, page } = await fresh("One succeeds");
    await approveSend(page, "Account break", "ACB-1");
    const m = await approveSend(page, "Marketing suppression", "MKT-1");
    ok((await m.getAttribute("data-stage")) === "retry", "a refused attempt leaves marketing at 'Retry available — not sent', not Sent and not Queued");
    ok(!/queued/i.test(await body(page)), "the word Queued appears nowhere");
    await m.getByRole("button", { name: /Send again/ }).click();
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
    ok(!(await c.getByRole("button", { name: /Send/ }).count()), "no retry is offered for an unknown outcome");
    await open(page, "operations");
    const o = card(page, "Account break ACB-1");
    ok((await o.innerText()).includes("outcome of this send is unknown"), "Operations sees the unknown outcome");
    await o.getByRole("textbox").fill("The receiving system's log shows the request arrived.");
    await shot(page, "18-operations-unknown-1440");
    await o.getByRole("button", { name: /Record: it was delivered/ }).click();
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
    ok((await o.getByRole("button", { name: /Simulate:/ }).isDisabled()), "the system's step is unavailable");
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
    await o.getByRole("button", { name: /Simulate:/ }).click(); await o.getByRole("button", { name: /Simulate:/ }).click();
    await page.locator("li.card", { hasText: "Account controls system" }).getByRole("button", { name: "Record as unavailable" }).click();
    ok((await o.getAttribute("data-stage")) === "unresolved", "accepted, then interrupted, is Unresolved");
    await page.getByRole("button", { name: /Try to approve/ }).click();
    ok(await page.getByRole("alert").innerText().then((t) => t.includes("Not allowed")), "Protection Operations cannot approve: the kernel refuses");
    await open(page, "operator");
    await page.getByRole("button", { name: /Propose: Ask the manual desk/ }).click();
    const rec = card(page, "Account break (manual desk) ABM-1");
    ok((await rec.getAttribute("data-stage")) === "proposed", "the recovery is a fresh proposal: Proposed, with no approval carried over");
    ok((await rec.innerText()).includes("Not yet authorised by anyone"), "the earlier approval is not reused");
    await rec.getByRole("button", { name: "Put forward for approval" }).click();
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
    for (let i = 0; i < 3; i++) { await oa.getByRole("button", { name: /Simulate:/ }).click(); await om.getByRole("button", { name: /Simulate:/ }).click(); }
    await oa.getByRole("button", { name: "Run simulated read-back" }).click();
    await om.getByRole("button", { name: "Run simulated read-back" }).click();
    ok(/did NOT match|NOT confirmed/.test(await page.getByTestId("gaps").innerText()), "Operations lists the unconfirmed protection and its owner");
    await open(page, "operator");
    await card(page, "Marketing suppression MKT-1").getByRole("button", { name: "Record confirmation" }).click();
    ok(await card(page, "Account break ACB-1").getByRole("button", { name: "Record confirmation" }).isDisabled(), "confirmation cannot be recorded for a mismatched read-back");
    ok((await card(page, "Account break ACB-1").innerText()).includes("did not match"), "the reason is stated beside the disabled button");
    const corr = page.getByTestId("correction");
    ok((await corr.innerText()).includes("Authorisation required") && (await corr.innerText()).includes("fresh approval"), "the card states the owner, next action and the fresh authorisation required");
    await shot(page, "22-operator-unconfirmed-correction-1440");
    await corr.getByRole("button", { name: /Propose: Account break correction/ }).click();
    const acx = card(page, "Account break correction ACX-1");
    ok((await acx.innerText()).includes("Not yet authorised by anyone"), "the correction starts with no approval carried over");
    await acx.getByRole("button", { name: "Put forward for approval" }).click();
    await reviewed(page, acx, "Approve: Account break correction");
    await acx.getByRole("button", { name: /Send to/ }).click();
    await open(page, "operations");
    const ox = card(page, "Account break correction ACX-1");
    for (let i = 0; i < 3; i++) await ox.getByRole("button", { name: /Simulate:/ }).click();
    await ox.getByRole("button", { name: "Run simulated read-back" }).click();
    await open(page, "operator");
    await card(page, "Account break correction ACX-1").getByRole("button", { name: "Record confirmation" }).click();
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
    await click(page, "Prepare the configured plan");
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
    for (let i = 0; i < 3; i++) await oa.getByRole("button", { name: /Simulate:/ }).click();
    await oa.getByRole("button", { name: "Run simulated read-back" }).click();
    await open(page, "operator");
    await page.getByRole("button", { name: "Propose a support handover" }).click();
    await card(page, "Support handover SUP-1").getByRole("button", { name: "Put forward for approval" }).click();
    const sup = await card(page, "Support handover SUP-1").innerText();
    ok(/current permission/.test(sup) && !/both protections|independent/i.test(sup), "the support approval checks state the optional-outreach authority, not a protection prerequisite");
    ok(!/both protections|independent/i.test(await page.locator("#policies").innerText()), "the rendered policy explanation has no stale support sequence");
    await shot(page, "29-operator-support-authority-1440");
    await page.getByTestId("correction").getByRole("button", { name: /Propose: Account break correction/ }).click();
    const acx = card(page, "Account break correction ACX-1");
    await acx.getByRole("button", { name: "Put forward for approval" }).click();
    await reviewed(page, acx, "Approve: Account break correction");
    ok(await acx.getByRole("button", { name: /Send to/ }).isVisible(), "an approved, applicable correction can be sent");
    await open(page, "simulation");
    await page.locator("#r-account-controls").selectOption("matches");
    await open(page, "operations");
    await card(page, "Account break ACB-1").getByRole("button", { name: "Run simulated read-back" }).click();
    await open(page, "operator");
    await card(page, "Account break ACB-1").getByRole("button", { name: "Record confirmation" }).click();
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "the original is confirmed after a newer matching read-back");
    const stale = card(page, "Account break correction ACX-1");
    ok(await stale.getByTestId("not-applicable").isVisible(), "the pending correction says it is no longer applicable");
    ok((await stale.getByRole("button", { name: /Send/ }).count()) === 0, "no send is offered for it");
    ok((await stale.getAttribute("data-stage")) === "approved", "its approval history is kept, not erased or re-approved");
    await shot(page, "27-operator-stale-correction-1440");
    await open(page, "operations");
    ok((await page.getByTestId("gaps").innerText()).includes("no longer applicable"), "Protection Operations sees it as an open item");
    await shot(page, "28-operations-stale-correction-1440");
    await open(page, "operator");
    await card(page, "Account break correction ACX-1").getByRole("button", { name: "Withdraw: no longer applicable" }).click();
    ok((await card(page, "Account break correction ACX-1").getAttribute("data-stage")) === "closed", "withdrawal closes it and records it");
    ok((await card(page, "Account break ACB-1").getAttribute("data-stage")) === "confirmed", "the original confirmation stands");
    await axeRun(page, "operator [stale correction withdrawn]");
    await ctx.close();
  }

  // 5d. Enlarged text (200%) and 320px reflow
  {
    console.log("\nEnlarged text");
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    for (const r of ["customer/today", "customer/options", "customer/support", "operator", "operations"]) {
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
    for (const r of ["customer/today", "operator"]) { await open(page, r); ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, `${r}: reflows at 320px`); }
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
console.log(failures.length ? `\n${failures.length} FAILED` : "\nAll browser checks passed");
process.exit(failures.length ? 1 : 0);
