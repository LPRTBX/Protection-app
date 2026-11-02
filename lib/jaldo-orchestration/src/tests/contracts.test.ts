import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { admitEvent, ConfigurationValidationError, loadConfiguration } from "../index";
import { ENTERPRISE_CONFIGURATION, SPORT_CONFIGURATION } from "../deployments";
import { Harness } from "./harness";

const clone = <T>(x: T): any => JSON.parse(JSON.stringify(x));
const rejects = (mutate: (p: any) => void, pattern: RegExp, base: unknown = SPORT_CONFIGURATION) => {
  const p = clone(base);
  mutate(p);
  assert.throws(() => loadConfiguration(p), (e: unknown) => e instanceof ConfigurationValidationError && pattern.test(e.message));
};

describe("deployment configuration contract", () => {
  it("loads both reference configurations", () => {
    assert.equal(loadConfiguration(SPORT_CONFIGURATION).vertical, "sport");
    assert.equal(loadConfiguration(ENTERPRISE_CONFIGURATION).vertical, "enterprise");
  });
  it("refuses another contract major", () => rejects((p) => (p.contract = "2"), /contract major 2/));
  it("refuses unknown keys (strict), e.g. an attempt to switch on autonomous decisions", () => rejects((p) => (p.autoDecide = true), /Unrecognized key/));
  it("refuses an unknown recipient", () => rejects((p) => (p.actions[0].recipient = "nobody"), /unknown recipient/));
  it("refuses an unknown policy", () => rejects((p) => (p.actions[0].policy = "nope"), /unknown policy/));
  it("refuses a field reading an unknown request field", () => rejects((p) => (p.actions[1].fields[0].source = { requestField: "missing" }), /unknown request field/));
  it("refuses duplicate reference prefixes", () => rejects((p) => (p.actions[1].ref = p.actions[0].ref), /duplicate action ref/));
  it("refuses more than one subject", () => rejects((p) => (p.parties[1].kind = "subject"), /exactly one party must be the subject/));
  it("refuses a subject approving an action addressed to themselves", () => rejects((p) => (p.actions[0].approver = "subject"), /addressed to themselves/));
  it("refuses standing authority that would disclose request fields to a third party", () =>
    rejects((p) => (p.actions.find((a: any) => a.id === "review").standingAuthority = true), /cannot disclose request fields to anyone but the subject/));
  it("refuses standing authority in place of the subject's own approval", () =>
    rejects((p) => (p.actions.find((a: any) => a.id === "parent-support").standingAuthority = true), /cannot replace the subject's own approval/));
  it("refuses standing authority on a recovery (always needs fresh human authority)", () =>
    rejects((p) => {
      p.actions[2].standingAuthority = true;
      p.actions[2].fields = [{ id: "x", label: "X", source: { fixed: "Fixed" } }];
      p.actions[2].approver = "holder";
    }, /recovery always needs fresh human authority/));
  it("refuses prerequisite cycles", () =>
    rejects((p) => {
      p.actions[0].prerequisites = [{ actionType: p.actions[1].id, state: "accepted" }];
      p.actions[1].prerequisites = [{ actionType: p.actions[0].id, state: "accepted" }];
    }, /cycle/));
  it("refuses a recovery rule without no-pathway wording", () => rejects((p) => delete p.recognition.wording["capacity-lost-after-acceptance"].noPathway, /noPathway/));
  it("refuses a recommendation-only action nothing can open", () => rejects((p) => (p.recognition.recovery = []), /recommendation-only/));
  it("refuses a capacity event that could carry personal data", () => rejects((p) => (p.events[1].maxClassification = "personal"), /must not carry personal data/));
  it("refuses a request event that cannot carry every request field", () => rejects((p) => (p.events[0].context = ["who"]), /cannot carry request field/));
  it("refuses a communication with an unsupported trigger", () => rejects((p) => (p.communications[0].trigger.evidence = "approval.recorded"), /unsupported trigger/));
  it("refuses a configuration where no role may hold a request", () => rejects((p) => p.roles.forEach((r: any) => (r.operations = r.operations.filter((o: string) => o !== "hold-request"))), /no role may hold/));
});

describe("event envelope contract (deny by default)", () => {
  const h = new Harness(loadConfiguration(SPORT_CONFIGURATION));
  const ok = h.requestEvent();
  it("admits a permitted event", () => assert.ok(admitEvent(h.config, ok).ok));
  it("refuses an unconfigured event type", () => assert.equal(admitEvent(h.config, { ...ok, type: "other.event" }).ok, false));
  it("refuses a different purpose", () => assert.equal(admitEvent(h.config, { ...ok, purpose: "marketing" }).ok, false));
  it("refuses a more sensitive classification than permitted", () => assert.equal(admitEvent(h.config, { ...ok, classification: "sensitive" }).ok, false));
  it("refuses context keys the event type does not permit, without echoing them", () => {
    const r = admitEvent(h.config, { ...ok, context: { ...ok.context, dateOfBirth: "2001-01-01" } });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && !r.message.includes("dateOfBirth") && !r.message.includes("2001"));
  });
  it("refuses an envelope without an idempotency key", () => {
    const { idempotencyKey: _k, ...rest } = ok;
    assert.equal(admitEvent(h.config, rest).ok, false);
  });
});

describe("dependency boundary", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });
  const kernelFiles = [...files(join(src, "contracts")), ...files(join(src, "kernel")), join(src, "index.ts"), join(src, "version.ts")];

  it("kernel and contracts never import a deployment, framework, database or UI module", () => {
    for (const f of kernelFiles) {
      const imports = [...readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const i of imports) {
        assert.ok(i === "zod" || i.startsWith("."), `${relative(src, f)} imports external module ${i}`);
        assert.ok(!i.includes("deployments"), `${relative(src, f)} imports a deployment module`);
      }
    }
  });

  it("kernel and contracts name no industry, role or service", () => {
    const words = /\b(parent|carer|athlete|coach|safeguard\w*|integrity|employee|manager|EAP|guest|customer|gambling|sport|enterprise|travel)\b/i;
    for (const f of kernelFiles) {
      const body = readFileSync(f, "utf8");
      assert.ok(!words.test(body), `${relative(src, f)} names an industry-specific term: ${body.match(words)?.[0]}`);
    }
  });

  it("nothing in the package imports express, pg, drizzle, react or clerk", () => {
    for (const f of files(src)) {
      assert.ok(!/from\s+"(express|pg|drizzle-orm[^"]*|react[^"]*|@clerk\/[^"]+|@workspace\/db)"/.test(readFileSync(f, "utf8")), relative(src, f));
    }
  });
});
