import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { holderView, loadConfiguration, measures, recipientView, subjectView, type DeploymentConfiguration } from "../index";
import { SPORT_CONFIGURATION } from "../deployments/sport/configuration";
import { CHECKS4, Harness } from "./harness";

/**
 * B8 (contract 1.3 draft, section 8d): `subjectSeesFrom` on an action type. "submission" (default, the 1.2 behaviour): the subject reads the holder's
 * workflow events for an action that concerns them from `action.submitted` on. "release": the subject reads nothing about the action until it is released
 * (`disclosure.made`). It is a disclosure setting, not wording. It narrows what the subject sees; it never widens it, and it never changes what the holder,
 * the recipient or any count sees. Without the field in the schema (1.2) every option-dependent case below fails when the configuration is loaded.
 */
const withOption = (value: unknown): DeploymentConfiguration => {
  const raw = structuredClone(SPORT_CONFIGURATION) as unknown as { actions: Record<string, unknown>[] };
  if (value !== undefined) raw.actions.find((a) => a.id === "parent-guidance")!.subjectSeesFrom = value;
  return loadConfiguration(raw);
};
const GDE = "parent-guidance";
const drive = (config: DeploymentConfiguration, upTo: "submitted" | "approved" | "released" | "withdrawn" | "transferred") => {
  const h = new Harness(config, "member-a", ["member-a", "member-b"]).accepted();
  h.ok({ type: "propose", actionType: GDE }, h.owner);
  const id = h.lastActionId();
  h.ok({ type: "submit", actionId: id }, h.owner);
  if (upTo === "submitted") return { h, id };
  if (upTo === "withdrawn") { h.ok({ type: "withdraw", actionId: id }, h.owner); return { h, id }; }
  h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
  if (upTo === "approved") return { h, id };
  if (upTo === "transferred") {
    h.ok({ type: "routeRequest", to: "member-b", checks: CHECKS4 }, h.owner);
    return { h, id };
  }
  h.ok({ type: "execute", actionId: id }, h.owner);
  return { h, id };
};
const seen = (h: Harness) => subjectView(h.config, h.state, h.evidence);
const parentRecords = (h: Harness, id: string) => h.evidence.filter((e) => e.actionId === id && e.audience.includes("party:parent"));
const holderSig = (h: Harness) => {
  const v = holderView(h.config, h.state, h.evidence, h.facts(), "member-a")!;
  return JSON.stringify({ ev: v.evidence.map((e) => [e.kind, e.text, e.audience.includes("holder")]), actions: v.actions.map((a) => [a.id, a.state]), m: v.assurance.measures.recorded, un: v.assurance.unresolvedResponsibilities });
};

describe("B8: subjectSeesFrom (default unchanged)", () => {
  it("B8-A0 default (1.2): the parent already reads submitted-for-approval and approved for guidance before it is released", () => {
    const { h, id } = drive(withOption(undefined), "approved");
    assert.ok(seen(h).actions.some((a) => a.id === id));
    assert.ok(seen(h).updates.some((u) => /submitted for approval/.test(u)));
    assert.ok(seen(h).updates.some((u) => /approved/.test(u)));
  });
  it("B8-A7 an explicit \"submission\" is byte-identical to the default (no behaviour change for configurations that do not opt in)", () => {
    const a = drive(withOption(undefined), "released").h, b = drive(withOption("submission"), "released").h;
    assert.equal(JSON.stringify(a.evidence.map((e) => [e.kind, e.audience, e.text])), JSON.stringify(b.evidence.map((e) => [e.kind, e.audience, e.text])));
  });
});

