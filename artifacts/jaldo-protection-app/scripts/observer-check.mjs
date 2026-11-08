/**
 * Browser verification of the demonstration observer view (needs the pre-installed Chromium through Playwright):
 *
 *   pnpm --filter @workspace/jaldo-protection-app run build && pnpm --filter @workspace/jaldo-protection-app run observer-check
 *
 * Drives REAL interactions in one panel and checks what the other panels show: the customer's request reaches the reviewer;
 * approval alone never moves another system; sending reaches the destination; the simulated destination receives, accepts and
 * executes separately; verification and an authorised message update the customer; a partial failure leaves the successful part
 * and the unresolved gap visible. Also: independent navigation and scroll, role boundaries in every panel, brief highlights that
 * never move focus or reset forms, keyboard access, the tablet two-panel comparison and the phone single-panel mode.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PORT = 23587;
const BASE = `http://localhost:${PORT}/protection-app/`;
const SHOTS = process.env.SHOTS_DIR ? path.resolve(here, "..", "..", "..", process.env.SHOTS_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const failures = [];
const ok = (c, m) => { if (!c) { failures.push(m); console.log("  FAIL", m); } else console.log("  ok  ", m); };
const server = spawn("pnpm", ["exec", "vite", "preview", "--config", "vite.config.ts", "--port", String(PORT)], { cwd: path.join(here, ".."), stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
process.on("exit", () => { try { server.kill("SIGTERM"); } catch { /* stopped */ } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 500)); }

const DESKTOP = { width: 1440, height: 900 }, TABLET = { width: 820, height: 1100 }, PHONE = { width: 390, height: 844 };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const issues = [];
const watch = (page) => { page.on("console", (m) => { if (m.type() === "error") issues.push(`console: ${m.text()}`); }); page.on("pageerror", (e) => issues.push(`page error: ${e.message}`)); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const pageOf = (scope) => (typeof scope.page === "function" ? scope.page() : scope);
async function axeRun(page, label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(bad.length === 0, `axe: no serious/critical violations on ${label}${bad.length ? " -> " + bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].html.slice(0, 90)}`).join(" | ") : ""}`);
}
const panel = (page, id) => page.locator(`#panel-${id}`);
const text = (page, id) => panel(page, id).innerText();
const until = (page, fn, arg, msg) => page.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => { console.log("   (timed out waiting:", msg, ")"); return false; });
/** Open every closed review entry inside a scope (optionally only those holding a given button). */
async function openEntries(scope, hasText) {
  const closed = scope.locator("details.review-action:not([open])", hasText ? { has: pageOf(scope).locator("button", { hasText }) } : {});
  while ((await closed.count()) > 0) await closed.first().locator(":scope > summary").click();
}
async function reviewed(scope, name) {
  await openEntries(scope, name);
  const fs = scope.locator("fieldset.review", { has: pageOf(scope).locator("button", { hasText: name }) }).first();
  for (const cb of await fs.getByRole("checkbox").all()) await cb.check();
  await fs.getByRole("button", { name }).click();
}
const reviewerStep = (page, label) => panel(page, "reviewer").getByRole("navigation", { name: "Reviewer steps" }).getByRole("link", { name: label }).click();
const rcard = (page, label) => panel(page, "reviewer").locator(`article[aria-label^="${label}"]`);
const dest = (page, key) => panel(page, "operations").locator(`section[data-system="${key}"]`);
const stageOf = (loc) => loc.getAttribute("data-stage");
const flashing = (page, id) => panel(page, id).locator("[data-changed]").count();
async function customerSend(page) {
  const c = panel(page, "customer");
  await c.getByRole("link", { name: "Protection options" }).click();
  await c.getByRole("button", { name: "Ask for a break" }).click();
  await c.getByRole("button", { name: "Review your request" }).click();
  await c.getByRole("button", { name: "Send my request" }).click();
}
async function freshObserver(page) {
  await page.goto(`${BASE}#/observe`); await page.waitForSelector("h1");
  await page.waitForSelector("#panel-customer");
}
/** Take responsibility; the shared Core orchestrator prepares proposals automatically, which remain individually approvable. */
async function reviewerApprove(page, ids) {
  const rev = panel(page, "reviewer");
  await reviewerStep(page, "Decision");
  const fs = rev.locator("#responsibility fieldset.review");
  for (const cb of await fs.getByRole("checkbox").all()) await cb.check();
  await fs.getByRole("button", { name: "Take responsibility for this request" }).click();
  for (const [id, label] of ids) await reviewed(rcard(page, id), label);
}
const ACB = ["Account break ACB-1", "Approve: Account break"], MKT = ["Marketing suppression MKT-1", "Approve: Marketing suppression"];

