import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recipientView, type Actor, type DispatchResult } from "../index";
import { PORTABILITY_CONFIGURATIONS, REFERENCE_CONFIGURATIONS } from "../deployments";
import { CHECKS4, Harness, SCOPE, shape } from "./harness";

/**
 * Kernel contract 1.1 (ADR-0037 D-2): queued execution and recorded dispatch results.
 * Runs unchanged against every reference configuration. Contract 1.0 behaviour (inline
 * execution) is covered by the existing suites and the Sport differential gate.
 */
const SYSTEM: Actor = { kind: "system", scope: SCOPE };

// Every reference configuration AND the Stage 6B.2 portability configurations, unchanged (ADR-0037 D-7).
for (const config of [...Object.values(REFERENCE_CONFIGURATIONS), ...Object.values(PORTABILITY_CONFIGURATIONS)]) {
  const s = shape(config);

  /** An approved support action in a queue-dispatch host. */
  function approved() {
    const h = new Harness(config);
    h.ok({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, h.owner);
    h.ok({ type: "propose", actionType: s.support }, h.owner);
    const id = h.actionOf(s.support).id;
    h.ok({ type: "submit", actionId: id }, h.owner);
    const approver = config.actions.find((a) => a.id === s.support)!.approver === "subject" ? h.subject : h.owner;
    h.ok({ type: "approve", actionId: id, checks: CHECKS4 }, approver);
    h.dispatch = "queue";
    return { h, id };
  }
  const result = (h: Harness, id: string, key: string, r: DispatchResult, actor: Actor = SYSTEM) => h.run({ type: "recordDispatchResult", actionId: id, key, result: r }, actor);

  describe(`contract 1.1 queued execution — ${config.id}@${config.version}`, () => {
    it("execute queues: disclosure frozen, attempt recorded as queued — never sent, never visible to the recipient", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      const a = h.action(id);
      assert.equal(a.state, "queued");
      assert.equal(a.sentAt, null);
      assert.ok(a.disclosure && a.recipient, "the disclosure is frozen at queue time");
      assert.deepEqual(a.attempts.map((x) => [x.key, x.result]), [[`${id}#1`, "queued"]]);
      assert.ok(h.evidence.some((e) => e.kind === "execution.queued" && e.actionId === id));
      assert.ok(!h.evidence.some((e) => e.kind === "disclosure.made" && e.actionId === id), "queued is not a disclosure");
      assert.deepEqual(recipientView(config, h.state, h.evidence, s.supportRecipient).filter((x) => x.id === id), []);
    });

    it("only the dispatcher (system) records a result, and only for the queued attempt's key", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.equal(result(h, id, `${id}#1`, { status: "delivered", reference: "r" }, h.owner).ok, false);
      const wrongKey = result(h, id, `${id}#9`, { status: "delivered", reference: "r" });
      assert.equal(wrongKey.ok, false);
      if (!wrongKey.ok) assert.equal(wrongKey.code, "invalid_state");
      assert.equal(h.action(id).state, "queued");
    });

    it("delivered: queued → sent, with the disclosure made and visible to the recipient", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.ok(result(h, id, `${id}#1`, { status: "delivered", reference: "ack-1" }).ok);
      const a = h.action(id);
      assert.equal(a.state, "sent");
      assert.ok(a.sentAt);
      assert.deepEqual(a.attempts.map((x) => [x.key, x.result, x.reference]), [[`${id}#1`, "delivered", "ack-1"]]);
      assert.ok(h.evidence.some((e) => e.kind === "disclosure.made" && e.actionId === id));
      assert.deepEqual(recipientView(config, h.state, h.evidence, s.supportRecipient).map((x) => x.id), [id]);
      assert.equal(result(h, id, `${id}#1`, { status: "delivered", reference: "again" }).ok, false, "a result is recorded once");
    });

    it("uncertain: unresolved with dispatch_uncertain — never sent, never retried automatically", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.ok(result(h, id, `${id}#1`, { status: "uncertain", reason: "timeout" }).ok);
      const a = h.action(id);
      assert.deepEqual([a.state, a.gap?.kind, a.sentAt], ["unresolved", "dispatch_uncertain", null]);
      assert.equal(a.attempts.length, 1, "no further attempt is queued");
      assert.equal(h.run({ type: "execute", actionId: id }, h.owner).ok, false, "an uncertain action is not re-executed");
    });

    it("retryable failure re-queues under the next key, within the configured bound; then unresolved", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      for (let n = 1; n < config.execution.maxAttempts; n++) {
        assert.ok(result(h, id, `${id}#${n}`, { status: "failed", reason: "not_sent", retryable: true }).ok);
        const a = h.action(id);
        assert.equal(a.state, "queued");
        assert.deepEqual(a.attempts.map((x) => x.result), [...Array(n).fill("failed"), "queued"]);
        assert.equal(a.attempts[n].key, `${id}#${n + 1}`);
      }
      const last = config.execution.maxAttempts;
      assert.ok(result(h, id, `${id}#${last}`, { status: "failed", reason: "not_sent", retryable: true }).ok);
      const a = h.action(id);
      assert.deepEqual([a.state, a.gap?.kind, a.attempts.length], ["unresolved", "execution_failed", last]);
    });

    it("permanent failure: unresolved at once", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.ok(result(h, id, `${id}#1`, { status: "failed", reason: "invalid_target", retryable: false }).ok);
      assert.deepEqual([h.action(id).state, h.action(id).gap?.kind], ["unresolved", "execution_failed"]);
    });

    it("cancelled before dispatch: back to approved, disclosure withdrawn, nothing sent; a person may execute again", () => {
      const { h, id } = approved();
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.ok(result(h, id, `${id}#1`, { status: "cancelled", reason: "the authorising responsibility was revoked" }).ok);
      const a = h.action(id);
      assert.deepEqual([a.state, a.disclosure, a.sentAt], ["approved", null, null]);
      assert.ok(h.evidence.some((e) => e.kind === "execution.cancelled" && e.actionId === id));
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.deepEqual([h.action(id).state, h.action(id).attempts.at(-1)!.key], ["queued", `${id}#2`]);
    });

    it("contract 1.0 hosts are unchanged: without the queue fact, execute is inline", () => {
      const { h, id } = approved();
      h.dispatch = undefined;
      h.ok({ type: "execute", actionId: id }, h.owner);
      assert.equal(h.action(id).state, "sent");
      assert.ok(!h.evidence.some((e) => e.kind === "execution.queued"));
    });
  });
}
