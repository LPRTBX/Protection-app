import assert from "node:assert/strict";
import test from "node:test";
import { ProtectionWorld } from "../sim/session";
import { operatorView } from "../sim/views";
import { OK, NOTE } from "./helpers";

test("a labelled system event opens review through the shared Core without a customer report", () => {
  const world = new ProtectionWorld();
  assert.equal(world.startSystemEventReplay().ok, true);
  assert.equal(world.config.id, "protection-early-support");
  assert.equal(world.scenario, "early-support");
  assert.equal(world.state?.status, "awaiting_acceptance");
  assert.equal(world.automaticSystemResponsesEnabled, true);
  const duplicate = world.admitSignal();
  assert.equal(duplicate.ok, false, "a duplicate event cannot open another case");
  if (!duplicate.ok) assert.equal(duplicate.code, "already_open");
  assert.deepEqual(operatorView(world).recommendations, [], "a recommendation is not shown before a reviewer accepts responsibility");

  assert.equal(world.acceptResponsibility().ok, true);
  const recommendation = operatorView(world).recommendations.find((item) => item.id === "request-awaiting");
  assert.ok(recommendation, "Core's configured request-awaiting rule recommends human review");
  assert.match(recommendation.fact, /simulated upstream source/);
  assert.match(recommendation.why, /not a conclusion about the customer/);
  assert.ok(recommendation.unknowns.some((unknown) => unknown.includes("reason code")));
  assert.ok(recommendation.offers.some((offer) => offer.key.includes("context-clarification-request")));
  assert.equal(world.actions().some((action) => /account|marketing/.test(action.typeId)), false, "P2 never receives the P1 account-control plan");
});

test("approval is not delivery; configured destination responses remain separate from verification", async () => {
  const world = new ProtectionWorld();
  world.startSystemEventReplay();
  world.acceptResponsibility();

  assert.equal(world.propose("context-clarification-request", "request-awaiting").ok, true);
  assert.equal(world.submit("CLR-1").ok, true);
  assert.equal(world.approve("CLR-1").ok, true);
  assert.equal(world.connectorLog.length, 0, "approval alone has no destination effect");
  assert.equal(world.dispatch("CLR-1").ok, true);
  assert.equal(world.action("CLR-1")?.state, "unresolved", "a timed-out source remains unresolved");

  assert.equal(world.propose("early-support-checkin").ok, true);
  assert.equal(world.submit("IAM-1").ok, true);
  assert.equal(world.approve("IAM-1").ok, true);
  assert.equal(world.connectorLog.length, 1, "approval did not add another destination event");
  assert.equal(world.action("IAM-1")?.state, "approved");
  assert.equal(world.dispatch("IAM-1").ok, true);
  assert.equal(world.action("IAM-1")?.state, "sent");

  const deadline = Date.now() + 4000;
  while (world.action("IAM-1")?.state !== "completed" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(world.action("IAM-1")?.state, "completed", "the fictional receiver sends its own receive/accept/complete commands");
  assert.deepEqual(world.connectorLog.slice(2).map((entry) => entry.text), [
    "Receipt acknowledged.",
    "Responsibility accepted.",
    "Work reported done.",
  ]);
  assert.equal(world.readBacks.length, 0, "completion is not independent read-back");
  assert.equal(world.confirm("IAM-1").ok, false, "confirmation remains blocked until a separate read-back exists");
});

test("the customer-requested route remains distinct and Core prepares proposals without approving them", () => {
  const world = new ProtectionWorld();
  assert.equal(world.startCustomerRequestDemo().ok, true);
  assert.equal(world.submitRequest({ duration: "7 days", contact: OK as never, note: NOTE }).ok, true);
  assert.equal(world.acceptResponsibility().ok, true);
  const actions = world.actions();
  assert.ok(actions.some((action) => action.id === "ACB-1"), "the P1 configured account-break proposal is present");
  assert.ok(actions.some((action) => action.id === "MKT-1"), "the P1 configured marketing proposal is present");
  assert.ok(actions.every((action) => action.state === "awaiting_approval" && action.attempts.length === 0), "Core prepares proposals for fresh human approval but never approves or sends them");
  assert.equal(world.automaticSystemResponsesEnabled, true, "only configured fictional destination responses auto-progress after a human sends");
});