try {
  // ───────── Front door: three entries, the observer view is the primary one
  {
    const ctx = await browser.newContext({ viewport: DESKTOP }); const page = await ctx.newPage(); watch(page);
    console.log("\n[front door]");
    await page.goto(BASE); await page.waitForSelector("h1");
    const order = await page.locator("[data-testid^=experience-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    ok(JSON.stringify(order) === JSON.stringify(["experience-observe", "experience-explore", "experience-reviewer"]), `three entries, with the system-event replay first (${order.join(", ")})`);
    ok((await page.getByTestId("experience-observe").getByRole("link", { name: "Start the fictional system-event replay" }).count()) === 1 && /start here/i.test(await page.getByTestId("experience-observe").innerText()), "the fictional system-event replay is the primary entry");
    ok((await page.getByTestId("experience-observe").getByRole("link", { name: "Or start with a customer-requested break" }).count()) === 1, "the customer-requested route remains a separate entry");
    ok((await page.getByTestId("experience-explore").getByRole("link", { name: "Explore the system" }).count()) === 1 && (await page.getByTestId("experience-reviewer").getByRole("link", { name: "Experience the reviewer role" }).count()) === 1, "Explore the system and Experience the reviewer role remain");
    await axeRun(page, "front door"); await shot(page, "observer-0-front-door");
    await ctx.close();
  }

  // ───────── Main journey: system event first, Core review recommendation, human gate, simulated partial response
  {
    const ctx = await browser.newContext({ viewport: PHONE }); const page = await ctx.newPage(); watch(page);
    console.log("\n[mobile system-event replay] no customer report, no inferred harm, no approval bypass");
    await page.goto(BASE); await page.waitForSelector("h1");
    await page.getByTestId("experience-observe").getByRole("link", { name: "Start the fictional system-event replay" }).click();
    await page.waitForSelector("#panel-customer");
    ok(await page.getByTestId("system-origin").isVisible(), "a labelled synthetic upstream event starts review without a customer report");
    ok((await page.getByTestId("system-origin").innerText()).includes("not interpreted or verified"), "source reason stays uncertain and unscored");
    ok(await noOverflow(page), "system-originated start has no phone-width overflow");

    await page.getByTestId("switch-reviewer").click();
    const rev = panel(page, "reviewer");
    await reviewerStep(page, "Decision");
    const responsibility = rev.locator("#responsibility fieldset.review");
    for (const cb of await responsibility.getByRole("checkbox").all()) await cb.check();
    await responsibility.getByRole("button", { name: "Take responsibility for this request" }).click();
    const recommendation = rev.locator("#recommendation-request-awaiting");
    await recommendation.waitFor({ state: "visible" });
    ok((await recommendation.innerText()).includes("The source asked for a human review"), "the shared Core rule produces an eligible, uncertainty-labelled recommendation after reviewer acceptance");
    await openEntries(recommendation);
    ok((await recommendation.innerText()).includes("not a conclusion about the customer"), "the recommendation does not infer harm");
    await recommendation.getByRole("button", { name: /Propose: Ask the upstream source/ }).click();
    const clarification = rcard(page, "Context clarification request");
    await openEntries(clarification);
    ok(await clarification.getByRole("button", { name: "Put forward for approval" }).isVisible(), "a Core recommendation creates only a proposal");
    ok((await clarification.getByRole("button", { name: /Send to/ }).count()) === 0, "there is no send before submission and fresh approval");
    await clarification.getByRole("button", { name: "Put forward for approval" }).click();
    await reviewed(clarification, "Approve: Context clarification request");
    ok((await clarification.getByRole("button", { name: /Send to/ }).count()) === 1, "approval enables a separate send but does not deliver it");
    await clarification.getByRole("button", { name: /Send to/ }).click();
    await page.waitForFunction(() => document.querySelector('#panel-reviewer article[aria-label^="Context clarification request"]')?.getAttribute("data-stage") === "unresolved", null, { timeout: 6000 });
    ok(await noOverflow(page), "unresolved source response has no phone-width overflow");

    await reviewerStep(page, "Decision");
    await rev.getByRole("button", { name: "Prepare the early-support check-in" }).click();
    const checkin = rcard(page, "In-app message");
    await openEntries(checkin);
    await checkin.getByRole("button", { name: "Put forward for approval" }).click();
    await reviewed(checkin, "Approve: In-app message");
    ok((await checkin.getByRole("button", { name: /Send to/ }).count()) === 1, "optional outreach remains a distinct approval and send");
    await checkin.getByRole("button", { name: /Send to/ }).click();
    await page.waitForFunction(() => document.querySelector('#panel-reviewer article[aria-label^="In-app message"]')?.getAttribute("data-stage") === "applied", null, { timeout: 6000 });
    ok((await checkin.getAttribute("data-stage")) === "applied", "the configured simulated in-app system advances its own receipt, acceptance and execution");
    ok((await checkin.innerText()).includes("Not confirmed"), "execution remains separate from read-back and reviewer confirmation");
    await page.getByTestId("switch-operations").click();
    const inApp = dest(page, "in-app-channel");
    ok((await inApp.locator('[data-testid="p2-system-status"][data-action="early-support-checkin"]').getAttribute("data-stage")) === "applied", "Operations sees reported execution without treating it as verified");
    ok((await dest(page, "upstream-source").locator('[data-testid="p2-system-status"][data-action="context-clarification-request"]').getAttribute("data-stage")) === "unresolved", "the unresolved source remains visible rather than being reported complete");
    await axeRun(page, "mobile system-event replay"); await shot(page, "observer-system-event-phone");
    await ctx.close();
  }

  // ───────── Desktop: one real session, three panels
  {
    const ctx = await browser.newContext({ viewport: DESKTOP }); const page = await ctx.newPage(); watch(page);
    console.log("\n[desktop 1440px] layout and labelling");
    await freshObserver(page);
    ok((await page.locator("h1").count()) === 1 && (await page.locator("h1").innerText()).includes("Demonstration observer view"), "one page heading: the demonstration observer view");
    ok((await page.locator("header .vertical").innerText()).includes("Demonstration observer view"), "the combined display is labelled a demonstration observer view");
    ok((await page.getByTestId("presentation-note").innerText()).includes("presentation, not authentication") && (await page.getByTestId("presentation-note").innerText()).includes("Server-enforced access remains a production requirement"), "it states the layout is presentation and server-enforced access remains a production requirement");
    const boxes = await page.evaluate(() => ["customer", "reviewer", "operations"].map((i) => { const r = document.getElementById(`panel-${i}`).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    ok(boxes.every((b) => b.b <= 900 && b.t >= 0) && boxes[0].r <= boxes[1].l + 1 && boxes[1].r <= boxes[2].l + 1 && Math.abs(boxes[0].t - boxes[2].t) < 2, "all three panels are visible together, side by side, in one row");
    ok((await page.locator("#panel-customer h2").first().innerText()) === "Customer" && (await page.locator("#panel-reviewer h2").first().innerText()) === "Protection reviewer" && (await page.locator("#panel-operations h2").first().innerText()).startsWith("Operations"), "each panel is named for its role");
    {
      const cross = await page.evaluate(() => {
        const other = { customer: /^#\/(reviewer|operator|operations|simulation|guide|learning)/, reviewer: /^#\/(customer|operator|operations|simulation|guide|learning)/, operations: /^#\/(customer|reviewer|operator|operations|simulation|guide|learning)/ };
        // Any "#/route" inside a panel is a page route: a host that intercepts those would take the panel out of the observer view.
        return Object.entries(other).flatMap(([p, re]) => [...document.querySelectorAll(`#panel-${p} a[href]`)].map((a) => a.getAttribute("href")).filter((h) => re.test(h) || h.startsWith("#/")));
      });
      ok(cross.length === 0, `there is no manual role switching: no panel links to another role's screens${cross.length ? " -> " + cross.join(", ") : ""}`);
    }
    ok(!(await page.getByRole("button", { name: /next step|advance|play|continue the story/i }).count()), "there are no story-stage buttons");
    ok(await noOverflow(page), "no horizontal overflow");
    await shot(page, "observer-1-empty-desktop");

    console.log("\n[desktop] 1. the customer submits a request: the reviewer sees it");
    const revText0 = await text(page, "reviewer");
    ok(revText0.includes("Nothing is waiting for you"), "before the customer acts, the reviewer's queue is empty");
    await customerSend(page);
    ok(await until(page, () => document.querySelector("#panel-reviewer [data-testid=request-summary]")?.innerText.includes("REQ-0001"), null, "reviewer sees request"), "the reviewer's panel shows the request with no action taken in it");
    ok((await flashing(page, "reviewer")) > 0, "the reviewer's new item is highlighted");
    ok((await text(page, "customer")).includes("Request received"), "the customer's panel shows their own request received");
    ok((await dest(page, "account-controls").getByTestId("nothing-sent").count()) === 1, "no destination has been sent anything");
    ok(await until(page, () => !document.querySelector("[data-changed]"), null, "highlight fades"), "the highlight fades by itself");
    await shot(page, "observer-2-request-sent-desktop");

    console.log("\n[desktop] 2. the reviewer accepts responsibility and approves individual actions");
    await reviewerStep(page, "Decision");
    const customerBefore = await text(page, "customer");
    await reviewerApprove(page, [ACB]);
    ok(await until(page, () => /A team member is reviewing/.test(document.querySelector("#panel-customer").innerText), null, "customer sees review"), "the customer sees that a team member is reviewing their request (a real update, not a stage button)");
    ok((await text(page, "customer")) !== customerBefore, "the customer's panel changed because the reviewer took responsibility");
    // approval alone: ACB approved, MKT not yet
    ok((await stageOf(rcard(page, ACB[0]))) === "approved", "the reviewer's own action is Approved");
    const acbDest = dest(page, "account-controls");
    ok(await until(page, () => document.querySelector('#panel-operations section[data-system="account-controls"] [data-testid=sent-line]')?.innerText.includes("Approved by the reviewer, not sent"), null, "dest approved not sent"), "the destination shows the instruction as approved, not sent");
    ok((await stageOf(acbDest.locator("article[data-stage]").first())) === "approved", "approval alone did not advance the destination (still Approved)");
    ok((await acbDest.innerText()).includes("Nothing has reached this system"), "the destination states nothing has reached it");
    ok((await dest(page, "marketing-suppression").getByTestId("sent-line").innerText()).includes("Prepared, not yet approved") && (await dest(page, "marketing-suppression").getByTestId("sent-line").getAttribute("data-delivered")) === "false", "an action the reviewer has not approved is shown as prepared, not approved, and not delivered");

    console.log("\n[desktop] 3. sending makes the instruction visible to the destination");
    await (async () => { const c = rcard(page, ACB[0]); await openEntries(c); await c.getByRole("button", { name: /Send to/ }).click(); })();
    ok(await until(page, () => /Received from the reviewer's send/.test(document.querySelector('#panel-operations section[data-system="account-controls"]').innerText), null, "dest received"), "the destination now shows the instruction it was sent");
    ok((await acbDest.innerText()).includes("Prevent new bets and deposits"), "the exact instruction is visible at the destination");
    ok((await stageOf(acbDest.locator("article[data-stage]").first())) === "sent", "but the destination is only at Sent: it has not received or accepted it");
    ok((await acbDest.innerText()).includes("has not said it received it"), "the destination says the other system has not yet received it");
    ok((await flashing(page, "operations")) > 0, "the destination's changed item is highlighted");
    ok(!/authorised and sent/i.test(await text(page, "customer")), "the customer is not told anything by the send");
    await shot(page, "observer-3-sent-desktop");

    console.log("\n[desktop] 4. the simulated destination separately receives, accepts and executes");
    const step = async (label, stage) => {
      await acbDest.getByRole("button", { name: label }).click();
      ok(await until(page, ([s]) => document.querySelector('#panel-operations section[data-system="account-controls"] article[data-stage]').getAttribute("data-stage") === s, [stage], stage), `${label.source ? "step" : label} → the destination is ${stage}`);
      ok((await stageOf(rcard(page, ACB[0]))) === stage, `…and the reviewer's panel shows ${stage} without any action in it`);
    };
    ok((await acbDest.getByRole("group", { name: /Simulated destination controls for Account controls system/ }).count()) === 1, "the simulated destination controls are labelled and sit beside their system");
    await step(/acknowledges receipt/, "acknowledged");
    await step(/accepts responsibility/, "acknowledged");
    await step(/reports the work done/, "applied");
    ok((await stageOf(rcard(page, ACB[0]))) === "applied" && (await rcard(page, ACB[0]).innerText()).includes("Applied"), "the reviewer sees Applied (reported), which is not yet confirmed");
    ok(!/Your account break is confirmed|break is confirmed/i.test(await text(page, "customer")), "the customer has not been told it is confirmed");

    console.log("\n[desktop] 5. verification and an authorised message update the customer");
    await acbDest.getByRole("button", { name: "Run simulated read-back" }).click();
    ok(await until(page, () => !!document.querySelector('#panel-reviewer article[aria-label^="Account break ACB-1"] button') , null, "readback"), "a simulated read-back ran at the destination");
    const rc = rcard(page, ACB[0]); await openEntries(rc);
    await rc.getByRole("button", { name: "Record confirmation" }).click();
    ok((await stageOf(rcard(page, ACB[0]))) === "confirmed", "the reviewer records the confirmation: Confirmed");
    ok(!(await text(page, "customer")).includes("Your account break is confirmed"), "the customer still sees nothing until a person authorises what they are told");
    await reviewed(rcard(page, "Customer notice: account break"), "Approve: Customer notice: account break");
    const cn = rcard(page, "Customer notice: account break"); await cn.getByRole("button", { name: /Send to the customer/ }).click();
    ok(await until(page, () => /account break is confirmed/i.test(document.querySelector("#panel-customer").innerText), null, "customer confirmed"), "the customer's panel now shows the account break confirmed");
    ok((await flashing(page, "customer")) > 0, "the customer's changed item is highlighted");
    ok((await text(page, "customer")).match(/Promotional messages[^\n]*Not confirmed yet|Promotional messages/) !== null, "the customer still sees the other part as not confirmed");
    await shot(page, "observer-4-customer-confirmed-desktop");
    await ctx.close();
  }

  // ───────── Independence, focus, forms, privacy
  {
    const ctx = await browser.newContext({ viewport: DESKTOP }); const page = await ctx.newPage(); watch(page);
    console.log("\n[desktop] independence, focus, forms and boundaries");
    await freshObserver(page);
    await customerSend(page);
    await reviewerApprove(page, [ACB]);
    // independent navigation
    await panel(page, "customer").getByRole("link", { name: /^My updates/ }).click();
    await reviewerStep(page, "Situation");
    await panel(page, "operations").getByRole("link", { name: "Evidence" }).click();
    const nav = await page.evaluate(() => ({ c: document.querySelector("#panel-customer [aria-current=page]")?.textContent.trim(), r: document.querySelector("#panel-reviewer .obs-nav [aria-current=page]")?.textContent.trim(), o: document.querySelector("#panel-operations .obs-nav [aria-current=page]")?.textContent.trim() }));
    ok(nav.c.includes("My updates") && nav.r === "Situation" && nav.o === "Evidence", "each panel keeps its own navigation: My updates | Situation | Evidence");
    ok((await page.evaluate(() => location.hash)) === "#/observe", "panel navigation does not change the page's own address");
    await reviewerStep(page, "Decision"); await panel(page, "operations").getByRole("link", { name: "Systems" }).click();
    // independent scroll
    await panel(page, "reviewer").locator(".obs-scroll").evaluate((e) => { e.scrollTop = 220; });
    await panel(page, "operations").locator(".obs-scroll").evaluate((e) => { e.scrollTop = 120; });
    const sc = async () => page.evaluate(() => ({ r: document.querySelector("#panel-reviewer .obs-scroll").scrollTop, o: document.querySelector("#panel-operations .obs-scroll").scrollTop, c: document.querySelector("#panel-customer .obs-scroll").scrollTop, w: window.scrollY }));
    const s0 = await sc();
    ok(s0.r > 100 && s0.o > 50, "the reviewer and Operations panels scroll on their own");
    // a form half-filled in the reviewer, focus in the customer, then a real change in Operations
    const mc = rcard(page, MKT[0]); await openEntries(mc);
    const boxesEls = mc.locator("fieldset.review input[type=checkbox]");
    await boxesEls.nth(0).check(); await boxesEls.nth(1).check();
    await panel(page, "customer").getByRole("link", { name: "Protection options" }).focus();
    await (async () => { const c = rcard(page, ACB[0]); await openEntries(c); })();
    const focusBefore = await page.evaluate(() => document.activeElement?.textContent?.trim());
    // a real change elsewhere: sending the account break (done by clicking the real button without moving focus)
    await page.evaluate(() => { [...document.querySelectorAll('#panel-reviewer article[aria-label^="Account break ACB-1"] button')].find((b) => /Send to/.test(b.textContent)).click(); });
    ok(await until(page, () => /Received from the reviewer's send/.test(document.querySelector('#panel-operations section[data-system="account-controls"]').innerText), null, "dest received"), "a real change reached another panel");
    ok((await page.evaluate(() => document.activeElement?.textContent?.trim())) === focusBefore, "the change did not move keyboard focus");
    ok((await boxesEls.nth(0).isChecked()) && (await boxesEls.nth(1).isChecked()) && !(await boxesEls.nth(2).isChecked()), "a half-completed approval form in another item kept its ticks");
    const s1 = await sc();
    ok(s1.c === s0.c && s1.w === 0, "no panel and not the page was scrolled by the update");
    ok(Math.abs(s1.o - s0.o) < 400, "each panel kept its own scroll position");
    // select value in the destination controls survives updates
    await dest(page, "marketing-suppression").locator("select").first().selectOption("refuses");
    await page.evaluate(() => { [...document.querySelectorAll('#panel-operations section[data-system="account-controls"] button')].find((b) => /acknowledges receipt/.test(b.textContent)).click(); });
    ok((await dest(page, "marketing-suppression").locator("select").first().inputValue()) === "refuses", "a destination's chosen behaviour is not reset by updates elsewhere");

    // privacy: every panel shows only its own role's information
    const cT = await text(page, "customer"), rT = await text(page, "reviewer"), oT = await text(page, "operations");
    for (const bad of [/ACB-1|MKT-1|CAN-1|CMN-1/, /REQ-0001/, /Protection reviewer/i, /Simulated destination/, /Account controls system/, /kernel/i, /Authorised by/]) ok(!bad.test(cT), `customer panel never shows ${bad}`);
    for (const bad of [/Simulated destination controls/, /Simulate:/, /Run simulated read-back/, /When it is sent a request/]) ok(!bad.test(rT), `reviewer panel never shows ${bad}`);
    for (const bad of [/I would like a rest from betting/, /Updates in the app/, /Customer notice/, /CAN-1|CMN-1/, /Take responsibility/, /Prepared customer message/, /Authority: I hold/]) ok(!bad.test(oT), `Operations panel never shows ${bad}`);
    await axeRun(page, "observer (desktop, mid-journey)"); await shot(page, "observer-5-mid-journey-desktop");
    await page.getByTestId("observer-reset").click();
    ok(await until(page, () => /No updates yet/.test(document.querySelector("#panel-customer").innerText) && /The customer has not sent a request/.test(document.querySelector("#panel-reviewer").innerText), null, "reset"), "Start the session again empties all three panels together, each on the screen it was left on");
    ok((await panel(page, "customer").locator("[aria-current=page]").innerText()).includes("My updates") && (await panel(page, "reviewer").locator(".obs-nav [aria-current=page]").innerText()) === "Decision", "…and each panel keeps its own navigation through the reset");
    ok((await dest(page, "account-controls").getByTestId("nothing-sent").count()) === 1, "…including the destinations");
    await ctx.close();
  }

  // ───────── Partial failure
  {
    const ctx = await browser.newContext({ viewport: DESKTOP }); const page = await ctx.newPage(); watch(page);
    console.log("\n[desktop] 6. partial failure leaves the successful part and the unresolved gap visible");
    await freshObserver(page);
    // the destination's behaviour is set beside the system, before anything is sent
    await dest(page, "marketing-suppression").locator("select").first().selectOption("refuses");
    await customerSend(page);
    await reviewerApprove(page, [ACB, MKT]);
    for (const [id] of [ACB, MKT]) { const c = rcard(page, id); await openEntries(c); await c.getByRole("button", { name: /Send to/ }).click(); }
    ok((await stageOf(rcard(page, ACB[0]))) === "sent", "the account break was sent");
    ok(await until(page, () => document.querySelector('#panel-reviewer article[aria-label^="Marketing suppression MKT-1"]')?.getAttribute("data-stage") === "retry", null, "retry"), "the refused marketing send is 'Retry available, not sent' in the reviewer's panel");
    ok((await stageOf(dest(page, "marketing-suppression").locator("article[data-stage]").first())) === "retry", "…and in the destination's panel");
    { const c = rcard(page, MKT[0]); await openEntries(c); await c.getByRole("button", { name: /Send again/ }).click(); }
    ok(await until(page, () => document.querySelector('#panel-reviewer article[aria-label^="Marketing suppression MKT-1"]')?.getAttribute("data-stage") === "unresolved", null, "unresolved"), "after the permitted attempts the marketing action is Unresolved");
    await panel(page, "operations").getByRole("link", { name: "Still open" }).click();
    ok((await panel(page, "operations").getByTestId("gaps").innerText()).includes("MKT-1"), "Operations lists the marketing gap");
    ok((await flashing(page, "operations")) >= 0, "the open item is visible");
    // the account part completes at its destination, independently
    await panel(page, "operations").getByRole("link", { name: "Systems" }).click();
    const acb = dest(page, "account-controls");
    for (const re of [/acknowledges receipt/, /accepts responsibility/, /reports the work done/]) await acb.getByRole("button", { name: re }).click();
    await acb.getByRole("button", { name: "Run simulated read-back" }).click();
    { const c = rcard(page, ACB[0]); await openEntries(c); await c.getByRole("button", { name: "Record confirmation" }).click(); }
    ok((await stageOf(rcard(page, ACB[0]))) === "confirmed", "the successful part is confirmed");
    ok((await stageOf(rcard(page, MKT[0]))) === "unresolved", "…while the failed part stays unresolved in the reviewer's panel");
    ok((await stageOf(dest(page, "marketing-suppression").locator("article[data-stage]").first())) === "unresolved", "…and at its destination");
    // the reviewer authorises what the customer is told
    await reviewed(rcard(page, "Customer notice: account break"), "Approve: Customer notice: account break");
    { const c = rcard(page, "Customer notice: account break"); await c.getByRole("button", { name: /Send to the customer/ }).click(); }
    const rev = panel(page, "reviewer");
    await reviewerStep(page, "Decision");
    const msgBtns = rev.getByRole("button", { name: "Release this message to the customer" });
    while ((await msgBtns.count()) > 0) { const m = msgBtns.first(); const box = m.locator("xpath=ancestor::section[1]"); await openEntries(box); await m.click(); }
    ok(await until(page, () => /account break is confirmed/i.test(document.querySelector("#panel-customer").innerText), null, "customer account"), "the customer sees the confirmed part");
    const cT = await text(page, "customer");
    ok(/Promotional messages/.test(cT) && !/Promotional messages[^\n]*Confirmed\b/.test(cT.replace(/Not confirmed yet/g, "")), "the customer is not told the failed part is done");
    ok(/not everything is confirmed|Still open|Not confirmed yet/i.test(cT), "the customer sees what is still open");
    await shot(page, "observer-6-partial-failure-desktop");
    await axeRun(page, "observer (partial failure)");
    await ctx.close();
  }

  // ───────── Keyboard
  {
    const ctx = await browser.newContext({ viewport: DESKTOP }); const page = await ctx.newPage(); watch(page);
    console.log("\n[desktop] keyboard access");
    await freshObserver(page);
    await page.evaluate(() => { document.activeElement?.blur(); });
    await page.keyboard.press("Tab");
    ok((await page.evaluate(() => document.activeElement?.className)) === "skip", "the first Tab lands on the skip link");
    const stops = [];
    for (let i = 0; i < 70; i++) { await page.keyboard.press("Tab"); stops.push(await page.evaluate(() => document.activeElement?.closest("[data-panel]")?.getAttribute("data-panel") ?? "chrome")); }
    ok(["customer", "reviewer", "operations"].every((p) => stops.includes(p)), "Tab reaches every panel");
    ok(stops.indexOf("customer") < stops.indexOf("reviewer") && stops.indexOf("reviewer") < stops.indexOf("operations"), "in reading order: customer, reviewer, Operations");
    // each scroll region is focusable and named
    ok((await page.locator(".obs-scroll[role=region][tabindex='0']").count()) === 3, "each panel's scroll region is a focusable, named region");
    // operate the customer flow by keyboard alone
    const opts = panel(page, "customer").getByRole("link", { name: "Protection options" });
    await opts.focus(); await page.keyboard.press("Enter");
    const ask = panel(page, "customer").getByRole("button", { name: "Ask for a break" });
    await ask.focus(); await page.keyboard.press("Enter");
    await panel(page, "customer").getByRole("button", { name: "Review your request" }).focus(); await page.keyboard.press("Enter");
    await panel(page, "customer").getByRole("button", { name: "Send my request" }).focus(); await page.keyboard.press("Enter");
    ok(await until(page, () => document.querySelector("#panel-reviewer [data-testid=request-summary]")?.innerText.includes("REQ-0001"), null, "kb request"), "a request sent from the keyboard reaches the reviewer");
    ok((await page.evaluate(() => document.activeElement?.closest("[data-panel]")?.getAttribute("data-panel"))) === "customer", "keyboard focus stayed in the customer panel while the reviewer's panel updated");
    ok(await until(page, () => /Reviewer panel/.test(document.querySelector("[data-testid=observer-announce]").textContent), null, "announce"), "the update is announced politely, without moving focus");
    await ctx.close();
  }

  // ───────── Tablet: two-panel comparison, indicators for the third
  {
    const ctx = await browser.newContext({ viewport: TABLET }); const page = await ctx.newPage(); watch(page);
    console.log("\n[tablet 820px]");
    await freshObserver(page);
    const vis = () => page.evaluate(() => ["customer", "reviewer", "operations"].filter((i) => !document.getElementById(`panel-${i}`).hidden));
    ok(JSON.stringify(await vis()) === JSON.stringify(["customer", "reviewer"]), "two panels are compared side by side: Customer and Reviewer");
    ok((await page.getByTestId("panel-switch").count()) === 1 && (await page.getByTestId("switch-operations").getAttribute("aria-pressed")) === "false", "the third panel is offered from a switch bar");
    ok(await noOverflow(page), "no horizontal overflow");
    await customerSend(page);
    await reviewerApprove(page, [ACB]);
    { const c = rcard(page, ACB[0]); await openEntries(c); await c.getByRole("button", { name: /Send to/ }).click(); }
    ok(await until(page, () => /new/.test(document.querySelector("[data-testid=switch-unseen-operations]")?.textContent ?? ""), null, "unseen"), "the hidden third panel shows that it has updates");
    const n = await page.getByTestId("switch-unseen-operations").innerText();
    ok(/^\d+ new$/.test(n.trim()), `the indicator counts them (${n.trim()})`);
    await shot(page, "observer-7-tablet-two-panels");
    // hidden panel keeps its own state while away
    await page.getByTestId("switch-operations").click();
    ok(JSON.stringify(await vis()) === JSON.stringify(["operations", "customer"].sort((a, b) => ["customer", "reviewer", "operations"].indexOf(a) - ["customer", "reviewer", "operations"].indexOf(b))) || (await vis()).includes("operations"), "choosing the third panel shows it");
    ok((await vis()).length === 2, "still exactly two panels at a time");
    ok(await until(page, () => !document.querySelector("[data-testid=switch-unseen-operations]"), null, "indicator clears"), "its indicator clears once it is on screen");
    ok((await dest(page, "account-controls").innerText()).includes("Received from the reviewer's send"), "it shows what arrived while it was hidden");
    await shot(page, "observer-8-tablet-switched");
    await axeRun(page, "observer (tablet)");
    await ctx.close();
  }

  // ───────── Phone: one panel, state retained, updates identified
  {
    const ctx = await browser.newContext({ viewport: PHONE }); const page = await ctx.newPage(); watch(page);
    console.log("\n[phone 390px]");
    await freshObserver(page);
    const vis = () => page.evaluate(() => ["customer", "reviewer", "operations"].filter((i) => !document.getElementById(`panel-${i}`).hidden));
    ok(JSON.stringify(await vis()) === JSON.stringify(["customer"]), "one panel at a time, starting with the customer");
    ok((await page.getByTestId("panel-switch").locator("button").count()) === 3, "the three panels are switched from a bar");
    // a half-filled form in the customer panel survives switching away and back
    await panel(page, "customer").getByRole("link", { name: "Protection options" }).click();
    await panel(page, "customer").getByRole("button", { name: "Ask for a break" }).click();
    await panel(page, "customer").locator("label", { hasText: "30 days" }).click();
    await page.getByTestId("switch-reviewer").click();
    ok(JSON.stringify(await vis()) === JSON.stringify(["reviewer"]), "switching shows the reviewer panel");
    await page.getByTestId("switch-customer").click();
    ok(await panel(page, "customer").getByLabel("30 days").isChecked(), "the customer's half-filled form is still there after switching panels");
    await panel(page, "customer").getByRole("button", { name: "Review your request" }).click();
    await panel(page, "customer").getByRole("button", { name: "Send my request" }).click();
    ok(await until(page, () => /new/.test(document.querySelector("[data-testid=switch-unseen-reviewer]")?.textContent ?? ""), null, "unseen reviewer"), "the reviewer's tab says it has an update while the customer panel is showing");
    ok((await page.getByTestId("switch-unseen-reviewer").innerText()).trim().endsWith("new"), "the update is identified on the switch bar");
    await shot(page, "observer-9-phone-customer");
    await page.getByTestId("switch-reviewer").click();
    ok((await panel(page, "reviewer").innerText()).includes("REQ-0001"), "the reviewer's panel already shows the request");
    ok(await until(page, () => !document.querySelector("[data-testid=switch-unseen-reviewer]"), null, "indicator clears"), "its indicator clears once it is shown");
    // scroll retention
    await reviewerStep(page, "Situation");
    await panel(page, "reviewer").locator(".obs-scroll").evaluate((e) => { e.scrollTop = 300; });
    await page.getByTestId("switch-operations").click(); await page.getByTestId("switch-reviewer").click();
    ok((await panel(page, "reviewer").locator(".obs-scroll").evaluate((e) => e.scrollTop)) > 200, "a panel's scroll position is kept while it is hidden");
    ok((await panel(page, "reviewer").locator(".obs-nav [aria-current=page]").innerText()) === "Situation", "and so is its navigation");
    ok(await noOverflow(page), "no horizontal overflow");
    await page.evaluate(() => window.scrollTo(0, 600));
    ok((await page.getByTestId("panel-switch").evaluate((e) => Math.round(e.getBoundingClientRect().top))) <= 1, "the panel switch stays in view while the page scrolls, so updates elsewhere stay identified");
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "observer-10-phone-reviewer");
    await axeRun(page, "observer (phone)");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    ok(await noOverflow(page), "no horizontal scroll at 200% text");
    await ctx.close();
  }

  ok(issues.length === 0, `browser console and page errors are clear${issues.length ? " -> " + issues.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  failures.push(`script error: ${e.stack || e}`);
  console.log("  FAIL script error", e.stack || e);
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAILED` : "\nAll observer-view checks passed.");
process.exit(failures.length ? 1 : 0);
