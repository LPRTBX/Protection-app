// Mutation checks for the kernel's authority and information-boundary invariants.
// Each mutation deliberately breaks one guarantee; the test suite must fail ("killed").
// Run from lib/jaldo-orchestration: node scripts/mutation-check.mjs
// Files are always restored, including on failure.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const M = [
  ["kernel/authority.ts", `if (WRITE_OPERATIONS.includes(op) && actor.coreRole === "reviewer")`, `if (false)`, "read-only Core role may write"],
  ["kernel/authority.ts", `if (g.revokedAt !== null && new Date(g.revokedAt).getTime() <= now.getTime()) return false;`, ``, "revoked grants still authorise"],
  ["kernel/authority.ts", `if (g.expiresAt !== null && new Date(g.expiresAt).getTime() <= now.getTime()) return false;`, ``, "expired grants still authorise"],
  ["kernel/authority.ts", `if (!sameScope(actor.scope, scope)) return deny(config.version, "Not available in this deployment.");`, ``, "cross-deployment authority"],
  ["kernel/authority.ts", `  if (actor.id === ownerOf(state)) {\n    return { ok: false, reason: "The request holder cannot record`, `  if (false) {\n    return { ok: false, reason: "The request holder cannot record`, "holder attests their own recipient's response"],
  ["kernel/authority.ts", `if (partyOf(config, key).attestation !== "permitted") {`, `if (false) {`, "attestation of the subject's consent"],
  ["kernel/authority.ts", `if (action.approval.configVersion !== state.config.version) {`, `if (false) {`, "stale approval executes"],
  ["kernel/authority.ts", `if (unmet.length > 0) return deny(config.version, \`Waiting for: \${unmet.join(", ")}.\`);`, ``, "prerequisites ignored"],
  ["kernel/authority.ts", `if (viaSystem && !type.standingAuthority) return deny`, `if (false) return deny`, "system executes without standing authority"],
  ["kernel/transitions.ts", `if (!related(config, state, actor) && !reconcilerReach(config, state, actor, envelope.command, facts.now)) return refuse("not_found", "Not found.");`, ``, "strangers learn a coordination exists"],
  ["kernel/transitions.ts", `if (state.processedCommands.includes(envelope.id)) return { ok: true, duplicate: true, state, evidence: [] };\n  if (envelope.expectedSequence`, `if (envelope.expectedSequence`, "duplicate commands re-applied"],
  ["kernel/transitions.ts", `if (state.processedEvents.includes(eventKey(event))) return { ok: true, duplicate: true, state, evidence: [] };`, ``, "duplicate events re-applied"],
  ["kernel/transitions.ts", `if (state.processedEvents.some((k) => k.startsWith(\`\${event.idempotencyKey}=\`))) {`, `if (false) {`, "reused event key with different content accepted"],
  ["kernel/transitions.ts", `if (extra.length > 0) return refuse("event_not_permitted"`, `if (false) return refuse("event_not_permitted"`, "undeclared event context admitted"],
  ["kernel/transitions.ts", `if (classificationRank(event.classification) > classificationRank(def.maxClassification)) {`, `if (false) {`, "over-classified event admitted"],
  ["kernel/transitions.ts", `if (!m.ok) return refuse("not_permitted", \`Only \${subjectOf(config).label} may approve sharing their own details. \${m.reason}\`);`, ``, "anyone approves the subject's disclosure"],
  ["kernel/transitions.ts", `if (type.proposableWhen === "recommendation" && !rec) return refuse`, `if (false) return refuse`, "recovery opened without a recommendation"],
  ["kernel/transitions.ts", `const stale = state.actions.filter((a) => a.state === "approved");`, `const stale: typeof state.actions = [];`, "configuration change keeps old approvals"],
  ["kernel/transitions.ts", `a.sentAt !== null ? a : { ...a, heldBack: true,`, `true ? a : { ...a, heldBack: true,`, "unsent work passes to a new holder"],
  ["kernel/assurance.ts", `.filter((a) => a.recipient === partyKey && a.sentAt !== null && a.disclosure !== null && !a.heldBack)`, `.filter((a) => a.sentAt !== null && a.disclosure !== null && !a.heldBack)`, "recipients see others' work"],
  ["kernel/assurance.ts", `if (ownerOf(s) !== memberId) return null;`, ``, "non-holders see the holder view"],
  ["kernel/assurance.ts", `restriction: GENERIC_RESTRICTION,`, `restriction: actionTypeOf(config, a.typeId).withheld.join("; "),`, "withheld items named to recipients"],
  ["kernel/recognition.ts", `const eligible = pathwayType !== null && recipientEligible(config, pathwayType, facts).ok;`, `const eligible = pathwayType !== null;`, "unavailable recovery recipient offered"],
  ["kernel/predicates.ts", `if (action.state === "accepted" && recipientUnavailable(action, facts)) return "capacity-lost-after-acceptance";`, ``, "interruption after acceptance unrecognised"],
  ["kernel/transitions.ts", `if (a.gap?.kind === "dispatch_uncertain") return refuse("invalid_state", "Delivery is uncertain`, `if (false) return refuse("invalid_state", "Delivery is uncertain`, "uncertain dispatch re-checked and resent"],
  ["kernel/transitions.ts", `state: "unresolved", gap: { kind: "dispatch_uncertain", at }`, `state: "sent", gap: null, sentAt: at`, "uncertain dispatch recorded as sent"],
  ["kernel/transitions.ts", `if (basis.kind === "purpose-grant" && actor.id === owner) {`, `if (false) {`, "request holder verifies their own action's delivery (D4)"],
  ["kernel/transitions.ts", `if (typeof cmd.account !== "string" || cmd.account.trim().length < 10 || cmd.account.length > 2000) {`, `if (false) {`, "reconciliation accepted without the reconciler's account (D4)"],
  ["kernel/transitions.ts", `state.actions.some((a) => a.gap?.kind === "dispatch_uncertain" && !a.heldBack) &&`, ``, "reconciler reaches coordinations with nothing to reconcile"],
  ["contracts/config.ts", `if (disclosesRequest && a.recipient !== subjectKey) {`, `if (false) {`, "standing authority discloses to third parties"],
];

const run = () => {
  try {
    execFileSync("node", ["--import", "tsx/esm", "--test", ...["contracts", "kernel", "reliability", "sport-compat", "enterprise-portability", "orchestrator", "platform"].map((n) => `src/tests/${n}.test.ts`)], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
};

if (run() !== 0) {
  console.error("Baseline suite does not pass; aborting.");
  process.exit(2);
}
let survived = 0;
for (const [file, find, replace, what] of M) {
  const path = join(root, "src", file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(find)) {
    console.log(`MISSING  ${file}: ${what}`);
    survived++;
    continue;
  }
  writeFileSync(path, original.replace(find, replace));
  let code;
  try {
    code = run();
  } finally {
    writeFileSync(path, original);
  }
  const killed = code !== 0;
  if (!killed) survived++;
  console.log(`${killed ? "killed  " : "SURVIVED"} ${what}`);
}
console.log(`\n${M.length - survived}/${M.length} mutations killed`);
process.exit(survived === 0 ? 0 : 1);