describe("B8: subjectSeesFrom \"release\"", () => {
  it("B8-A1 the option is accepted for a type the subject only receives", () => {
    assert.doesNotThrow(() => withOption("release"));
  });
  it("B8-A2 before release the parent sees nothing about the action: no list entry, no update, no evidence record (submitted, approved)", () => {
    for (const stage of ["submitted", "approved"] as const) {
      const { h, id } = drive(withOption("release"), stage);
      assert.ok(!seen(h).actions.some((a) => a.id === id), stage);
      assert.ok(!seen(h).updates.some((u) => u.includes(id)), stage);
      assert.deepEqual(parentRecords(h, id), [], stage);
      assert.deepEqual(recipientView(h.config, h.state, h.evidence, "parent"), [], stage);
    }
  });
  it("B8-A3 from release onward the parent sees the release and what follows, and the earlier workflow records stay hidden", () => {
    const { h, id } = drive(withOption("release"), "released");
    assert.ok(seen(h).actions.some((a) => a.id === id));
    assert.ok(parentRecords(h, id).some((e) => e.kind === "disclosure.made"));
    assert.ok(!parentRecords(h, id).some((e) => ["action.submitted", "approval.recorded"].includes(e.kind)));
    assert.equal(recipientView(h.config, h.state, h.evidence, "parent").length, 1);
  });
  it("B8-A4 withdrawal before release leaves no trace for the parent", () => {
    const { h, id } = drive(withOption("release"), "withdrawn");
    assert.deepEqual(parentRecords(h, id), []);
    assert.ok(!seen(h).actions.some((a) => a.id === id));
    assert.ok(drive(withOption(undefined), "withdrawn").h.evidence.some((e) => e.kind === "action.withdrawn" && e.audience.includes("party:parent")), "default still shows it");
  });
  it("B8-A5 transfer: unsent guidance is withdrawn and held back; the parent sees the transfer of the request but nothing about the guidance (default shows it as withdrawn)", () => {
    const opt = drive(withOption("release"), "transferred");
    assert.ok(opt.h.evidence.some((e) => e.kind === "request.routed" && e.audience.includes("party:parent")), "the transfer itself is still told to the parent");
    assert.ok(!seen(opt.h).actions.some((a) => a.id === opt.id));
    assert.deepEqual(parentRecords(opt.h, opt.id), []);
    const def = drive(withOption(undefined), "transferred");
    assert.ok(seen(def.h).actions.some((a) => a.id === def.id && a.state === "withdrawn"));
  });
  it("B8-A6 nothing the holder, any other recipient or any count sees changes: holder evidence, actions, measures and unresolved responsibilities are identical with and without the option, at every stage", () => {
    for (const stage of ["submitted", "approved", "released", "withdrawn"] as const) {
      assert.equal(holderSig(drive(withOption("release"), stage).h), holderSig(drive(withOption(undefined), stage).h), stage);
    }
    const a = drive(withOption("release"), "released").h, b = drive(withOption(undefined), "released").h;
    assert.deepEqual(measures(a.config, a.state, a.evidence), measures(b.config, b.state, b.evidence));
    // The parent is both the subject and the recipient of guidance, so their recipient view is the subject view: it loses exactly the two pre-release workflow lines and nothing else.
    const pa = recipientView(a.config, a.state, a.evidence, "parent")[0]!, pb = recipientView(b.config, b.state, b.evidence, "parent")[0]!;
    assert.deepEqual(pb.updates.filter((u) => !pa.updates.includes(u)).map((u) => (/submitted for approval/.test(u) ? "submitted" : /approved/.test(u) ? "approved" : "other")), ["submitted", "approved"]);
    assert.deepEqual({ ...pa, updates: [] }, { ...pb, updates: [] });
    // Every other party's view is identical.
    for (const party of ["wellbeing", "support-person", "integrity-review", "operations"]) assert.deepEqual(recipientView(a.config, a.state, a.evidence, party), recipientView(b.config, b.state, b.evidence, party));
  });
  it("B8-A8 the option only ever removes the subject from an audience: for every record the audience with it is a subset of the audience without it", () => {
    const a = drive(withOption("release"), "released").h, b = drive(withOption(undefined), "released").h;
    assert.equal(a.evidence.length, b.evidence.length);
    a.evidence.forEach((e, i) => assert.ok(e.audience.every((x) => b.evidence[i]!.audience.includes(x)), e.kind));
  });
  it("B8-A10 other action types are untouched: a parent-support request (the parent approves it) has identical evidence audiences with and without the option on guidance, at every record", () => {
    const run = (config: DeploymentConfiguration) => {
      const h = new Harness(config, "member-a", ["member-a", "member-b"]).accepted();
      h.ok({ type: "propose", actionType: "parent-support" }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.ok({ type: "execute", actionId: id }, h.owner);
      return h.evidence.filter((e) => e.actionId === id).map((e) => [e.kind, e.audience, e.text]);
    };
    const a = run(withOption("release")), b = run(withOption(undefined));
    assert.deepEqual(a, b);
    assert.ok(a.some(([k, aud]) => k === "action.submitted" && (aud as string[]).includes("party:parent")), "the parent still sees the support request they must approve");
    assert.ok(a.some(([k, aud]) => k === "disclosure.made" && (aud as string[]).includes("party:parent")));
  });
  it("B8-A9 refusals at load: an invalid value; and \"release\" on a type the subject must approve (they could not act on what they cannot see)", () => {
    assert.throws(() => withOption("never"), /Invalid (option|enum value)|expected one of|Expected .submission./i);
    const raw = structuredClone(SPORT_CONFIGURATION) as unknown as { actions: Record<string, unknown>[] };
    raw.actions.find((a) => a.id === "parent-support")!.subjectSeesFrom = "release";
    assert.throws(() => loadConfiguration(raw), /subject approves/i);
  });
});
