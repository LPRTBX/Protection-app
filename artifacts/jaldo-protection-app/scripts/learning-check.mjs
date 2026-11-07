import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const port = Number(process.env.PROTECTION_LEARNING_PORT ?? 23583);
const base = `http://localhost:${port}/protection-app/`;
const builtHtml = readFileSync(path.join(here, "..", "dist", "public", "index.html"), "utf8");
const builtAsset = builtHtml.match(/<script[^>]+src="([^"]+)"/)?.[1];
if (!builtAsset) throw new Error("Build the Protection app before running browser checks.");
const failures = [];
const ok = (condition, description) => {
  if (!condition) failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"} ${description}`);
};
const server = spawn("pnpm", ["exec", "vite", "preview", "--config", "vite.config.ts", "--port", String(port), "--strictPort"], {
  cwd: path.resolve(here, ".."),
  stdio: "ignore",
  env: { ...process.env, PORT: String(port) },
});
process.on("exit", () => { try { server.kill("SIGTERM"); } catch { /* already stopped */ } });

let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Test preview exited; port ${port} may be occupied. Set PROTECTION_LEARNING_PORT to an unused port.`);
    try {
      const response = await fetch(base);
      if (response.ok && (await response.text()).includes(builtAsset)) { ready = true; break; }
    } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Test preview did not serve this build (${builtAsset}); refusing to test another running app.`);
  console.log(`Verified test build: ${builtAsset}`);
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}#/learning`);
  await page.locator("#learning-review").scrollIntoViewIfNeeded();
  await page.waitForSelector("#learning-review");
  const demo = page.locator("#learning-review");

  async function axe(label) {
    await page.evaluate(axeSource);
    const results = await page.evaluate(() => window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    }));
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    ok(serious.length === 0, `${label}: no serious/critical axe violations${serious.length ? ` (${serious.map((v) => v.id).join(", ")})` : ""}`);
  }

  async function noOverflow(label) {
    const { width, offenders, scrollRegions, layoutOverflows, metrics } = await page.evaluate(() => {
      const width = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const offenders = width > 0
        ? [...document.querySelectorAll("body *")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { tag: node.tagName.toLowerCase(), cls: typeof node.className === "string" ? node.className : "", text: (node.textContent ?? "").trim().slice(0, 42), right: Math.round(rect.right), scroll: node.scrollWidth, inTableWrap: Boolean(node.closest(".table-wrap")) };
        }).filter((node) => node.right > innerWidth + 1 && !node.inTableWrap).sort((a, b) => b.right - a.right).slice(0, 12)
        : [];
      const scrollRegions = width > 0
        ? [...document.querySelectorAll(".table-wrap")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: node.scrollWidth, overflowX: getComputedStyle(node).overflowX };
        })
        : [];
      const layoutOverflows = width > 0
        ? [...document.querySelectorAll("body *")].map((node) => {
          const style = getComputedStyle(node);
          return { tag: node.tagName.toLowerCase(), cls: typeof node.className === "string" ? node.className : "", text: (node.textContent ?? "").trim().slice(0, 36), client: node.clientWidth, scroll: node.scrollWidth, overflowX: style.overflowX, inTableWrap: Boolean(node.closest(".table-wrap")) };
        }).filter((node) => node.scroll > node.client + 1 && node.overflowX === "visible" && !node.inTableWrap).slice(0, 10)
        : [];
      const metrics = {
        innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyRight: Math.round(document.body.getBoundingClientRect().right),
        htmlRight: Math.round(document.documentElement.getBoundingClientRect().right),
        zoom: getComputedStyle(document.documentElement).zoom,
      };
      return { width, offenders, scrollRegions, layoutOverflows, metrics };
    });
    ok(width <= 0, `${label}: no page-level horizontal overflow (measured ${width}px)`);
    if (offenders.length || width > 0) console.log("  overflow sources:", JSON.stringify(offenders), "regions:", JSON.stringify(scrollRegions), "layout:", JSON.stringify(layoutOverflows), "metrics:", JSON.stringify(metrics));
  }

  await noOverflow("390px Start here");
  await axe("390px Start here, internal learning view");

  const customerToggle = demo.getByRole("radio", { name: /Customer summary preview/ });
  await customerToggle.focus();
  await page.keyboard.press("Space");
  const customerPreview = await demo.locator(".lr-customer-preview").innerText();
  ok(customerPreview.includes("No customer summary is shown"), "customer preview is empty before a fictional run");
  ok(!/policy V|reviewer approval|alert rationale|receiving-system evidence/i.test(customerPreview), "customer preview omits restricted policy and review details");
  await axe("390px customer summary preview");
  const internalToggle = demo.getByRole("radio", { name: /Operator learning demonstration/ });
  await internalToggle.focus();
  await page.keyboard.press("Space");

  const firstRun = demo.getByRole("button", { name: "Run first V1 occurrence" });
  await firstRun.focus();
  await page.keyboard.press("Enter");
  ok((await demo.locator(".lr-history-item").count()) === 1, "first fictional occurrence creates one V1 history record");
  ok((await demo.locator(".lr-history-item").first().innerText()).includes("review at 11:20"), "before learning, V1 retains the batch-review time");
  ok(await demo.getByText(/No action or acknowledgement exists until a reviewer separately approves/).isVisible(), "a policy replay alone does not create a marketing request");

  await demo.getByRole("button", { name: "Propose V2 after first V1 run" }).click();
  await demo.getByRole("button", { name: "Test proposal as dry run" }).click();
  ok((await demo.locator(".lr-history-item").count()) === 1, "dry run adds no occurrence and changes no historical V1 result");
  ok((await demo.locator(".lr-grid").first().innerText()).includes("Policy V1"), "dry run leaves V1 active before human approval");
  const comparison = await demo.getByText(/Review opens/).innerText();
  ok(comparison.includes("35 simulated minutes earlier") && comparison.includes("V1 3, V2 1"), "dry run shows the helper-derived review interval and scripted prompt counts");

  const approvalChecks = demo.locator("fieldset.lr-checks").first().getByRole("checkbox");
  for (const checkbox of await approvalChecks.all()) {
    await checkbox.focus();
    await page.keyboard.press("Space");
  }
  const approve = demo.getByRole("button", { name: "Record human reviewer approval" });
  await approve.focus();
  await page.keyboard.press("Enter");
  ok(await demo.getByText(/Approved, not yet active/).isVisible(), "explicit fictional reviewer approval is recorded before activation");
  await demo.getByRole("button", { name: "Activate V2 for simulation only" }).click();
  await demo.getByRole("button", { name: "Attempt duplicate activation" }).click();
  ok(await demo.getByText(/Second activation rejected/).isVisible(), "duplicate V2 activation is refused");
  ok((await demo.locator(".lr-grid").first().innerText()).includes("Policy V2"), "V2 is active only after approval and a separate activation");

  await demo.getByRole("button", { name: "Replay fixed sequence with V2" }).click();
  ok((await demo.locator(".lr-history-item").count()) === 2, "approved V2 replay appends a second occurrence");
  ok((await demo.locator(".lr-history-item").nth(1).innerText()).includes("review at 10:45"), "V2 review opens at final context availability, 35 minutes before V1");
  ok(await demo.getByText(/Run 2: 1 scripted repeat prompt/).isVisible(), "V2's authorised-summary replay shows one scripted repeat prompt");
  ok(await demo.getByText(/No action or acknowledgement exists until a reviewer separately approves/).isVisible(), "V2 policy activation does not itself authorise a marketing action");
  await axe("390px after V2 replay, before action approval");

  const actionApproval = demo.locator("fieldset.lr-checks").nth(1).getByRole("checkbox");
  await actionApproval.focus();
  await page.keyboard.press("Space");
  await demo.getByRole("button", { name: "Approve and record the simulated request" }).click();
  ok(await demo.getByText(/Unresolved · no receiving-system evidence recorded/).isVisible(), "marketing acknowledgement remains unresolved before evidence");
  ok(await demo.getByText(/Fallback assignment:/).isVisible(), "unacknowledged request is assigned to a fictional accountable fallback");
  await demo.getByRole("radio", { name: "Still unknown / inconclusive" }).check();
  await demo.getByRole("button", { name: "Manually record new receiving-system evidence" }).click();
  ok(await demo.getByText(/Still unresolved: the human record is unknown/).isVisible(), "unknown evidence leaves the acknowledgement unresolved");
  await demo.getByRole("radio", { name: "Request present in receiving-system record" }).check();
  await demo.getByRole("button", { name: "Manually record new receiving-system evidence" }).click();
  const evidenceHistory = await demo.locator(".lr-evidence-history").innerText();
  ok(evidenceHistory.includes("Finding 1") && evidenceHistory.includes("Finding 2"), "later receiving-system evidence appends without rewriting the earlier unknown finding");
  await demo.getByRole("button", { name: "Attempt duplicate action replay" }).click();
  ok(await demo.getByText(/Duplicate action rejected/).isVisible(), "duplicate simulated marketing action is refused");
  await demo.getByRole("button", { name: "Attempt duplicate event\/action replay" }).click();
  ok((await demo.locator(".lr-history-item").count()) === 2, "duplicate event replay does not duplicate the run or its actions");

  await demo.getByRole("radio", { name: /Withdraw the proposal/ }).check();
  await demo.getByRole("button", { name: "Record selected human alternative" }).click();
  ok(await demo.getByText(/withdraw for later human review|withdraw proposal/).count().then((count) => count > 0), "unnecessary-alert feedback records a human withdrawal option without activation");
  ok((await demo.locator(".lr-grid").first().innerText()).includes("Policy V2"), "alert feedback does not silently change the active policy");

  await demo.getByRole("button", { name: "Rollback future runs to V1" }).click();
  ok(await demo.getByText(/V1 is active for future runs/).isVisible(), "rollback restores V1 for new simulation runs");
  await demo.getByRole("button", { name: "Replay fixed sequence with V1" }).click();
  ok((await demo.locator(".lr-history-item").count()) === 3, "post-rollback V1 replay is a new third history record");
  ok(await demo.getByText(/Run 3: 3 scripted repeat prompts/).isVisible(), "rollback replay restores V1's three scripted repeat prompts for future runs");
  const historyText = await demo.locator(".lr-history").innerText();
  ok(historyText.includes("Run 1") && historyText.includes("Policy V1") && historyText.includes("Run 2") && historyText.includes("Policy V2") && historyText.includes("Run 3") && historyText.includes("Policy V1"), "rollback preserves prior V1 and V2 evidence without retroactive rewriting");
  ok(await demo.getByText(/No action or acknowledgement exists until a reviewer separately approves/).isVisible(), "post-rollback V1 still requires separate action approval");

  await demo.getByRole("radio", { name: /Customer summary preview/ }).check();
  const finalCustomerPreview = await demo.locator(".lr-customer-preview").innerText();
  ok(finalCustomerPreview.includes("You asked to speak with Support"), "customer preview shows only the authorised summary after a run");
  ok(!/policy V|reviewer approval|alert rationale|receiving-system evidence/i.test(finalCustomerPreview), "customer projection continues to exclude restricted learning and acknowledgement details");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("radio", { name: /Operator learning demonstration/ }).check();
  await noOverflow("1280px desktop");
  await axe("1280px desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await noOverflow("390px at 200% zoom");
  await axe("390px at 200% zoom");
  ok(errors.length === 0, `browser console and page have no errors${errors.length ? ` (${errors.join(" | ")})` : ""}`);
} catch (error) {
  failures.push(error.stack ?? String(error));
  console.error(error);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error(`Learning browser check failed: ${failures.length} issue(s)`);
  process.exitCode = 1;
} else {
  console.log("Learning browser check passed.");
}
