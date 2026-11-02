/**
 * The fictional operator and customer. Every name is invented. Nothing here is a real organisation, person, account or
 * gambling product, and nothing is inferred about anyone: the only input is what the customer chose to submit.
 */
export const OPERATOR = { organisationId: "org-northquay-fictional", deploymentId: "dep-protection-fictional", name: "Northquay Play (fictional)" } as const;
export const SCOPE = { organisationId: OPERATOR.organisationId, deploymentId: OPERATOR.deploymentId } as const;

export const REVIEWER = { memberId: "reviewer-fictional", label: "Protection reviewer (fictional)" } as const;
export const OPERATIONS = { memberId: "ops-fictional", label: "Protection Operations officer (fictional)" } as const;
export const CUSTOMER = { alias: "Customer C-1042 (fictional)", greeting: "Welcome back" } as const;

/** Simulation starts at a fixed instant so every run is repeatable. */
export const SIMULATION_START = new Date("2026-11-02T09:00:00.000Z");

export const DURATIONS = [
  { id: "24 hours", label: "24 hours", detail: "A short pause." },
  { id: "7 days", label: "7 days", detail: "A week away." },
  { id: "30 days", label: "30 days", detail: "A longer break." },
] as const;

export const CONTACT_CHOICES = [
  { id: "Updates in the app. Support may message me in the app", label: "Updates in the app, and Support may message me in the app", detail: "One supportive message at most. Never promotional.", supportOutreach: true },
  { id: "Updates in the app only. Please do not have Support contact me", label: "Updates in the app only", detail: "Support will not contact you. You can still open Support yourself at any time.", supportOutreach: false },
] as const;
export type ContactChoice = (typeof CONTACT_CHOICES)[number]["id"];
export type Duration = (typeof DURATIONS)[number]["id"];

/** What the customer may ask for in P1. Only the break is functional; the others are information only. */
export const OPTIONS = [
  { id: "break", label: "Take a break", live: true, summary: "Ask to pause your account for a set time. In this demo a reviewer authorises each action, and nothing real is changed." },
  { id: "limit", label: "Set a spending limit", live: false, summary: "Choose how much you can deposit. Information only in this prototype." },
  { id: "reminders", label: "Play-time reminders", live: false, summary: "Get a gentle reminder at set intervals. Information only in this prototype." },
  { id: "exclude", label: "Longer-term exclusion", live: false, summary: "For when you want a much longer step back. Information only in this prototype." },
  { id: "talk", label: "Talk to someone", live: false, summary: "Information about independent help. Verified, jurisdiction-specific details are not included in this demo." },
] as const;

/**
 * The only "own words" the review build accepts. A free-text box could invite real personal or health details, so none exists.
 * The command boundary refuses anything not in this list.
 */
export const FICTIONAL_NOTES = [
  { id: "none", text: "(no message chosen)" },
  { id: "rest", text: "I would like a rest from betting. (fictional example)" },
  { id: "time", text: "I want to spend less time on the app. (fictional example)" },
  { id: "space", text: "I would like some space this month. (fictional example)" },
] as const;

// ───────────── P2: operator-originated early-support review ─────────────
export const SCENARIOS = [
  { id: "customer-break", label: "Customer-requested break", tag: "P1, unchanged", detail: "The customer asks for a break. A person authorises each account and marketing action." },
  { id: "early-support", label: "Operator-originated early-support review", tag: "P2", detail: "A fictional upstream source asks for a human early-support review. Nothing is applied to anyone's account." },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

/** The fixed fictional signal. A review request is evidence that a review was requested, not that harm or wrongdoing occurred. */
export const SIGNAL = {
  alias: "Customer C-2087 (fictional)",
  reference: "SRC-9001",
  source: "Upstream protection source (simulated)",
  reasonCode: "R-14",
} as const;
export const INTAKE = { memberId: "intake-fictional", label: "Signal intake (fictional)" } as const;

export const CONTEXTS = ["current", "stale", "missing"] as const;
export type ContextState = (typeof CONTEXTS)[number];
export const CONTEXT_LABEL: Record<ContextState, string> = { current: "Current", stale: "Stale", missing: "Missing" };
export const CONTEXT_TEXT: Record<ContextState, string> = {
  current: "The source's context is current (inside the configured limit of 24 hours, fictional).",
  stale: "The source's context is older than the configured limit of 24 hours (fictional). It cannot support a discretionary check-in.",
  missing: "The source supplied no usable context. It cannot support a discretionary check-in.",
};
export interface Variant {
  context: ContextState;
  /** The contact choice ON FILE (a fictional record). It is not consent to this review or to any particular message. */
  contact: "permitted" | "not-permitted";
}
export const defaultVariant = (): Variant => ({ context: "current", contact: "permitted" });

/** Action types that belong to each scenario. The command boundary refuses the other scenario's types. */
export const P1_ACTION_TYPES = [
  "account-break", "marketing-suppression", "support-handover", "customer-account-notice", "customer-marketing-notice", "account-break-manual", "customer-manual-notice",
  "account-break-correction", "marketing-suppression-correction", "customer-account-correction-notice", "customer-marketing-correction-notice",
] as const;
export const P2_ACTION_TYPES = ["early-support-checkin", "context-clarification-request"] as const;

/** The fixed invitation. The customer sees it only once the in-app channel reports it delivered. */
export const INVITATION_TITLE = "A message from the team";
