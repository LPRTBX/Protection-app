import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REFERENCE_CONFIGURATIONS } from "../deployments";
import { translate, type Stage5BCommand } from "../deployments/sport/stage5b-adapter";
import { Harness, SCOPE } from "./harness";

/**
 * Sport adapter: the second contact becoming unavailable. In the Stage 5B reducer one `coSim unavailable jordan` mark removes the second contact both as an
 * eligible holder (routing target) and as the review recipient. The adapter used to return only the holder side, so a host applying exactly what it returned
 * created the review as `proposed`, where 5B creates it `unresolved` with a `no_recipient` gap. Regression case; see docs/architecture (contract 1.3 draft, T1).
 */
const config = REFERENCE_CONFIGURATIONS["sport-integrity"];
const make = () => {
  const h = new Harness(config, "morgan", ["morgan", "jordan-member"]);
  const ctx = () => ({ scope: SCOPE, members: { morgan: h.member("morgan"), jordan: h.member("jordan-member") }, liaison: null, routeTarget: "jordan-member" });
  /** Applies every fact key the adapter returns, and nothing else. */
  const sim = (cmd: Stage5BCommand) => {
    const t = translate(cmd, ctx());
    assert.equal(t.kind, "fact");
    if (t.kind !== "fact") return;
    const f = t.fact as Record<string, string>;
    if ("holderUnavailable" in f) h.eligibleHolders = h.eligibleHolders.filter((m) => m !== "jordan-member");
    if ("holderAvailable" in f && !h.eligibleHolders.includes("jordan-member")) h.eligibleHolders = [...h.eligibleHolders, "jordan-member"];
    if ("unavailable" in f) h.capacity(f.unavailable, true);
    if ("available" in f) h.capacity(f.available, false);
  };
  const run = (cmd: Stage5BCommand) => {
    const t = translate(cmd, ctx());
    assert.equal(t.kind, "command");
    if (t.kind === "command") return h.run(t.command, t.actor);
  };
  return { h, sim, run };
};

describe("Sport adapter: second contact unavailable", () => {
  it("returns the holder side and the review-recipient side together", () => {
    const ctx = { scope: SCOPE, members: { morgan: {} as never, jordan: {} as never }, liaison: null };
    assert.deepEqual((translate({ type: "coSim", kind: "unavailable", who: "jordan" }, ctx) as { fact: unknown }).fact, { holderUnavailable: "jordan", unavailable: "integrity-review" });
    assert.deepEqual((translate({ type: "coSim", kind: "restore", who: "jordan" }, ctx) as { fact: unknown }).fact, { holderAvailable: "jordan", available: "integrity-review" });
  });
  it("a review proposed while they are unavailable is unresolved with a no_recipient gap (as in 5B)", () => {
    const { h, sim, run } = make();
    run({ type: "coAccept", by: "morgan", checks: { authority: true, noConflict: true, capacity: true } });
    sim({ type: "coSim", kind: "unavailable", who: "jordan" });
    assert.ok(run({ type: "coPropose", by: "morgan", typeId: "review" })?.ok);
    const a = h.state.actions[0]!;
    assert.equal(a.state, "unresolved");
    assert.equal(a.gap?.kind, "no_recipient");
  });
  it("restoring them and re-checking clears the gap", () => {
    const { h, sim, run } = make();
    run({ type: "coAccept", by: "morgan", checks: { authority: true, noConflict: true, capacity: true } });
    sim({ type: "coSim", kind: "unavailable", who: "jordan" });
    run({ type: "coPropose", by: "morgan", typeId: "review" });
    sim({ type: "coSim", kind: "restore", who: "jordan" });
    assert.ok(run({ type: "coRecheck", by: "morgan", id: "REV-1" })?.ok);
    assert.equal(h.state.actions[0]!.gap, null);
    assert.equal(h.state.actions[0]!.state, "proposed");
  });
});
