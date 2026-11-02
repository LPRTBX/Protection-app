// Opt-in differential check (not in CI): the Stage 5B reference reducer at 94b8567
// versus the shared kernel driven through the Sport compatibility adapter, step by step.
const SP = `${process.env.SPORT_REFERENCE_DIR ?? ""}/src`;
if (!process.env.SPORT_REFERENCE_DIR) { console.error("Set SPORT_REFERENCE_DIR to an unmodified checkout of LPRTBX/JALDO-Sports-Integrity at 94b8567 (with its dependencies installed)."); process.exit(2); }
const K = new URL("../src", import.meta.url).pathname;
const kit = await import(`${SP}/state/coordTestkit.ts`);
const sel = await import(`${SP}/state/coordSelectors.ts`);
const rec5b = await import(`${SP}/state/coordRecommend.ts`);
const kernel = await import(`${K}/index.ts`);
const { REFERENCE_CONFIGURATIONS } = await import(`${K}/deployments/index.ts`);
const { translate, toStage5BRecommendationId } = await import(`${K}/deployments/sport/stage5b-adapter.ts`);
const { Harness, SCOPE } = await import(`${K}/tests/harness.ts`);

const config = REFERENCE_CONFIGURATIONS["sport-integrity"];
const A = { recipient: true, purpose: true, fields: true, authority: true };
const S = { scope: true, conflict: true, capacity: true };
const P = { k: "role", id: "family" };

const ref = kit.ask();
const h = new Harness(config, "morgan", ["morgan", "jordan-member"]);
const ctx = () => ({ scope: SCOPE, members: { morgan: h.member("morgan"), jordan: h.member("jordan-member") }, liaison: (key: string) => h.liaison("liaison", key), routeTarget: "jordan-member" });

const script: any[] = [
  { type: "coAccept", by: "morgan", checks: kit.ALL },
  { type: "coSend", by: "morgan", id: "GDE-1" }, // refused in both: nothing proposed
  { type: "coPropose", by: "morgan", typeId: "parent-guidance", from: "request-awaiting" },
  { type: "coSubmit", by: "morgan", id: "GDE-1" },
  { type: "coApprove", actor: { k: "staff", id: "morgan" }, id: "GDE-1", checks: A },
  { type: "coSend", by: "morgan", id: "GDE-1" },
  { type: "coPropose", by: "morgan", typeId: "parent-support" },
  { type: "coSubmit", by: "morgan", id: "SUP-1" },
  { type: "coApprove", actor: { k: "staff", id: "morgan" }, id: "SUP-1", checks: A }, // refused in both: only the parent approves
  { type: "coApprove", actor: P, id: "SUP-1", checks: A },
  { type: "coSend", by: "morgan", id: "SUP-1" },
  { type: "coSend", by: "morgan", id: "SUP-1" }, // repeat: refused in both
  { type: "coReceive", actor: { k: "provider", id: "wellbeing" }, id: "SUP-1" },
  { type: "coRespond", actor: { k: "provider", id: "wellbeing" }, id: "SUP-1", answer: "accept", checks: { ...S, noReask: true } },
  { type: "coSim", kind: "unavailable", who: "wellbeing" },
  { type: "coComplete", actor: { k: "provider", id: "wellbeing" }, id: "SUP-1" }, // refused in both: cannot act
  { type: "coPropose", by: "morgan", typeId: "support-recovery" }, // refused in both: recommendation-only
  { type: "coPropose", by: "morgan", typeId: "support-recovery", from: "capacity-accepted:SUP-1" },
  { type: "coSubmit", by: "morgan", id: "OPT-1" },
  { type: "coSend", by: "morgan", id: "OPT-1" }, // refused in both: not approved
  { type: "coApprove", actor: P, id: "OPT-1", checks: A },
  { type: "coSend", by: "morgan", id: "OPT-1" },
  { type: "coReceive", actor: { k: "provider", id: "supporter" }, id: "OPT-1" },
  { type: "coRespond", actor: { k: "provider", id: "supporter" }, id: "OPT-1", answer: "accept", checks: S },
  { type: "coComplete", actor: { k: "provider", id: "supporter" }, id: "OPT-1" },
  { type: "coConfirm", actor: { k: "staff", id: "morgan" }, id: "OPT-1" }, // refused in both: the parent confirms
  { type: "coConfirm", actor: P, id: "OPT-1" },
  { type: "coPropose", by: "morgan", typeId: "ops-instruction" },
  { type: "coSubmit", by: "morgan", id: "OPS-1" },
  { type: "coApprove", actor: { k: "staff", id: "morgan" }, id: "OPS-1", checks: A },
  { type: "coSend", by: "morgan", id: "OPS-1" },
  { type: "coAdvance" },
  { type: "coAdvance" },
];

const FT: Record<string, string> = { "accepted-lost": "accepted-lost", recovery: "recovery", confirmed: "confirmed" };
let mismatches = 0;
for (const [i, cmd] of script.entries()) {
  const refOk = ref.dispatch(cmd) !== false;
  let kOk = true;
  const t = translate(cmd, ctx());
  if (t.kind === "command") kOk = h.run(t.command, t.actor).ok;
  else if (t.kind === "fact" && "advanceDays" in t.fact) { h.advanceDays(1); const c = kernel.runAnticipatoryCycle(config, h.state, h.facts(), `c${i}`); h.state = c.state; h.evidence.push(...c.evidence); }
  else if (t.kind === "fact") {
    if ("unavailable" in t.fact) h.capacity(t.fact.unavailable, true);

  }
  const rs = ref.getState();
  const refActions = Object.fromEntries(rs.coord.actions.map((a: any) => [a.id, a.state]));
  const kActions = Object.fromEntries(h.state.actions.map((a: any) => [a.id, a.state]));
  const refRecs = rec5b.coRecommendations(rs.coord, "morgan").active.map((r: any) => r.id).sort();
  const kRecs = kernel.recognise(config, h.state, h.facts(), "morgan").active.map((r: any) => toStage5BRecommendationId(r.id)).sort();
  const refFt = sel.coFollowThrough(rs)?.state ?? "none";
  const kFt = kernel.followThrough(config, h.state, h.facts())[0].state;
  const same = refOk === kOk && JSON.stringify(refActions) === JSON.stringify(kActions) && JSON.stringify(refRecs) === JSON.stringify(kRecs) && (FT[refFt] ? FT[refFt] === kFt : true);
  if (!same) mismatches++;
  console.log(`${String(i + 1).padStart(2)} ${same ? "same" : "DIFF"} ${cmd.type.padEnd(16)} ok=${refOk}/${kOk} recs=${JSON.stringify(refRecs)}${JSON.stringify(refRecs) === JSON.stringify(kRecs) ? "" : " vs " + JSON.stringify(kRecs)} follow=${refFt}/${kFt}${JSON.stringify(refActions) === JSON.stringify(kActions) ? "" : `\n     ref=${JSON.stringify(refActions)}\n     ker=${JSON.stringify(kActions)}`}`);
}
const refChases = sel.coMeasures(ref.getState());
console.log(`\nsteps=${script.length} mismatches=${mismatches}`);
console.log(`5B potential chases: ${JSON.stringify(refChases).match(/"potentialChases":(\d+)/)?.[1]}  kernel: ${kernel.measures(config, h.state, h.evidence).illustrative.potentialManualChases}`);
process.exit(mismatches === 0 ? 0 : 1);
