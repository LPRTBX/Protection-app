import test from "node:test";
import assert from "node:assert/strict";
import { createLearningMarketingAction, createLearningReceivingEvidence, createLearningRun, formatSydneyTime, LEARNING_EVIDENCE, minutesBetween } from "../sim/learning";

test("fictional sequence keeps occurrence time separate from information availability", () => {
  const session = LEARNING_EVIDENCE.find((item) => item.id === "session")!;
  const offer = LEARNING_EVIDENCE.find((item) => item.id === "offer")!;
  assert.equal(session.occurredAt, "10:00–10:20");
  assert.equal(formatSydneyTime(session.availableAt), "10:45");
  assert.equal(offer.occurredAt, "Send scheduled for 11:00");
  assert.equal(formatSydneyTime(offer.availableAt), "10:32");
});

test("same fixed sequence yields deterministic earlier review only under version 2", () => {
  const before = createLearningRun("first", 1, 1);
  const after = createLearningRun("next", 2, 2);
  assert.equal(formatSydneyTime(before.reviewAt), "11:20");
  assert.equal(formatSydneyTime(after.reviewAt), "10:45");
  assert.equal(minutesBetween(after.reviewAt, before.reviewAt), 35);
  assert.equal(before.contextReadyAt, after.contextReadyAt);
});

test("acknowledgement deadline and summary verification derive from the review time", () => {
  const run = createLearningRun("next", 2, 2);
  const action = createLearningMarketingAction(run);
  assert.equal(minutesBetween(action.authorisedAt, action.requestAt), 2);
  assert.equal(minutesBetween(action.requestAt, action.evidenceDeadlineAt), 10);
  assert.equal(minutesBetween(run.reviewAt, run.summaryApprovedAt), 8);
  assert.equal(minutesBetween(run.summaryApprovedAt, run.summaryDeliveredAt), 1);
  assert.equal(minutesBetween(run.summaryDeliveredAt, run.summaryVerifiedAt), 1);
  assert.equal(run.repeatQuestions, 1);
  assert.equal(createLearningRun("first", 1, 1).repeatQuestions, 3);
});

test("receiving-system findings append after the deadline without rewriting an unknown result", () => {
  const action = createLearningMarketingAction(createLearningRun("next", 2, 2));
  const unknown = createLearningReceivingEvidence(action, "unknown", 1);
  const present = createLearningReceivingEvidence(action, "present", 2);
  assert.equal(unknown.recordedAt, action.evidenceDeadlineAt);
  assert.equal(minutesBetween(unknown.recordedAt, present.recordedAt), 5);
  assert.equal(unknown.result, "unknown");
  assert.equal(present.result, "present");
});

