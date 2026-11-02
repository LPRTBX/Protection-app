import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "../index";
import { measurePlatformValue, PLATFORM_INTERFACES, COMMAND_TYPES } from "../index";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { translate } from "../deployments/sport/stage5b-adapter";
import { CHECKS4, Harness, SCOPE, shape, supportAccepted } from "./harness";

describe("platform interfaces (seven engines)", () => {
  const exportedFunctions = Object.entries(os).filter(([, v]) => typeof v === "function").map(([k]) => k);
  const owned = PLATFORM_INTERFACES.flatMap((e) => e.operations);

  it("every engine is versioned, industry-neutral and lists only exported operations", () => {
    assert.equal(PLATFORM_INTERFACES.length, 7);
    for (const e of PLATFORM_INTERFACES) {
      assert.match(e.version, /^\d+\.\d+\.\d+$/);
      for (const op of e.operations) assert.equal(typeof (os as Record<string, unknown>)[op], "function", `${e.id}.${op} is not exported`);
      assert.ok(!/\b(sport|athlete|parent|employee|guest|travel|enterprise|safeguard)\b/i.test(JSON.stringify(e.operations.concat(e.contracts))), e.id);
      if (e.status === "partial") assert.ok(e.future.length > 0, `${e.id} is partial but lists no future work`);
    }
  });

  it("every exported kernel operation has exactly one owning engine", () => {
    const ignore = new Set(["engineFor"]);
    for (const fn of exportedFunctions.filter((f) => !ignore.has(f) && !/^[A-Z]/.test(f))) {
      assert.equal(owned.filter((o) => o === fn).length, 1, `${fn} must belong to exactly one engine`);
    }
  });

  it("every command is governed by exactly one engine", () => {
    for (const c of COMMAND_TYPES) assert.equal(PLATFORM_INTERFACES.filter((e) => e.commands.includes(c)).length, 1, c);
  });
});

describe("vertical adapters cannot bypass Core authorisation", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "../deployments");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".ts") ? [join(dir, n)] : []));

  it("deployment modules import only contract types and validation — never kernel transitions or state", () => {
    for (const f of files(src)) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)) {
        assert.ok(!m[1].includes("/kernel"), `${relative(src, f)} imports ${m[1]}`);
      }
    }
  });

  it("an adapter only translates; the kernel still decides, so a translated command by the wrong actor is refused", () => {
    const h = new Harness(REFERENCE_CONFIGURATIONS["sport-integrity"], "morgan", ["morgan", "jordan"]);
    h.accepted;
    const t = translate({ type: "coAccept", by: "jordan", checks: { authority: true, noConflict: true, capacity: true } }, {
      scope: SCOPE,
      members: { morgan: h.member("morgan"), jordan: h.member("jordan") },
      liaison: null,
    });
    assert.equal(t.kind, "command");
    if (t.kind === "command") {
      const r = h.run(t.command, t.actor);
      assert.equal(r.ok, false, "translation grants no authority");
    }
  });
});

describe("platform value measurement contract", () => {
  const config = REFERENCE_CONFIGURATIONS["enterprise-psychosocial"];

  it("separates measured, recorded, self-reported and forecast numbers; no baseline means not measurable", () => {
    const h = new Harness(config).accepted();
    const id = supportAccepted(h);
    const v = measurePlatformValue(h.state, h.evidence, h.now);
    assert.equal(v.measured.basis, "measured");
    assert.ok(v.measured.humanDecisionsRequired >= 2);
    assert.deepEqual(v.measured.timeToAcceptance.map((d) => d.actionId), [id]);
    assert.equal(v.recordedConfirmations.basis, "recorded-confirmation");
    assert.equal(v.selfReported.note, "not independently verified");
    assert.equal(v.forecast.basis, "not-measurable");
    const text = JSON.stringify(v).toLowerCase();
    for (const banned of ["saving", "cost", "prevent", "risk", "harm", "$", "£"]) assert.ok(!text.includes(banned), `value output mentions "${banned}"`);
  });

  it("unresolved responsibility duration runs from interruption until recovery is delivered", () => {
    const h = new Harness(config).accepted();
    const s = shape(config);
    const id = supportAccepted(h);
    h.advanceDays(1);
    h.capacity(s.supportRecipient, true);
    h.advanceDays(1);
    let d = measurePlatformValue(h.state, h.evidence, h.now).measured.unresolvedResponsibilityDuration.find((x) => x.actionId === id)!;
    assert.deepEqual([d.open, d.ms], [true, 86_400_000]);
    const rec = os.recognise(config, h.state, h.facts(), "member-a").active.find((r) => r.actionId === id)!;
    h.ok({ type: "propose", actionType: s.recovery, fromRecommendation: rec.id }, h.owner);
    const rid = h.lastActionId();
    h.ok({ type: "submit", actionId: rid }, h.owner);
    h.ok({ type: "approve", actionId: rid, checks: CHECKS4 }, h.subject);
    h.advanceDays(1);
    h.ok({ type: "execute", actionId: rid }, h.owner);
    d = measurePlatformValue(h.state, h.evidence, h.now).measured.unresolvedResponsibilityDuration.find((x) => x.actionId === id)!;
    assert.deepEqual([d.open, d.ms], [false, 2 * 86_400_000]);
    assert.equal(measurePlatformValue(h.state, h.evidence, h.now).measured.recoveriesDelivered, 1);
  });

  it("an assumed baseline is a synthetic forecast with no time claim; only a measured baseline yields minutes", () => {
    const h = new Harness(config).accepted();
    supportAccepted(h);
    const assumed = measurePlatformValue(h.state, h.evidence, h.now, { source: "Workshop estimate", status: "assumed", manualStepsPerCoordination: 12, minutesPerManualStep: 6 });
    assert.equal(assumed.forecast.basis, "synthetic-forecast");
    assert.ok(assumed.forecast.basis !== "not-measurable" && assumed.forecast.minutesReturned === null);
    const measured = measurePlatformValue(h.state, h.evidence, h.now, { source: "Time-and-motion study, fictional", status: "measured", manualStepsPerCoordination: 12, minutesPerManualStep: 6 });
    assert.equal(measured.forecast.basis, "estimate-against-measured-baseline");
    assert.ok(measured.forecast.basis !== "not-measurable" && typeof measured.forecast.minutesReturned === "number");
  });
});
