/**
 * Mutation check for the P2 command-boundary guards (test tooling only; changes no app behaviour).
 *
 *   pnpm --filter @workspace/jaldo-protection-app run mutation
 *
 * For each mutation: confirm the suite passes unmutated, apply ONE source mutation to src/sim/session.ts, run the early-support tests,
 * require that specific named tests FAIL (and that tests which must not depend on the mutated guard still PASS), then restore the
 * file byte for byte and verify it. Exits non-zero if a mutation survives (the tests did not notice) or the file is not restored.
 * Not part of CI: it rewrites a source file temporarily, so it is run deliberately.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(root, "src/sim/session.ts");
const TESTS = "src/tests/early-support.test.ts";
const original = readFileSync(FILE, "utf8");
const sha = (t) => createHash("sha256").update(t).digest("hex");
const originalSha = sha(original);

const run = () => {
  const r = spawnSync("node", ["--import", "tsx/esm", "--test", "--test-reporter=tap", TESTS], { cwd: root, encoding: "utf8" });
  const out = r.stdout + r.stderr;
  const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  const passed = [...out.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { status: r.status, failed, passed };
};

const GUARD_CALL = "const why = this.checkinBlockers();";
const mutations = [
  {
    name: "M1: post-proposal CONTEXT guard disabled (permission guard and the propose-time context guard kept)",
    from: GUARD_CALL,
    to: 'const why = this.checkinBlockers().filter((x) => command.type === "propose" || x.code !== "context_not_current");',
    mustFail: [/^submit: stale context is refused/, /^submit: missing context is refused/, /^approve: stale context is refused/, /^approve: missing context is refused/, /^send: stale context is refused/, /^send: missing context is refused/, /^approval history is preserved/],
    mustStillPass: [/^submit: with current context the command succeeds/, /^approve: with current context the command succeeds/, /^send: with current context the command succeeds/, /^p2-missing: the check-in cannot be proposed/, /^p2-stale: the check-in cannot be proposed/],
  },
  {
    name: "M2: the whole post-proposal guard disabled (context and permission)",
    from: GUARD_CALL,
    to: 'const why = command.type === "propose" ? this.checkinBlockers() : [];',
    mustFail: [/^submit: stale context is refused/, /^approve: missing context is refused/, /^send: stale context is refused/, /^withdrawn permission also stops submit and approve/],
    mustStillPass: [/^submit: with current context the command succeeds/, /^send: with current context the command succeeds/],
  },
  {
    name: "M3: the context blocker removed everywhere (propose included)",
    from: 'if (ctx !== "current") out.push(',
    to: 'if (false as boolean) out.push(',
    mustFail: [/^submit: stale context is refused/, /^send: missing context is refused/, /the check-in cannot be proposed, submitted, approved or sent/],
    mustStillPass: [/^submit: with current context the command succeeds/, /^send: with current context the command succeeds/],
  },
];

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`); };

const base = run();
say(base.status === 0 && base.failed.length === 0, `baseline: unmutated early-support suite passes (${base.passed.length} tests)`);

try {
  for (const m of mutations) {
    console.log(`\n${m.name}`);
    if (original.split(m.from).length !== 2) { say(false, `the mutation target occurs exactly once in session.ts (found ${original.split(m.from).length - 1})`); continue; }
    writeFileSync(FILE, original.replace(m.from, m.to));
    const r = run();
    say(r.status !== 0, `the suite FAILS under the mutation (${r.failed.length} failing tests)`);
    for (const re of m.mustFail) say(r.failed.some((n) => re.test(n)), `caught: ${re}`);
    for (const re of m.mustStillPass) say(r.passed.some((n) => re.test(n)) && !r.failed.some((n) => re.test(n)), `still passes (does not depend on the mutated guard): ${re}`);
    writeFileSync(FILE, original);
  }
} finally {
  writeFileSync(FILE, original);
}
say(sha(readFileSync(FILE, "utf8")) === originalSha, "session.ts restored byte for byte");
const after = run();
say(after.status === 0 && after.failed.length === 0, `post-restore: suite passes again (${after.passed.length} tests)`);
console.log(bad ? `\n${bad} FAILED` : "\nAll mutations were caught and the file was restored");
process.exit(bad ? 1 : 0);
