/**
 * Browser verification of the role-focused reviewer experience (needs the pre-installed Chromium through Playwright):
 *
 *   pnpm --filter @workspace/jaldo-protection-app run build && pnpm --filter @workspace/jaldo-protection-app run reviewer-check
 *
 * Checks, at 390px and 1280px: the front door offers two separate experiences; the reviewer can follow their own work from the
 * queue to follow-through WITHOUT switching roles (the hash never leaves #/reviewer, and no link to the customer, Operations or
 * Simulation views exists); the presenter panel is a separate, labelled surface and nothing another system does happens because
 * the reviewer approved or sent something; the early-support scenario is offered separately; keyboard operation; axe; no overflow.
 * Writes screenshots when SHOTS_DIR is set.
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
const PORT = 23586;
const BASE = `http://localhost:${PORT}/protection-app/`;
const SHOTS = process.env.SHOTS_DIR ? path.resolve(here, "..", "..", "..", process.env.SHOTS_DIR) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const failures = [];
const ok = (c, m) => { if (!c) { failures.push(m); console.log("  FAIL", m); } else console.log("  ok  ", m); };
const server = spawn("pnpm", ["exec", "vite", "preview", "--config", "vite.config.ts", "--port", String(PORT)], { cwd: path.join(here, ".."), stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
process.on("exit", () => { try { server.kill("SIGTERM"); } catch { /* stopped */ } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 500)); }

