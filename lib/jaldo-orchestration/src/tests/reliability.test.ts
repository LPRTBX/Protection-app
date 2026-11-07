import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adoptConfiguration,
  applyCommand,
  deriveAssuranceState,
  evaluateAuthority,
  ingestEvent,
  loadConfiguration,
  openCoordination,
  type Actor,
} from "../index";
import { PORTABILITY_CONFIGURATIONS, REFERENCE_CONFIGURATIONS } from "../deployments";
import { CHECKS4, grant, Harness, OTHER_DEPLOYMENT, satisfyPrerequisites, SCOPE, shape, supportAccepted } from "./harness";

/** Execution, replay, authority and isolation contracts — run against both configurations. */
// Every reference configuration AND the Stage 6B.2 portability configurations, unchanged (ADR-0037 D-7).
for (const config of [...Object.values(REFERENCE_CONFIGURATIONS), ...Object.values(PORTABILITY_CONFIGURATIONS)]) {
  const s = shape(config);

  describe(`reliability and authority — ${config.id}`, () => {
    it("duplicate events: the same idempotency key has no second effect", () => {
      const h = new Harness(config).accepted();
      supportAccepted(h);
      h.unavailable.add(s.supportRecipient);
      const ev = h.capacityEvent(s.supportRecipient, "unavailable", "cap-dup");
      const first = ingestEvent(config, h.state, ev, h.liaison("member-b", s.supportRecipient), h.facts());
      assert.ok(first.ok);
      assert.deepEqual(first.evidence.map((e) => e.kind), ["capacity.lost", "moment.recognised"]);
      const again = ingestEvent(config, first.state, ev, h.liaison("member-b", s.supportRecipient), h.facts());
      assert.ok(again.ok && again.duplicate && again.evidence.length === 0 && again.state === first.state);
      // The same key with different content is a conflict, not a duplicate (aligned with Core WP2).
      const reused = { ...ev, context: { ...ev.context, status: "available" } };
      const conflict = ingestEvent(config, first.state, reused, h.liaison("member-b", s.supportRecipient), h.facts());
      assert.ok(!conflict.ok && conflict.code === "idempotency_conflict");
      // A second request event never opens a second request on the same coordination.
      assert.equal(ingestEvent(config, first.state, { ...h.requestEvent(), idempotencyKey: "other" }, h.owner, h.facts()).ok, false);
    });

    it("duplicate commands: the same command id is acknowledged with no second effect", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner, "cmd-propose");
      const before = h.state;
      const r = h.run({ type: "propose", actionType: s.support }, h.owner, "cmd-propose");
      assert.ok(r.ok && r.duplicate);
      assert.equal(h.state, before);
      assert.equal(h.state.actions.length, 1);
    });

    it("repeated recommendations: an open moment is recorded once; a recurrence is counted, not re-raised", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.capacity(s.supportRecipient, true);
      const key = `capacity-lost-after-acceptance:${id}`;
      h.capacity(s.supportRecipient, true);
      assert.equal(h.state.moments.filter((m) => m.id === key).length, 1);
      h.capacity(s.supportRecipient, false);
      h.ok({ type: "propose", actionType: s.expectType }, h.owner); // any recorded change resyncs moments
      assert.equal(h.state.moments.find((m) => m.id === key)?.status, "resolved");
      h.capacity(s.supportRecipient, true);
      const m = h.state.moments.find((x) => x.id === key)!;
      assert.deepEqual([m.status, m.occurrences], ["recognised", 2]);
    });

    it("idempotent execution: each attempt has its own key, and a delivered action is never executed twice", () => {
      const h = new Harness(config).accepted();
      const keys: string[] = [];
      h.executor = (req) => (keys.push(req.key), { status: "delivered", reference: `ref-${req.key}` });
      const id = supportAccepted(h);
      assert.deepEqual(keys, [`${id}#1`]);
      h.refused({ type: "execute", actionId: id }, h.owner, "invalid_state");
      assert.deepEqual(keys, [`${id}#1`]);
    });

    it("failed execution: retryable failures stay approved; exhaustion is a visible unresolved responsibility", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.executor = () => ({ status: "failed", reason: "timeout", retryable: true });
      for (let i = 1; i < config.execution.maxAttempts; i++) {
        h.ok({ type: "execute", actionId: id }, h.owner);
        assert.equal(h.action(id).state, "approved");
        assert.equal(h.action(id).sentAt, null, "a failed attempt is not sent");
      }
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.deepEqual([h.action(id).state, h.action(id).gap?.kind], ["unresolved", "execution_failed"]);
      assert.equal(h.action(id).attempts.length, config.execution.maxAttempts);
      assert.ok(deriveAssuranceState(config, h.state, h.evidence, h.facts()).unresolvedResponsibilities.some((u) => u.actionId === id));
      // A non-retryable failure is unresolved at once.
      const g = new Harness(config).accepted();
      g.ok({ type: "propose", actionType: s.support }, g.owner);
      const gid = g.lastActionId();
      g.ok({ type: "submit", actionId: gid }, g.owner);
      g.ok({ type: "approve", actionId: gid, checks: CHECKS4 }, g.subject);
      g.executor = () => ({ status: "failed", reason: "rejected", retryable: false });
      g.ok({ type: "execute", actionId: gid }, g.owner);
      assert.equal(g.action(gid).state, "unresolved");
    });

    it("dispatch uncertainty: never sent or retried; reconciled only under the D4 authority contract, with evidence and an account", () => {
      const prep = () => {
        const h = new Harness(config).accepted();
        h.ok({ type: "propose", actionType: s.support }, h.owner);
        const id = h.lastActionId();
        h.ok({ type: "submit", actionId: id }, h.owner);
        h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
        const keys: string[] = [];
        h.executor = (req) => (keys.push(req.key), { status: "uncertain", reason: "timeout_after_send" });
        h.ok({ type: "execute", actionId: id }, h.owner);
        return { h, id, keys };
      };
      const { h, id, keys } = prep();
      const a = h.action(id);
      assert.deepEqual([a.state, a.gap?.kind, a.sentAt], ["unresolved", "dispatch_uncertain", null]);
      assert.ok(a.disclosure, "a possible disclosure stays on record");
      h.refused({ type: "execute", actionId: id }, h.owner, "invalid_state");
      h.refused({ type: "recheck", actionId: id }, h.owner, "invalid_state");
      assert.deepEqual(keys, [`${id}#1`], "nothing is dispatched twice");
      assert.ok(deriveAssuranceState(config, h.state, h.evidence, h.facts()).unresolvedResponsibilities.some((u) => u.reason.startsWith("Delivery is uncertain")));
      // Decision D4: a purpose-scoped reconciler who is not the request holder, with evidence and an account.
      const account = "The provider's booking log shows the request arrived at 09:02 (fictional).";
      const reconcilerRole = config.roles.find((r) => r.operations.includes("reconcile-execution"))!.id;
      const reconciler = (id: string): Actor => ({ kind: "member", id, coreRole: "operator", scope: SCOPE, grants: [grant(reconcilerRole)] });
      const holderAlsoReconciler: Actor = { ...(h.owner as Extract<Actor, { kind: "member" }>), grants: [grant(h.holderRole), grant(reconcilerRole)] };
      const cmd = (extra: Record<string, unknown> = {}) => ({ type: "reconcileDispatch", actionId: id, finding: "verified_delivered", evidenceReference: "TICKET-42", account, basis: { kind: "purpose-grant" }, ...extra }) as never;
      h.refused(cmd(), h.owner, "not_permitted"); // no reconcile responsibility
      h.refused(cmd(), holderAlsoReconciler, "not_permitted"); // the holder may not verify their own action
      h.refused(cmd(), h.liaison("member-b", s.supportRecipient), "not_found"); // a liaison has no reach here
      h.refused(cmd(), { ...reconciler("auditor"), scope: OTHER_DEPLOYMENT }, "not_found"); // purpose scope is per deployment
      h.refused(cmd({ evidenceReference: "https://x.example/1" }), reconciler("auditor"), "reason_required");
      h.refused(cmd({ account: "ok" }), reconciler("auditor"), "reason_required");
      h.refused(cmd({ basis: { kind: "core-finding", findingId: "not-an-id" } }), holderAlsoReconciler, "reason_required");
      h.ok(cmd(), reconciler("auditor"));
      assert.equal(h.action(id).state, "sent");
      assert.ok(!JSON.stringify(h.evidence).includes("booking log") && !JSON.stringify(h.state).includes("booking log"), "the reconciler's account never enters immutable kernel records");
      // Without an uncertain dispatch, the reconciler reaches nothing.
      h.refused(cmd(), reconciler("auditor"), "not_found");
      // Core path: an owner's recorded ADR-0034 finding is the basis, even when that owner holds the request.
      const c = prep();
      const holderOwner: Actor = { ...(c.h.owner as Extract<Actor, { kind: "member" }>), coreRole: "owner", grants: [grant(c.h.holderRole), grant(reconcilerRole)] };
      c.h.ok({ type: "reconcileDispatch", actionId: c.id, finding: "verified_delivered", evidenceReference: "DESK-9", account, basis: { kind: "core-finding", findingId: "00000000-0000-4000-8000-000000000001" } } as never, holderOwner);
      assert.equal(c.h.action(c.id).state, "sent");
      // Not delivered: the unused approval stands and a new attempt gets a new key.
      const g = prep();
      g.h.ok({ type: "reconcileDispatch", actionId: g.id, finding: "verified_not_delivered", evidenceReference: "PROVIDER-LOG-7", account, basis: { kind: "purpose-grant" } } as never, reconciler("auditor"));
      assert.deepEqual([g.h.action(g.id).state, g.h.action(g.id).disclosure], ["approved", null]);
      g.h.executor = (req) => (g.keys.push(req.key), { status: "delivered", reference: null });
      g.h.ok({ type: "execute", actionId: g.id }, g.h.owner);
      assert.deepEqual(g.keys, [`${g.id}#1`, `${g.id}#2`]);
    });

    it("invalid lifecycle transitions are refused and change nothing", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      for (const c of [{ type: "approve", actionId: id, checks: CHECKS4 }, { type: "execute", actionId: id }, { type: "receive", actionId: id }, { type: "complete", actionId: id }, { type: "confirm", actionId: id }, { type: "recheck", actionId: id }] as const) {
        const actor: Actor = c.type === "approve" ? h.subject : c.type === "receive" || c.type === "complete" ? h.liaison("member-b", s.supportRecipient) : c.type === "confirm" ? h.subject : h.owner;
        const r = h.run(c as never, actor);
        assert.equal(r.ok, false, c.type);
      }
    });

    it("already-completed work cannot be completed, confirmed twice, or reopened", () => {
      const h = new Harness(config).accepted();
      const id = supportAccepted(h);
      h.ok({ type: "complete", actionId: id }, h.liaison("member-b", s.supportRecipient));
      h.refused({ type: "complete", actionId: id }, h.liaison("member-b", s.supportRecipient), "invalid_state");
      h.ok({ type: "confirm", actionId: id }, h.subject);
      h.refused({ type: "confirm", actionId: id }, h.subject, "invalid_state");
      h.refused({ type: "withdraw", actionId: id }, h.owner, "invalid_state");
    });

    it("stale authority: a revoked or expired grant blocks execution even after approval", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.refused({ type: "execute", actionId: id }, h.member("member-a", { revokedAt: h.now.toISOString() }), "not_permitted");
      h.refused({ type: "execute", actionId: id }, h.member("member-a", { expiresAt: h.now.toISOString() }), "not_permitted");
      h.refused({ type: "execute", actionId: id }, { ...(h.owner as Extract<Actor, { kind: "member" }>), coreRole: "reviewer" }, "not_permitted");
      h.ok({ type: "execute", actionId: id }, h.owner);
    });

    it("an approval recorded under another configuration version never executes (defence in depth on replayed state)", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.state = { ...h.state, actions: h.state.actions.map((a) => (a.id === id ? { ...a, approval: { ...a.approval!, configVersion: "0.9.0" } } : a)) };
      h.refused({ type: "execute", actionId: id }, h.owner, "stale_authority");
    });

    it("the kernel's own automation never executes a person-approved action", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.expectType }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
      const automated = { ...config, automation: { operations: [...config.automation.operations, "execute-standing-authority"] } } as typeof config;
      const r = applyCommand(automated, h.state, { id: "sys-exec", command: { type: "execute", actionId: id } }, h.system, h.facts());
      assert.ok(!r.ok && r.code === "not_permitted");
    });

    it("the subject can revoke an approval before anything is sent; nothing is then sent", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.refused({ type: "revokeApproval", actionId: id }, h.owner, "not_permitted");
      h.ok({ type: "revokeApproval", actionId: id }, h.subject);
      assert.deepEqual([h.action(id).state, h.action(id).withdrawal?.reason], ["withdrawn", "approval_revoked"]);
      h.refused({ type: "execute", actionId: id }, h.owner, "invalid_state");
    });

    it("a revoked party channel cannot act", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.refused({ type: "approve", actionId: id, checks: CHECKS4 }, { ...(h.subject as Extract<Actor, { kind: "party" }>), revokedAt: h.now.toISOString() }, "not_permitted");
    });

    it("lost provider capacity before execution: the action becomes a visible gap, never a substitute", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      h.unavailable.add(s.supportRecipient);
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.deepEqual([h.action(id).state, h.action(id).recipient, h.action(id).sentAt], ["unresolved", null, null]);
    });

    it("no eligible recipient at proposal: unresolved, with nobody invented", () => {
      const h = new Harness(config).accepted();
      h.unavailable.add(s.supportRecipient);
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const a = h.action(h.lastActionId());
      assert.deepEqual([a.state, a.recipient, a.gap?.kind], ["unresolved", null, "no_recipient"]);
    });

    it("interrupted handover: a destination who can no longer hold the request leaves it visibly unresolved", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "routeRequest", to: "member-c", checks: CHECKS4 }, h.owner);
      h.eligibleHolders = ["member-a", "member-b"];
      h.refused({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.member("member-c"), "no_eligible_holder");
      const a = deriveAssuranceState(config, h.state, h.evidence, h.facts());
      assert.equal(a.request, "awaiting-acceptance");
      assert.ok(a.unresolvedResponsibilities.some((u) => u.actionId === null));
      assert.equal(h.state.destination, "member-c", "nobody else is chosen");
    });

    it("conflicting ownership: a stale sequence is refused, and a previous holder can never act again", () => {
      const h = new Harness(config).accepted();
      const seq = h.state.sequence;
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const r = h.run({ type: "propose", actionType: s.expectType }, h.owner, "late", seq);
      assert.ok(!r.ok && r.code === "stale_sequence");
      h.ok({ type: "routeRequest", to: "member-b", checks: CHECKS4 }, h.owner);
      h.ok({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.member("member-b"));
      h.refused({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.owner, "not_found");
      h.refused({ type: "propose", actionType: s.expectType }, h.owner, "not_found");
    });

    it("cross-deployment isolation: an actor scoped to another deployment sees and does nothing", () => {
      const h = new Harness(config).accepted();
      const other = h.member("member-a", {}, OTHER_DEPLOYMENT);
      h.refused({ type: "propose", actionType: s.support }, other, "not_found");
      assert.equal(evaluateAuthority(config, other, "prepare", SCOPE, h.now).outcome, "denied");
      const ev = { ...h.capacityEvent(s.supportRecipient, "unavailable"), scope: OTHER_DEPLOYMENT };
      assert.equal(ingestEvent(config, h.state, ev, h.liaison("member-b", s.supportRecipient), h.facts()).ok, false);
      const opened = openCoordination(config, h.requestEvent(), { destination: "member-a" }, { kind: "party", key: s.subject, scope: OTHER_DEPLOYMENT }, h.facts());
      assert.equal(opened.ok, false);
    });

    it("configuration version changes: running work stays pinned; adoption makes unsent approvals stale", () => {
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: s.support }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.subject);
      // The next minor of THIS configuration's own version (a configuration may already be at 1.1.0).
      const [maj, min] = config.version.split(".").map(Number);
      const nextVersion = `${maj}.${min + 1}.0`;
      const next = loadConfiguration({ ...JSON.parse(JSON.stringify(config)), version: nextVersion });
      // A command under a different configuration version is refused, not silently re-interpreted.
      assert.equal(applyCommand(next, h.state, { id: "x", command: { type: "execute", actionId: id } }, h.owner, h.facts()).ok, false);
      const r = adoptConfiguration(config, next, h.state, { id: "adopt-1" }, h.owner, h.facts());
      assert.ok(r.ok);
      const a = r.state.actions.find((x) => x.id === id)!;
      assert.deepEqual([r.state.config.version, a.state, a.approval], [nextVersion, "awaiting_approval", null]);
      assert.ok(r.evidence.some((e) => e.kind === "authority.stale"));
      assert.equal(adoptConfiguration(config, next, h.state, { id: "adopt-2" }, h.liaison("member-b", s.supportRecipient), h.facts()).ok, false);
    });

    it("dependencies: an action cannot execute before its prerequisites, and the plan says what it waits for", () => {
      const withPrereq = config.actions.find((a) => a.prerequisites.length > 0);
      if (!withPrereq) return; // this configuration declares none
      const h = new Harness(config).accepted();
      h.ok({ type: "propose", actionType: withPrereq.id }, h.owner);
      const id = h.lastActionId();
      h.ok({ type: "submit", actionId: id }, h.owner);
      h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, h.owner);
      h.refused({ type: "execute", actionId: id }, h.owner, "dependency_unmet");
      satisfyPrerequisites(h, withPrereq.id);
      h.ok({ type: "execute", actionId: id }, h.owner);
    });
  });
}
