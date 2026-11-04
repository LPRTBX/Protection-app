/**
 * Fixed fictional evidence for the governed-learning walkthrough.
 * This is scripted replay data, not a model, production policy or Core OS integration.
 */
export type LearningPolicyVersion = 1 | 2;
export type LearningRunKind = "first" | "next" | "rollback";

export interface LearningEvidence {
  id: string;
  label: string;
  occurredAt: string;
  availableAt: string;
  beforeConnection: string;
  afterConnection: string;
}

export interface LearningRun {
  key: LearningRunKind;
  number: number;
  policyVersion: LearningPolicyVersion;
  contextReadyAt: string;
  reviewAt: string;
  summaryApprovedAt: string;
  summaryDeliveredAt: string;
  summaryVerifiedAt: string;
  repeatQuestions: number;
}

export interface LearningMarketingAction {
  runNumber: number;
  actionKey: string;
  authorisedAt: string;
  requestAt: string;
  evidenceDeadlineAt: string;
}

export interface LearningReceivingEvidence {
  runNumber: number;
  result: "present" | "not-present" | "unknown";
  sequence: number;
  recordedAt: string;
}

const at = (hour: number, minute: number) =>
  `2026-11-03T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+11:00`;

export const LEARNING_EVIDENCE: readonly LearningEvidence[] = [
  {
    id: "session",
    label: "Fictional session activity",
    occurredAt: "10:00–10:20",
    availableAt: at(10, 45),
    beforeConnection: "Available in its source, not connected to the review queue",
    afterConnection: "Connected to the review queue at 10:45",
  },
  {
    id: "offer",
    label: "Promotional offer still scheduled",
    occurredAt: "Send scheduled for 11:00",
    availableAt: at(10, 32),
    beforeConnection: "Schedule available, not connected to the review queue",
    afterConnection: "Schedule connected before its planned send",
  },
  {
    id: "request",
    label: "Customer explicitly requests support",
    occurredAt: at(10, 35),
    availableAt: at(10, 35),
    beforeConnection: "Available and connected at 10:35",
    afterConnection: "Available and connected at 10:35",
  },
  {
    id: "share",
    label: "Customer authorises a support summary",
    occurredAt: at(10, 40),
    availableAt: at(10, 40),
    beforeConnection: "Available to support at 10:40",
    afterConnection: "Available to support at 10:40",
  },
] as const;

/** Fixed customer-facing handoff prompts used only to derive the replay counts. */
const SUPPORT_PROMPTS_BY_VERSION: Record<LearningPolicyVersion, readonly string[]> = {
  1: [
    "What would you like Support to know?",
    "Can you restate what your request is about?",
    "What would you like the next person to know?",
  ],
  2: [
    "What would you like help with next?",
  ],
};

/** Convert a fixed local Sydney timestamp into a comparable instant. */
const toDate = (value: string) => new Date(value);
const plusMinutes = (value: string, minutes: number) =>
  new Date(toDate(value).getTime() + minutes * 60_000).toISOString();
const latestAvailability = () =>
  LEARNING_EVIDENCE.slice(0, 3)
    .map((item) => toDate(item.availableAt))
    .reduce((latest, date) => (date > latest ? date : latest))
    .toISOString();

export function createLearningMarketingAction(run: LearningRun): LearningMarketingAction {
  const authorisedAt = plusMinutes(run.reviewAt, 5);
  const requestAt = plusMinutes(run.reviewAt, 7);
  return {
    runNumber: run.number,
    actionKey: `learning-run-${run.number}-marketing-hold`,
    authorisedAt,
    requestAt,
    evidenceDeadlineAt: plusMinutes(requestAt, 10),
  };
}

export function createLearningReceivingEvidence(
  action: LearningMarketingAction,
  result: LearningReceivingEvidence["result"],
  sequence: number,
): LearningReceivingEvidence {
  return {
    runNumber: action.runNumber,
    result,
    sequence,
    recordedAt: plusMinutes(action.evidenceDeadlineAt, (sequence - 1) * 5),
  };
}

export function createLearningRun(key: LearningRunKind, number: number, version: LearningPolicyVersion): LearningRun {
  const contextReadyAt = latestAvailability();
  // V1 waits for a fictional 11:20 batch review. V2 connects the already available
  // context and opens review as soon as the final required item arrives.
  const reviewAt = version === 2 ? contextReadyAt : toDate(at(11, 20)).toISOString();
  const summaryApprovedAt = plusMinutes(reviewAt, 8);
  const summaryDeliveredAt = plusMinutes(reviewAt, 9);
  const summaryVerifiedAt = plusMinutes(summaryDeliveredAt, 1);
  return {
    key,
    number,
    policyVersion: version,
    contextReadyAt,
    reviewAt,
    summaryApprovedAt,
    summaryDeliveredAt,
    summaryVerifiedAt,
    // Count the explicitly scripted prompts; these are not measured outcomes.
    repeatQuestions: SUPPORT_PROMPTS_BY_VERSION[version].length,
  };
}

export function formatSydneyTime(instant: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

export function minutesBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export const LEARNING_REVIEW_REASON =
  "Under this fictional configured policy, the combination of session activity, an explicit support request and an offer still scheduled is enough to ask a person to review the context. It does not establish harm, addiction, guilt or a need for restriction.";

export const LEARNING_UNCERTAINTIES = [
  "The session activity is fictional context; its cause and significance are not established.",
  "A scheduled offer is not evidence that it was sent, received or acted on.",
  "The simulated response cannot establish whether a person needed help or whether any response helped.",
] as const;