const MOBILE = { width: 390, height: 844 }, DESKTOP = { width: 1280, height: 900 };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const issues = [];
const watch = (page) => { page.on("console", (m) => { if (m.type() === "error") issues.push(`console: ${m.text()}`); }); page.on("pageerror", (e) => issues.push(`page error: ${e.message}`)); };
const pageOf = (scope) => (typeof scope.page === "function" ? scope.page() : scope);
const hash = (page) => page.evaluate(() => location.hash);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const click = (scope, name, opts = {}) => scope.getByRole("button", { name, ...opts }).click();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
async function axeRun(page, label) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(bad.length === 0, `axe: no serious/critical violations on ${label}${bad.length ? " -> " + bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].html.slice(0, 90)}`).join(" | ") : ""}`);
}
/** Tick every check in the fieldset holding the button, then press it (as a person must). */
async function reviewed(scope, name) {
  const fs = scope.locator("fieldset.review", { has: pageOf(scope).locator("button", { hasText: name }) }).first();
  for (const cb of await fs.getByRole("checkbox").all()) await cb.check();
  await fs.getByRole("button", { name }).click();
}
async function openEntries(scope, hasText) {
  const closed = scope.locator("details.review-action:not([open])", hasText ? { has: pageOf(scope).locator("button", { hasText }) } : {});
  while ((await closed.count()) > 0) await closed.first().locator(":scope > summary").click();
}
/** The reviewer's own action cards live in main; the presenter panel (an aside) has rows with the same names. */
const card = (page, label) => page.locator(`main article[aria-label^="${label}"]`);
async function presenter(page) {
  const d = page.locator("details#presenter-panel");
  if (!(await d.evaluate((e) => e.open))) await d.locator(":scope > summary").click();
  return page.getByTestId("presenter-panel");
}
const stepNav = (page) => page.getByRole("navigation", { name: "Reviewer workspace" });

try {
  for (const [tag, vp] of [["mobile", MOBILE], ["desktop", DESKTOP]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    watch(page);
    console.log(`\n[${tag} ${vp.width}px]`);

    // ── Front door: two separate experiences
    await page.goto(BASE); await page.waitForSelector("h1");
    ok((await page.locator("h1").innerText()).includes("See Protection coordinate around an event"), "the bare URL is the front door");
    ok((await page.getByTestId("experience-observe").getByRole("link", { name: "Start the fictional system-event replay" }).count()) === 1 && (await page.getByTestId("experience-observe").getByRole("link", { name: "Or start with a customer-requested break" }).count()) === 1, "system-originated and customer-originated journeys remain separate");
    ok((await page.getByTestId("experience-explore").getByRole("link", { name: "Explore the system" }).count()) === 1 && (await page.getByTestId("experience-reviewer").getByRole("link", { name: "Experience the reviewer role" }).count()) === 1, "Explore the system and Experience the reviewer role remain");
    ok((await page.getByTestId("presentation-note").innerText()).includes("Server-enforced access remains a production requirement"), "the front door states navigation is presentation and server-enforced access remains a production requirement");
    ok(await noOverflow(page), "front door: no horizontal overflow");
    await axeRun(page, "front door"); await shot(page, `${tag}-0-front-door`);

    // Explore the system keeps its guided journey and role switching
    await page.getByTestId("experience-explore").getByRole("link", { name: "Explore the system" }).click();
    ok((await hash(page)) === "#/guide" && (await page.locator("h1").innerText()) === "Guided demonstration", "Explore the system opens the guided demonstration");
    ok((await page.locator("nav#primary-nav a[href='#/customer'], nav#primary-nav a[href='#/operations'], nav#primary-nav a[href='#/simulation'], nav#primary-nav a[href='#/learning']").count()) === 4, "Explore keeps role switching, simulation controls and the learning demonstration in its navigation");
    await page.locator("nav#primary-nav a[href='#/start']").evaluate((a) => a.click());
    await page.waitForSelector("[data-testid=experience-reviewer]");

    // ── Reviewer experience
    await page.getByTestId("experience-reviewer").getByRole("link", { name: "Experience the reviewer role" }).click();
    ok((await hash(page)) === "#/reviewer" && (await page.locator("h1").innerText()) === "My work", "Experience the reviewer role opens My work");
    const nav = stepNav(page);
    ok(JSON.stringify(await nav.getByRole("link").evaluateAll((a) => a.map((x) => x.querySelector(".step-label").textContent))) === JSON.stringify(["My work", "Situation", "Decision", "Follow-through"]), "the reviewer navigation is exactly My work, Situation, Decision, Follow-through");
    const exploreLinks = () => page.locator("a[href^='#/customer'], a[href='#/operator'], a[href^='#/operations'], a[href='#/simulation'], a[href='#/guide'], a[href='#/learning'], a[href='#/about']").count();
    ok((await exploreLinks()) === 0, "no link to the customer, Operations, Simulation, guide or learning views anywhere in the reviewer experience");
    ok((await page.getByTestId("presentation-note").innerText()).includes("presentation, not authentication"), "the reviewer notice states navigation is presentation, not authentication");
    ok(await page.getByTestId("example-loader").getByTestId("setup-label").innerText().then((t) => t.startsWith("Demonstration setup")), "the example loader is labelled demonstration setup");
    ok((await page.getByTestId("example-loader").getByRole("button").count()) === 2 && (await page.getByTestId("example-loader").innerText()).includes("separate scenarios"), "the two examples are offered separately, and are not joined");
    ok(await page.locator("details#presenter-panel").evaluate((d) => !d.open), "the presenter panel is collapsed by default");
    ok((await page.locator("details#presenter-panel > summary").innerText()).includes("outside the reviewer's role"), "the presenter panel is labelled as outside the reviewer's role");
    ok(await page.evaluate(() => !document.querySelector("nav.reviewer-nav").contains(document.querySelector("#presenter-panel")) && !document.querySelector("nav.reviewer-nav a[href*='presenter']")), "the presenter panel is not part of the reviewer's navigation");
    ok(await noOverflow(page), "My work (empty): no horizontal overflow");
    await axeRun(page, "My work (empty)"); await shot(page, `${tag}-1-my-work-empty`);

    // Load the customer-requested break example, by keyboard
    const loadBtn = page.getByRole("button", { name: "Load fictional example: customer-requested break" });
    await loadBtn.focus(); await page.keyboard.press("Enter");
    await page.waitForSelector("[data-testid=request-summary]");
    ok((await page.getByTestId("request-summary").innerText()).includes("REQ-0001") && (await page.getByTestId("scenario-note").innerText()).includes("customer-requested break"), "loading the example puts the request in My work (keyboard)");
    ok((await page.getByTestId("next-steps").innerText()).includes("Accept responsibility for the request"), "My work names the pending step");
    ok((await page.getByTestId("decision-counts").innerText()).includes("waiting"), "My work counts what is available, waiting and completed");
    ok(await noOverflow(page), "My work: no horizontal overflow");
    await axeRun(page, "My work (request waiting)"); await shot(page, `${tag}-2-my-work-request`);

    // Situation
    await nav.getByRole("link", { name: "Situation" }).click();
    ok((await page.locator("h1").innerText()) === "Situation" && (await hash(page)) === "#/reviewer/situation", "Situation opens inside the reviewer experience");
    const sit = await page.locator("main").innerText();
    ok(sit.includes("Contact choice now") && sit.includes("Communication permissions") && sit.includes("Nothing is inferred"), "Situation shows contact permissions and what is not inferred");
    ok(await noOverflow(page), "Situation: no horizontal overflow");
    await axeRun(page, "Situation"); await shot(page, `${tag}-3-situation`);

    // Decision: take responsibility with its three individual checks
    await nav.getByRole("link", { name: "Decision" }).click();
    const resp = page.locator("#responsibility");
    ok((await resp.locator("input[type=checkbox]").count()) === 3, "taking responsibility still requires each of its three checks");
    ok(await resp.getByRole("button", { name: "Take responsibility for this request" }).isDisabled(), "it stays disabled until each check is ticked");
    await reviewed(page, "Take responsibility for this request");
    await page.waitForSelector("#decisions-available");
    ok((await page.locator("#decisions-available").innerText()).includes("Account break") || (await page.locator("#decisions-waiting").innerText()).includes("Account break"), "Core prepares the configured plan as proposals when responsibility is accepted");
    // Approve each protection individually
    for (const [id, label] of [["Account break ACB-1", "Approve: Account break"], ["Marketing suppression MKT-1", "Approve: Marketing suppression"]]) {
      const c = card(page, id);
      await openEntries(c);
      const body = await c.locator(".review-body").innerText();
      ok(body.includes("Exactly what would be shared") && body.includes("Policy requirements"), `${id}: the review shows exact sharing and policy requirements before the decision`);
      ok((await c.locator("fieldset.review input[type=checkbox]").count()) === 4, `${id}: four individual checks`);
      await reviewed(c, label);
      await c.getByRole("button", { name: /Send to/ }).click();
    }
    ok(await noOverflow(page), "Decision: no horizontal overflow");
    await axeRun(page, "Decision (authorised and sent)"); await shot(page, `${tag}-4-decision-sent`);
    ok((await page.locator("#decisions-waiting").innerText()).includes("Held until"), "customer-notice approvals are shown as waiting, with their blocker");

    // Follow-through: sent is not another system acting
    await nav.getByRole("link", { name: "Follow-through" }).click();
    const ft = await page.locator("main").innerText();
    ok(ft.includes("Not yet accepted") || ft.includes("has not said it received it"), "after the reviewer sends, follow-through says the other system has not yet received it");
    ok(ft.includes("Approving and sending are your steps. Another system has acted only when its own response is recorded"), "follow-through states that approving or sending is not another system acting");
    ok((await page.getByTestId("unconfirmed-note").innerText()).includes("not confirmed"), "unconfirmed outcomes stay visible");
    ok(await page.locator("#follow-with-others article[data-stage=sent]").count() === 2, "both sent actions are with another system, still at 'Sent'");
    await axeRun(page, "Follow-through (not confirmed)"); await shot(page, `${tag}-5-follow-through`);
    ok((await nav.locator("[data-testid=badge-follow-through]").innerText()).includes("not confirmed"), "the navigation badge shows the count not confirmed");

    // Presenter panel: only here do the other systems respond
    const pp = await presenter(page);
    ok((await pp.innerText()).includes("No other system acts because the reviewer approved or sent something"), "the presenter panel says no other system acts because the reviewer approved or sent");
    ok((await pp.innerText()).includes("This is not the reviewer."), "the presenter panel says it is not the reviewer");
    ok(await pp.getByRole("button", { name: /Simulate: system acknowledges receipt/ }).first().isVisible(), "simulated external responses live in the presenter panel");
    await shot(page, `${tag}-6-presenter-open`);
    for (const id of ["Account break ACB-1", "Marketing suppression MKT-1"]) {
      const row = pp.locator(`article[aria-label^="${id}"]`);
      await openEntries(row);
      for (let i = 0; i < 3; i++) await row.getByRole("button", { name: /Simulate:/ }).click();
      await row.getByRole("button", { name: "Run simulated read-back" }).click();
    }
    await nav.getByRole("link", { name: "Follow-through" }).click();
    ok((await page.locator("main").innerText()).includes("Applied"), "only after the presenter runs the responses does the reviewer's follow-through show them applied");
    // The reviewer records each confirmation themself, then the notices become available
    await nav.getByRole("link", { name: "Decision" }).click();
    for (const id of ["Account break ACB-1", "Marketing suppression MKT-1"]) { const c = card(page, id); await openEntries(c); await c.getByRole("button", { name: "Record confirmation" }).click(); }
    ok((await page.locator("#decisions-done").innerText()).includes("Account break"), "confirmed actions move to Completed");
    for (const [id, label] of [["Customer notice: account break CAN-1", "Approve: Customer notice: account break"], ["Customer notice: marketing CMN-1", "Approve: Customer notice: marketing"]]) {
      const c = card(page, id); await openEntries(c); await reviewed(c, label); await c.getByRole("button", { name: /Send to the customer/ }).click();
    }
    await nav.getByRole("link", { name: "Follow-through" }).click();
    ok((await page.locator("#follow-confirmed").count()) === 1, "follow-through shows what is confirmed");

    // The whole journey stayed inside the reviewer experience
    ok((await hash(page)).startsWith("#/reviewer"), "the reviewer followed their work from queue to follow-through without switching roles");
    ok((await exploreLinks()) === 0, "…and no link to another role's view appeared along the way");
    await shot(page, `${tag}-7-follow-through-done`);

    // Keyboard: the step navigation is reachable and operable
    await page.evaluate(() => window.scrollTo(0, 0));
    await nav.getByRole("link", { name: "Situation" }).focus(); await page.keyboard.press("Enter");
    ok((await page.locator("h1").innerText()) === "Situation" && (await page.evaluate(() => document.activeElement?.id)) === "screen-title", "keyboard: the step navigation works and focus moves to the new screen's title");
    ok(await page.evaluate(() => { const a = document.querySelector(".reviewer-nav a[aria-current=page]"); return !!a; }), "the current step is marked for assistive technology");

    // Early-support: a separate scenario, offered separately
    const pp2 = await presenter(page);
    await pp2.getByRole("button", { name: "Reset the whole simulation" }).click();
    await nav.getByRole("link", { name: "My work" }).click();
    ok((await page.getByTestId("example-loader").count()) === 1, "after a reset, My work offers the examples again");
    await page.getByTestId("example-loader").getByRole("button", { name: "Load fictional example: early-support review" }).click();
    await page.waitForSelector("[data-testid=request-summary]");
    ok((await page.getByTestId("scenario-note").innerText()).includes("separate scenario"), "the early-support example is labelled a separate scenario");
    ok((await page.getByTestId("request-summary").innerText()).includes("Early-support review request"), "it shows the early-support request, not a customer request");
    await nav.getByRole("link", { name: "Situation" }).click();
    const early = await page.locator("main").innerText();
    ok(early.includes("What is not known") && early.includes("Known limits of this source"), "early-support Situation keeps uncertainty and the source's limits visible");
    await axeRun(page, "Situation (early-support)"); await shot(page, `${tag}-8-early-support-situation`);
    await nav.getByRole("link", { name: "Decision" }).click();
    await reviewed(page, "Take responsibility for this request");
    ok((await page.locator("#decisions-available, #decisions-waiting").allInnerTexts()).join(" ").includes("early-support check-in"), "early-support Decision offers its own preparation, with availability stated");
    ok((await hash(page)).startsWith("#/reviewer"), "early-support was also followed without leaving the reviewer experience");
    ok(await noOverflow(page), "early-support Decision: no horizontal overflow");

    // 200% text reflow
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
console.log(failures.length ? `\n${failures.length} FAILED` : "\nAll reviewer-experience checks passed.");
process.exit(failures.length ? 1 : 0);
