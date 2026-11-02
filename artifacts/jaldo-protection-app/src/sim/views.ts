import type { GovernedAction, Recommendation } from "@workspace/jaldo-orchestration";
import { CONTACT_CHOICES, CONTEXT_LABEL, CONTEXT_TEXT, DURATIONS, INVITATION_TITLE, OPERATOR, REVIEWER, SIGNAL, type ScenarioId } from "./scope";
import type { Outcome, ProtectionWorld } from "./session";
import { CORRECTION_OF } from "./session";
import { reachedStage, type Stage, type TrackStage } from "./stage";

/**
 * THREE SEPARATE PROJECTIONS of one coordination: customer, operator (reviewer) and Protection Operations.
 *
 * Each is built by its own function from an explicit allow-list. A projection is never a filtered copy of another, and none
 * of them returns the kernel's state object. The tests serialise each projection and assert what it must not contain.
 * A projection grants nothing: authority is the kernel's, checked on every command.
 */

const PROTECTIVE = ["account-break", "marketing-suppression", "support-handover", "account-break-manual", "account-break-correction", "marketing-suppression-correction", "early-support-checkin", "context-clarification-request"] as const;
const NOTICES = ["customer-account-notice", "customer-marketing-notice", "customer-manual-notice", "customer-account-correction-notice", "customer-marketing-correction-notice"] as const;
const isProtective = (a: GovernedAction) => (PROTECTIVE as readonly string[]).includes(a.typeId);
const isNotice = (a: GovernedAction) => (NOTICES as readonly string[]).includes(a.typeId);
const fmt = (iso: string | Date) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";
const reqField = (w: ProtectionWorld, id: string) => w.state?.request.find((f) => f.id === id)?.value ?? "";

// ═════════════════════════════════════════════════════════════════════════
// 1. CUSTOMER: approved status information only
// ═════════════════════════════════════════════════════════════════════════

export type PartStatus = "not-started" | "applying" | "confirmed" | "unconfirmed";
export interface CustomerUpdate {
  id: string;
  at: string;
  title: string;
  body: string;
}
export interface CustomerView {
  hasRequest: boolean;
  request: { ref: string; duration: string; contact: string; words: string; sentAt: string } | null;
  headline: { title: string; body: string; tone: "neutral" | "progress" | "good" | "attention" };
  /** What was requested, in the customer's own terms. */
  requested: string;
  /** What remains unconfirmed, stated only from released updates. Never says anyone is actively working on it. */
  unconfirmed: string[];
  /** The latest released update: the customer's next-step information. */
  nextStep: string | null;
  parts: { id: "account" | "marketing"; label: string; status: PartStatus; text: string }[];
  /** Always shown while the break is not confirmed: the customer is never left without a way to stop. */
  stopNow: boolean;
  steps: { label: string; state: "done" | "now" | "next" }[];
  updates: CustomerUpdate[];
  scenario: ScenarioId;
  /** P2 only. The fixed supportive invitation, present only once the in-app channel has reported it delivered. */
  invitation: { title: string; body: string; at: string } | null;
  /** The customer's current contact choice, once a record exists. */
  contact: string | null;
  /** True when the current choice does not permit optional support messages. Never described as a finding about the customer. */
  optedOut: boolean;
}

const PART_TEXT: Record<PartStatus, string> = {
  "not-started": "Not confirmed yet. We will update you when it is.",
  applying: "Authorised by a team member and sent. Not confirmed yet.",
  confirmed: "A simulated check in this demo matched. Nothing real was changed.",
  unconfirmed: "Not confirmed yet.",
};

/**
 * The customer sees ONLY: their own request, three fixed lines the kernel recorded for them, the text of messages a person
 * released, and the text of notices a person approved and sent. Never an internal state, an attempt, a system name, a reviewer's
 * note, an evidence record, or another person's data. Wording for kernel records comes from this table, not from the kernel's
 * internal text.
 */
/**
 * P2 customer projection. Before the in-app channel reports the invitation delivered, this returns NOTHING about the signal,
 * the source, the reason, the review, or even that a record exists: the customer asked for nothing and has no request. The
 * kernel's own request evidence is never used here. Opening the message is not recorded and is not consent.
 */
function earlySupportCustomer(w: ProtectionWorld, empty: CustomerView): CustomerView {
  const delivered = w.actions().find((a) => a.typeId === "early-support-checkin" && ["completed", "confirmed"].includes(a.state));
  const body = delivered?.fields.find((f) => f.id === "text")?.value ?? null;
  const invitation = delivered && body ? { title: INVITATION_TITLE, body, at: fmt(delivered.completedAt ?? w.now) } : null;
  return {
    ...empty,
    scenario: "early-support",
    contact: invitation ? w.currentContact : null,
    optedOut: !!invitation && !w.supportOutreachPermitted(),
    invitation,
    headline: invitation ? { title: "You have a message", body: "There is nothing you need to do.", tone: "neutral" } : empty.headline,
    nextStep: invitation ? invitation.body : null,
    updates: invitation ? [{ id: "invitation", at: invitation.at, title: invitation.title, body: invitation.body }] : [],
  };
}

export function customerView(w: ProtectionWorld): CustomerView {
  const empty: CustomerView = {
    hasRequest: false,
    request: null,
    headline: { title: "No break requested", body: "This is a fictional demo. It cannot apply a real break or contact a real service.", tone: "neutral" },
    requested: "",
    unconfirmed: [],
    nextStep: null,
    parts: [],
    stopNow: false,
    steps: [],
    updates: [],
    scenario: w.scenario,
    invitation: null,
    contact: null,
    optedOut: false,
  };
  if (w.scenario === "early-support") return earlySupportCustomer(w, empty);
  const s = w.state;
  if (!s) return empty;

  const duration = reqField(w, "duration");
  const updates: CustomerUpdate[] = [];
  const parts: Record<"account" | "marketing", PartStatus> = { account: "not-started", marketing: "not-started" };
  let releasedIndex = 0;
  for (const e of w.evidence) {
    if (!e.audience.includes("party:customer")) continue;
    const id = `u-${e.sequence}`;
    if (e.kind === "request.opened") {
      updates.push({ id, at: e.at, title: "Request received", body: `We have received your request for a ${durationAdjective(duration)} break. In this demo a team member reviews it. Nothing real is changed.` });
    } else if (e.kind === "request.accepted") {
      updates.push({ id, at: e.at, title: "A team member is reviewing it", body: "A team member has taken responsibility for your request. Nothing is confirmed yet." });
    } else if (e.kind === "communication.released") {
      const tpl = s.released[releasedIndex++];
      updates.push({ id, at: e.at, title: "Update from the team", body: e.recipientText ?? "" });
      if (tpl?.templateId === "c-sent" && parts.account !== "confirmed") parts.account = "applying";
      if (["c-account-open", "c-account-interrupted", "c-account-mismatch"].includes(tpl?.templateId ?? "") && parts.account !== "confirmed") parts.account = "unconfirmed";
      if (["c-marketing-open", "c-marketing-mismatch"].includes(tpl?.templateId ?? "") && parts.marketing !== "confirmed") parts.marketing = "unconfirmed";
    } else if (e.kind === "disclosure.made") {
      const a = w.action(e.actionId ?? "");
      if (a && isNotice(a)) {
        updates.push({ id, at: e.at, title: "Update from the team", body: a.fields.find((f) => f.id === "message")?.value ?? "" });
        if (a.typeId.includes("marketing")) parts.marketing = "confirmed";
        else parts.account = "confirmed";
      }
    }
  }

  const allIn = parts.account === "confirmed" && parts.marketing === "confirmed";
  const anyUnconfirmed = parts.account === "unconfirmed" || parts.marketing === "unconfirmed";
  const headline: CustomerView["headline"] = allIn
    ? { title: "Your break is confirmed", body: `Both parts of your ${durationAdjective(duration)} break are recorded as confirmed by a simulated check in this demo. Nothing real was changed.`, tone: "good" }
    : parts.account === "confirmed"
      ? { title: "Your account break is confirmed", body: "Promotional messages are not confirmed yet.", tone: "good" }
      : anyUnconfirmed
        ? { title: "Not everything is confirmed yet", body: "Please do not rely on the parts that are not confirmed. We will update you when each part is.", tone: "attention" }
        : parts.account === "applying"
          ? { title: "Authorised and sent", body: "A team member authorised your break. It is not confirmed yet.", tone: "progress" }
          : s.status === "owner_accepted"
            ? { title: "A team member is reviewing your request", body: "Nothing is confirmed yet.", tone: "progress" }
            : { title: "Request received", body: "In this demo a team member reviews it. Nothing is confirmed yet.", tone: "progress" };

  const reviewing = s.status === "owner_accepted";
  const steps: CustomerView["steps"] = [
    { label: "You asked for a break", state: "done" },
    { label: "In this demo, a team member reviews and authorises it", state: parts.account !== "not-started" ? "done" : reviewing ? "now" : "now" },
    { label: "Each part is applied, then checked by a simulated read-back", state: allIn ? "done" : parts.account !== "not-started" ? "now" : "next" },
    { label: "We update you on what is confirmed", state: allIn ? "done" : "next" },
  ];

  const text = (id: "account" | "marketing") => PART_TEXT[parts[id]];
  return {
    hasRequest: true,
    request: { ref: w.ref ?? "", duration, contact: w.currentContact ?? reqField(w, "contact"), words: reqField(w, "note"), sentAt: fmt(w.receivedAt ?? w.now) },
    headline,
    parts: [
      { id: "account", label: "Your account break", status: parts.account, text: text("account") },
      { id: "marketing", label: "Promotional messages", status: parts.marketing, text: text("marketing") },
    ],
    stopNow: !allIn,
    requested: `A break from gambling for ${duration}`,
    unconfirmed: [parts.account !== "confirmed" ? "Your account break" : "", parts.marketing !== "confirmed" ? "Promotional messages" : ""].filter(Boolean),
    nextStep: updates.length ? updates[updates.length - 1].body : null,
    scenario: "customer-break",
    invitation: null,
    contact: w.currentContact,
    optedOut: false,
    steps,
    updates: [...updates].reverse().map((u) => ({ ...u, at: fmt(u.at) })),
  };
}

/** "7 days" -> "7-day", for use before a noun: "your 7-day break". */
export function durationAdjective(d: string) {
  return d.replace(/^(\d+) (hour|day)s?$/, "$1-$2");
}
export function contactLabel(id: string) {
  return CONTACT_CHOICES.find((c) => c.id === id)?.label ?? id;
}
export function durationDetail(id: string) {
  return DURATIONS.find((d) => d.id === id)?.detail ?? "";
}

// ═════════════════════════════════════════════════════════════════════════
// 2. OPERATOR: review, policies, authority, approval
// ═════════════════════════════════════════════════════════════════════════

export interface Offer {
  key: string;
  label: string;
  tone: "primary" | "quiet";
  /** Present when a person must tick each check before the button works. Never pre-ticked. */
  checks?: string[];
  disabledReason?: string;
}
export interface PolicyCheck {
  text: string;
  result: "met" | "needs-attention";
  basis: string;
}
export interface OperatorAction {
  id: string;
  typeId: string;
  short: string;
  label: string;
  group: "protection" | "support" | "customer-notice" | "early-support";
  recipient: string;
  stage: Stage;
  stageLabel: string;
  stageDetail: string;
  reached: TrackStage;
  notYetAccepted: boolean;
  policy: string;
  authorisedBy: string | null;
  authorisedAt: string | null;
  fields: { label: string; value: string }[];
  withheld: string[];
  waitingFor: string[];
  /** Set when a correction can no longer move forward (the protection is confirmed, or the mismatch no longer holds). */
  notApplicable: string | null;
  attempts: { n: number; result: string; reason: string | null; at: string }[];
  offers: Offer[];
}
export interface ReviewCard {
  title: string;
  received: string;
  source: { name: string; reference: string; eventTime: string; simulated: string };
  limitations: string[];
  policy: { label: string; version: string }[];
  context: { state: "current" | "stale" | "missing"; label: string; text: string };
  permitted: { label: string; value: string }[];
  unknowns: string[];
  decisions: { what: string; status: "available" | "blocked" | "unavailable"; why: string | null }[];
  whoDecides: string;
  willShare: string;
  outstanding: string[];
  protections: string;
}
export interface OperatorView {
  scenario: ScenarioId;
  review: ReviewCard | null;
  status: "none" | "awaiting_acceptance" | "owner_accepted";
  request: { ref: string; receivedAt: string; fields: { label: string; value: string }[] } | null;
  provenance: { rows: { label: string; value: string }[]; checks: string[] } | null;
  policies: { id: string; label: string; version: string; source: string; appliesTo: string[]; checks: PolicyCheck[] }[];
  authority: { holder: string; responsibility: string; permits: string[]; doesNotPermit: string[]; active: boolean; note: string };
  communicationPermission: { choice: string; current: string; supportOutreach: boolean; explanation: string };
  corrections: { actionId: string; protection: string; owner: string; reported: string; permittedNext: string; authorisation: string; correction: string | null; offers: Offer[] }[];
  actions: OperatorAction[];
  recommendations: { id: string; title: string; fact: string; why: string; unknowns: string[]; whoDecides: string; offers: Offer[] }[];
  messages: { templateId: string; actionId: string; purpose: string; body: string; offer: Offer }[];
  next: { what: string; who: string }[];
  offers: Offer[];
  evidence: { sequence: number; at: string; kind: string; actor: string; strength: string; text: string }[];
  history: { at: string; by: string; ok: boolean; did: string; result: string }[];
}

const POLICY_STATEMENTS: Record<string, (w: ProtectionWorld) => PolicyCheck[]> = {
  "break-request-procedure": (w) => [
    { text: "The request came from the customer's own signed-in channel.", result: "met", basis: `Source: customer app, method: party channel, reference ${w.ref}. Identity check: simulated pass.` },
    { text: "The customer chose the length of break.", result: DURATIONS.some((d) => d.id === reqField(w, "duration")) ? "met" : "needs-attention", basis: `Chosen: ${reqField(w, "duration")}.` },
    { text: "Nothing is inferred about the customer. The request alone is the basis, and nobody is scored or assessed.", result: "met", basis: "No assessment step exists in this deployment." },
  ],
  "account-control-standard": (w) => [
    { text: "Only new bets and deposits are prevented. Withdrawals are not affected.", result: "met", basis: "Fixed in the approved action wording." },
    { text: "The control lasts only as long as the customer chose.", result: "met", basis: `Length of break: ${reqField(w, "duration")}.` },
  ],
  "marketing-permissions": (w) => [
    { text: "Only promotional messages stop. Service and safety messages follow the customer's contact choice.", result: "met", basis: "Fixed in the approved action wording." },
    { text: "A contact choice is recorded.", result: reqField(w, "contact") ? "met" : "needs-attention", basis: `Recorded: ${contactLabel(reqField(w, "contact"))}.` },
  ],
  "support-contact-standard": (w) => [
    {
      text: "Optional support outreach is sent only while the customer's CURRENT permission allows it. It is checked again at every step and when sent.",
      result: w.supportOutreachPermitted() ? "met" : "needs-attention",
      basis: w.supportOutreachPermitted() ? "The customer's current choice allows Support to message them in the app." : "The customer's current choice does not allow optional support outreach. The demo refuses to propose, approve or send it. Required notices about the request are separate and still appear in the app.",
    },
  ],
  "early-support-review-procedure": (w) => [
    { text: "A review request from a source is a request for a human review. It is not a finding about the customer, and nobody is scored or labelled.", result: "met", basis: "No assessment step exists in this deployment." },
    { text: "Outreach is optional, fixed in wording, non-promotional, and approved by a named person.", result: "met", basis: "The check-in's wording is fixed in the approved action." },
    {
      text: "Optional outreach is sent only while the customer's CURRENT contact choice permits it. Fresh context does not create permission.",
      result: w.supportOutreachPermitted() ? "met" : "needs-attention",
      basis: w.supportOutreachPermitted() ? "The contact choice on file currently permits an in-app message." : "The contact choice on file does not permit optional outreach. The demo refuses to propose, approve or send the check-in.",
    },
  ],
  "message-delivery-standard": () => [
    { text: "Only the fixed, approved message is delivered, to the customer reference given, through the in-app channel.", result: "met", basis: "Fixed in the approved action wording." },
    { text: "Whether optional outreach is appropriate is decided before approval under the Early-support review procedure; this standard governs delivery only.", result: "met", basis: "See the Early-support review procedure and the contact permission check above." },
  ],
  "source-context-standard": (w) => [
    {
      text: "A discretionary check-in needs current, usable source context. Missing or stale context is not treated as a finding; it is clarified or the review proceeds no further.",
      result: w.contextState() === "current" ? "met" : "needs-attention",
      basis: CONTEXT_TEXT[w.contextState()],
    },
    { text: "Existing protections are never removed, delayed or weakened because a new proposal is blocked.", result: "met", basis: "A review creates no account or marketing change in this deployment." },
  ],
  "customer-status-standard": () => [
    { text: "The customer is told only what a person approved and what the demo's simulated read-back confirmed.", result: "met", basis: "Each notice cannot be sent until its protection is confirmed." },
  ],
};

const STALE_TEXT = "No longer applicable: the protection it corrects is no longer reported applied with a mismatching read-back (for example, it has since been confirmed). It cannot be submitted, approved or sent. Its history is kept. Withdraw it when you have reviewed this.";
/** A correction that has not been sent and can no longer move forward. Derived from the same check the command boundary uses. */
const staleCorrection = (w: ProtectionWorld, a: GovernedAction) => w.isCorrectionType(a.typeId) && ["proposed", "awaiting_approval", "approved"].includes(a.state) && !w.correctionApplicable(a.typeId);

function offersFor(w: ProtectionWorld, a: GovernedAction): Offer[] {
  const t = w.typeOf(a);
  const out: Offer[] = [];
  if (staleCorrection(w, a)) return [{ key: "withdraw", label: "Withdraw: no longer applicable", tone: "primary" }];
  const waiting = w.waitingFor(a);
  const checkin = a.typeId === "early-support-checkin";
  const blockers = checkin ? w.checkinBlockers().map((b) => b.message).join(" ") : "";
  const sys = t.recipient === "customer" ? "the customer" : w.partyLabel(t.recipient);
  switch (a.state) {
    case "proposed":
      out.push({ key: "submit", label: "Put forward for approval", tone: "primary" }, { key: "withdraw", label: "Withdraw", tone: "quiet" });
      break;
    case "awaiting_approval": {
      const gated = isNotice(a) && waiting.length > 0;
      out.push({
        key: "approve",
        label: `Approve: ${t.short}`,
        tone: "primary",
        checks: [`Recipient: ${sys} is the right recipient`, `Purpose: ${t.purpose}`, `Exact fields: ${a.fields.map((f) => f.label).join(", ")} only`, `Authority: ${t.authority.label}`],
        ...(gated ? { disabledReason: `Held until: ${waiting.join("; ")}. A customer notice is approved only once its protection is confirmed.` } : {}),
        ...(blockers ? { disabledReason: blockers } : {}),
      });
      out.push({ key: "refuse", label: checkin ? "Record decision: do not proceed" : "Do not approve", tone: "quiet" }, { key: "withdraw", label: "Withdraw", tone: "quiet" });
      break;
    }
    case "approved": {
      out.push({
        key: "dispatch",
        label: a.attempts.length > 0 ? `Send again (attempt ${a.attempts.length + 1} of ${w.config.execution.maxAttempts})` : `Send to ${sys}`,
        tone: "primary",
        ...(waiting.length > 0 ? { disabledReason: `Waiting for: ${waiting.join("; ")}.` } : {}),
        ...(blockers ? { disabledReason: blockers } : {}),
      });
      out.push({ key: "revoke", label: "Revoke approval", tone: "quiet" });
      break;
    }
    case "completed": {
      if (t.confirmer === "holder") {
        const rb = w.latestReadBack(a.id);
        out.push({
          key: "confirm",
          label: "Record confirmation",
          tone: "primary",
          ...(rb?.result === "matches" ? {} : { disabledReason: rb ? "The simulated read-back did not match. This cannot be confirmed; a separately authorised correction is the permitted next action." : "Needs a simulated read-back from Protection Operations first." }),
        });
      }
      break;
    }
    case "unresolved":
      if (a.gap?.kind !== "dispatch_uncertain") out.push({ key: "recheck", label: checkin ? "Re-check and propose again (fresh approval; context and permission are checked again)" : "Re-check and propose again", tone: "primary" });
      break;
    default:
      break;
  }
  return out;
}

const PERMITS: Record<string, string> = {
  "hold-request": "Take responsibility for a request",
  prepare: "Propose and submit actions",
  approve: "Approve a specific action after four checks",
  execute: "Send an approved action (under its approval)",
  "release-communication": "Release a prepared customer message",
  "view-holder": "See the request and its records",
};

/** The compact explainable card for an operator-originated review. It states facts and limits; it scores and labels nobody. */
function reviewCard(w: ProtectionWorld): ReviewCard {
  const ctx = w.contextState();
  const blockers = w.checkinBlockers();
  const live = (id: string) => w.actions().find((a) => a.typeId === id && !["withdrawn", "not_approved"].includes(a.state)) ?? null;
  const esc = live("early-support-checkin");
  const clr = live("context-clarification-request");
  const refused = w.actions().find((a) => a.typeId === "early-support-checkin" && a.state === "not_approved");
  const policy = ["early-support-review-procedure", "source-context-standard"].map((id) => {
    const p = w.config.policies.find((x) => x.id === id)!;
    return { label: p.label, version: p.version };
  });
  const outstanding: string[] = [];
  if (!esc && !refused) outstanding.push("No decision has been recorded on the check-in.");
  if (esc && !["confirmed", "closed"].includes(w.stage(esc).stage)) outstanding.push(`Check-in ${esc.id}: ${w.stage(esc).label}. ${w.stage(esc).detail}`);
  if (clr && !["applied", "confirmed"].includes(w.stage(clr).stage)) outstanding.push(`Clarification ${clr.id}: ${w.stage(clr).label}.`);
  if (ctx !== "current") outstanding.push("Source context is not current. A refresh is unavailable here (it needs a new coordination); to proceed, request clarification or end the review.");
  if (refused) outstanding.push("You recorded a decision not to proceed. The record is kept.");
  return {
    title: "Why this needs review",
    received: "An upstream protection source has asked for a human early-support review. The customer has asked for nothing, and nothing has been applied to their account.",
    source: { name: SIGNAL.source, reference: w.ref ?? SIGNAL.reference, eventTime: fmt(w.receivedAt ?? w.now), simulated: "Simulated. Provenance is not verified here." },
    limitations: [
      "A review request is evidence that a review was requested. It is not evidence that harm or wrongdoing occurred.",
      "JALDO does not interpret, score or verify the source's reason code.",
      "The source and its provenance are simulated. Production needs authenticated connector identity.",
    ],
    policy,
    context: { state: ctx, label: CONTEXT_LABEL[ctx], text: CONTEXT_TEXT[ctx] },
    permitted: [
      { label: "Customer reference", value: w.state?.request.find((f) => f.id === "who")?.value ?? "" },
      { label: "Source reference", value: w.ref ?? "" },
      { label: "Reason supplied by the source", value: w.state?.request.find((f) => f.id === "basis")?.value ?? "" },
      { label: "Contact choice on file (fictional record)", value: `${contactLabel(w.currentContact ?? "")}. Not consent to this review or to any message.` },
    ],
    unknowns: [
      "Whether the person wants any contact. Only their current contact choice and their own later choices say so.",
      "What, if anything, the source's reason code reflects. It is not interpreted here.",
      ctx === "current" ? "Whether the source holds anything newer." : "What the source would supply if asked again.",
      "Whether any other source says anything. Nothing is joined across brands or systems.",
    ],
    decisions: [
      esc
        ? { what: "Prepare the early-support check-in", status: "unavailable", why: `Already prepared as ${esc.id}: ${w.stage(esc).label}. It is a separate decision for each step.` }
        : refused
          ? { what: "Prepare the early-support check-in", status: "unavailable", why: "You recorded a decision not to proceed. That record is kept." }
          : { what: "Prepare the early-support check-in", status: blockers.length ? "blocked" : "available", why: blockers.length ? blockers.map((b) => b.message).join(" ") : null },
      clr
        ? { what: "Request clarification from the source", status: "unavailable", why: `Already requested as ${clr.id}: ${w.stage(clr).label}. Completing it does not refresh this review.` }
        : { what: "Request clarification from the source", status: "available", why: ctx === "current" ? "Available, though the context is current." : null },
      esc
        ? { what: "Record a decision not to proceed", status: ["awaiting_approval", "proposed"].includes(esc.state) ? "available" : "unavailable", why: ["awaiting_approval", "proposed"].includes(esc.state) ? "Use 'Record decision: do not proceed' on the check-in. It is recorded, not erased." : "The check-in has already been approved or sent. Use withdraw or revoke before sending." }
        : { what: "Record a decision not to proceed", status: "unavailable", why: "Unavailable until a check-in is prepared: a review-level no-action decision needs a Core operation (docs/protection-app/P2-design.md §10)." },
    ],
    whoDecides: "A named protection reviewer. Nothing is sent without their approval, and nothing about the customer's account changes.",
    willShare: "If approved: one fixed, supportive, non-promotional in-app invitation. The in-app channel receives the customer reference, a fixed template id and the wording. It never receives the source, the reason code, the freshness or the contact record.",
    outstanding,
    protections: "Nothing existing is removed, delayed or weakened by this review, or by a blocked proposal.",
  };
}

export function operatorView(w: ProtectionWorld): OperatorView {
  const s = w.state;
  const role = w.config.roles.find((r) => r.id === "protection-reviewer")!;
  const authority: OperatorView["authority"] = {
    holder: REVIEWER.label,
    responsibility: role.label,
    permits: role.operations.map((o) => PERMITS[o] ?? o),
    doesNotPermit: ["Record a connected system's response on its behalf", "Verify the delivery of their own send (a separate reconciler does)", "See another customer's request", "Change a policy"],
    active: !w.reviewerRevoked,
    note: w.reviewerRevoked ? "This responsibility is revoked in the simulation. The kernel refuses approval until it is restored." : "Granted and not revoked. The kernel checks it again on every step.",
  };
  const choice = reqField(w, "contact");
  const communicationPermission = {
    choice: contactLabel(choice),
    current: contactLabel(w.currentContact ?? choice),
    supportOutreach: w.supportOutreachPermitted(),
    explanation: w.scenario === "early-support"
      ? (w.supportOutreachPermitted() ? "The contact choice on file currently permits one optional in-app check-in. It is checked again at every step and when sent. Fresh context does not create permission." : "The contact choice on file does NOT permit optional outreach. The demo refuses to propose, approve or send the check-in. Fresh context does not change that.")
      : w.supportOutreachPermitted()
      ? "Optional support outreach is permitted right now: one supportive in-app message, no promotional content. It is checked again each time. Whether to send it, and when, is your decision (a fictional procedure choice)."
      : "Optional support outreach is NOT permitted right now. The demo refuses to propose, approve or send it. Required notices about this request are separate and still appear in the app.",
  };
  if (!s) {
    return { scenario: w.scenario, review: null, status: "none", request: null, provenance: null, policies: [], authority, communicationPermission, corrections: [], actions: [], recommendations: [], messages: [], next: [], offers: [], evidence: [], history: [] };
  }

  const view = w.holder();
  const actions: OperatorAction[] = w.actions().map((a) => {
    const t = w.typeOf(a);
    const st = w.stage(a);
    return {
      id: a.id,
      typeId: a.typeId,
      short: t.short,
      label: t.label,
      group: isNotice(a) ? "customer-notice" : a.typeId === "support-handover" ? "support" : ["early-support-checkin", "context-clarification-request"].includes(a.typeId) ? "early-support" : "protection",
      recipient: t.recipient === "customer" ? "The customer" : w.partyLabel(t.recipient),
      stage: st.stage,
      stageLabel: st.label,
      stageDetail: st.detail,
      reached: reachedStage(a),
      notYetAccepted: st.notYetAccepted,
      policy: `${w.config.policies.find((p) => p.id === t.policy)!.label} (${w.config.policies.find((p) => p.id === t.policy)!.version})`,
      authorisedBy: a.approval ? (a.approval.by.id === REVIEWER.memberId ? REVIEWER.label : a.approval.by.id) : null,
      authorisedAt: a.approval ? fmt(a.approval.at) : null,
      fields: a.fields.map((f) => ({ label: f.label, value: f.value })),
      withheld: t.withheld,
      waitingFor: w.waitingFor(a),
      notApplicable: staleCorrection(w, a) ? STALE_TEXT : null,
      attempts: a.attempts.map((x, i) => ({ n: i + 1, result: x.result, reason: x.reason, at: fmt(x.at) })),
      offers: s.status === "owner_accepted" ? offersFor(w, a) : [],
    };
  });

  const recs: Recommendation[] = w.recommendations();
  const recommendations = recs.map((r) => {
    const offers: Offer[] = [];
    if (r.pathway) offers.push({ key: `recover|${r.id}|${r.pathway.actionType}`, label: `Propose: ${r.pathway.label}`, tone: "primary" });
    offers.push({ key: `keep-waiting:${r.id}`, label: r.ruleId === "expectation-passed" ? "Keep waiting; I will review again" : "Not now", tone: "quiet" });
    return { id: r.id, title: r.title, fact: r.fact, why: r.why, unknowns: r.unknowns, whoDecides: r.whoDecides, offers };
  });

  // A message is offered only while it is true: "being applied" is stale once confirmed; "did not match" needs a recorded mismatch.
  const confirmedNow = (id: string) => w.action(id)?.state === "confirmed";
  const mismatchNow = (id: string) => w.action(id)?.state === "completed" && w.latestReadBack(id)?.result === "does-not-match";
  const messages = (view?.plan.communications ?? []).filter((c) => !(c.templateId === "c-sent" && confirmedNow(c.actionId)) && !(c.templateId.endsWith("-mismatch") && !mismatchNow(c.actionId))).map((c) => {
    const tpl = w.config.communications.find((x) => x.id === c.templateId)!;
    return { templateId: c.templateId, actionId: c.actionId, purpose: tpl.purpose, body: tpl.body, offer: { key: `release:${c.templateId}:${c.actionId}`, label: "Release this message to the customer", tone: "primary" as const } };
  });

  const early = w.scenario === "early-support";
  const policyIds = [...new Set([early ? "early-support-review-procedure" : "break-request-procedure", ...(early ? ["source-context-standard"] : []), ...w.actions().map((a) => w.typeOf(a).policy)])];
  const policies = policyIds.map((id) => {
    const p = w.config.policies.find((x) => x.id === id)!;
    return {
      id,
      label: p.label,
      version: p.version,
      source: p.source,
      appliesTo: id === "break-request-procedure" || id === "early-support-review-procedure" ? ["The review request itself"] : id === "source-context-standard" ? ["The decision to prepare a check-in", ...w.actions().filter((x) => w.typeOf(x).policy === id).map((x) => w.typeOf(x).short)] : w.actions().filter((a) => w.typeOf(a).policy === id).map((a) => w.typeOf(a).short),
      checks: POLICY_STATEMENTS[id]?.(w) ?? [],
    };
  });

  const live = (id: string) => w.actions().find((a) => a.typeId === id && !["withdrawn", "not_approved"].includes(a.state)) ?? null;
  const corrections: OperatorView["corrections"] = Object.entries(CORRECTION_OF).flatMap(([orig, corr]) => {
    const a = w.mismatchedAction(orig) ?? w.actions().find((x) => x.typeId === orig && x.state === "completed" && live(corr)) ?? null;
    if (!a) return [];
    const c = live(corr);
    const noticeType = corr === "account-break-correction" ? "customer-account-correction-notice" : "customer-marketing-correction-notice";
    const offers: Offer[] = [];
    if (!c) offers.push({ key: `propose:${corr}`, label: `Propose: ${w.config.actions.find((x) => x.id === corr)!.short}`, tone: "primary" });
    else if (!live(noticeType) && c.state === "confirmed") offers.push({ key: `propose:${noticeType}`, label: "Propose the customer notice for the correction", tone: "primary" });
    return [{
      actionId: a.id,
      protection: w.typeOf(a).short,
      owner: "Protection reviewer (next step belongs to them)",
      reported: `${w.partyLabel(w.typeOf(a).recipient)} reported it applied. The simulated read-back did not match, so it is NOT confirmed. The original record is kept and is never overwritten or confirmed.`,
      permittedNext: "Propose a separate correction that re-applies the same control. It never removes, weakens or restarts a confirmed control. A fresh simulated read-back is then needed.",
      authorisation: "A fresh approval by a person holding approval authority. No earlier approval is reused.",
      correction: c ? `${c.id}: ${w.stage(c).label}` : null,
      offers,
    }];
  });

  const offers: Offer[] = [];
  if (early) {
    if (s.status === "owner_accepted") {
      const liveType = (id: string) => w.actions().some((a) => a.typeId === id && !["withdrawn", "not_approved"].includes(a.state));
      const blockers = w.checkinBlockers();
      if (!liveType("early-support-checkin")) offers.push({ key: "propose:early-support-checkin", label: "Prepare the early-support check-in", tone: "primary", ...(blockers.length ? { disabledReason: blockers.map((b) => b.message).join(" ") } : {}) });
      if (!liveType("context-clarification-request")) offers.push({ key: "propose:context-clarification-request", label: "Request clarification from the source", tone: "quiet" });
    }
  }
  if (s.status === "awaiting_acceptance") {
    offers.push({ key: "accept", label: "Take responsibility for this request", tone: "primary", checks: ["Authority: I hold the Protection reviewer responsibility", "Conflict: I have no conflict of interest with this customer", "Capacity: I can act on this request now"] });
  } else if (!early && !w.actions().some((a) => w.typeOf(a).recipient === "account-controls")) {
    offers.push({ key: "prepare", label: "Prepare the configured plan", tone: "primary" });
  }
  if (s.status === "owner_accepted" && !early) {
    const live = (id: string) => w.actions().some((a) => a.typeId === id && !["withdrawn", "not_approved"].includes(a.state));
    if (!live("support-handover") && w.actions().length > 0) {
      offers.push({
        key: "propose:support-handover",
        label: "Propose a support handover",
        tone: "quiet",
        ...(w.supportOutreachPermitted() ? {} : { disabledReason: "The customer's current contact choice does not allow optional support outreach. The demo refuses it at the command boundary, not only here." }),
      });
    }
    if (!live("customer-manual-notice") && live("account-break-manual")) offers.push({ key: "propose:customer-manual-notice", label: "Propose the customer notice for the manual desk", tone: "quiet" });
  }

  const evidenceActor = (id: string | undefined, kind: string) => (kind === "party" ? w.partyLabel(id ?? "") : id === REVIEWER.memberId ? REVIEWER.label : id === "jaldo-os" ? "JALDO Core (automation)" : id ?? "");
  return {
    scenario: w.scenario,
    review: early ? reviewCard(w) : null,
    status: s.status === "awaiting_acceptance" ? "awaiting_acceptance" : "owner_accepted",
    request: { ref: w.ref ?? "", receivedAt: fmt(w.receivedAt ?? w.now), fields: s.request.map((f) => ({ label: f.label, value: f.value })) },
    provenance: early ? {
      rows: [
        { label: "Source", value: `${SIGNAL.source}: simulated` },
        { label: "Method", value: "Integration (simulated): admitted by signal intake. Not verified here" },
        { label: "Reference", value: w.ref ?? "" },
        { label: "Event time", value: fmt(w.receivedAt ?? w.now) },
        { label: "Purpose", value: "early-support-review" },
        { label: "Data class", value: "personal" },
        { label: "Configuration", value: `${s.config.id}@${s.config.version}` },
        { label: "Operator", value: OPERATOR.name },
      ],
      checks: ["The origin is the upstream source, not the customer. The customer asked for nothing and nothing here records customer consent.", "Source identity and provenance are simulated. Production needs authenticated connector identity and provenance verification."],
    } : {
      rows: [
        { label: "Source", value: "Customer app (simulated channel)" },
        { label: "Method", value: "Party channel: the customer's own signed-in session" },
        { label: "Reference", value: w.ref ?? "" },
        { label: "Purpose", value: "customer-break" },
        { label: "Data class", value: "personal" },
        { label: "Configuration", value: `${s.config.id}@${s.config.version}` },
        { label: "Operator", value: OPERATOR.name },
      ],
      checks: ["The kernel admitted only the permitted fields for this purpose. Anything else would have been refused.", "Identity matching is simulated. Real identity matching is a production requirement."],
    },
    policies,
    authority,
    communicationPermission,
    corrections,
    actions,
    recommendations,
    messages,
    next: view?.plan.awaitingHuman ?? [],
    offers,
    evidence: (view?.evidence ?? []).map((e) => ({ sequence: e.sequence, at: fmt(e.at), kind: e.kind, actor: evidenceActor(e.actor?.id, e.actor?.kind ?? ""), strength: e.strength, text: e.text })),
    history: w.history.map((h) => ({ at: fmt(h.at), by: h.by, ok: h.ok, did: h.did, result: h.result })),
  };
}

/** Carry out one offered operator step through the kernel. Returns the kernel's own answer. */
export function operatorDo(w: ProtectionWorld, key: string, actionId?: string): Outcome {
  if (key.startsWith("recover|")) {
    const [, recId, actionType] = key.split("|");
    return w.propose(actionType, recId);
  }
  const [verb, a, b] = key.split(":");
  switch (verb) {
    case "accept": return w.acceptResponsibility();
    case "prepare": return w.preparePlan();
    case "submit": return w.submit(actionId!);
    case "approve": return w.approve(actionId!);
    case "refuse": return w.refuseApproval(actionId!);
    case "withdraw": return w.withdraw(actionId!);
    case "revoke": return w.revokeApproval(actionId!);
    case "dispatch": return w.dispatch(actionId!);
    case "confirm": return w.confirm(actionId!);
    case "recheck": return w.recheck(actionId!);
    case "propose": return w.propose(a);
    case "keep-waiting": return w.dismissRecommendation(key.slice("keep-waiting:".length));
    case "release": return w.releaseCommunication(a, b);
    default: return { ok: false, code: "unknown", message: "Unknown step." };
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 3. PROTECTION OPERATIONS: execution, suppression, support, evidence, gaps
// ═════════════════════════════════════════════════════════════════════════

/** Fields Protection Operations may see. The customer's words and contact choice are never among them. */
const OPS_FIELDS = ["customer", "duration", "control", "scope", "guide", "template", "reference", "ask"];

export interface OpsRow {
  id: string;
  typeId: string;
  short: string;
  system: string;
  systemKey: string;
  stage: Stage;
  stageLabel: string;
  stageDetail: string;
  reached: TrackStage;
  notYetAccepted: boolean;
  authorisedBy: string | null;
  authorisedAt: string | null;
  fields: { label: string; value: string }[];
  attempts: { n: number; result: string; reason: string | null; at: string }[];
  waitingFor: string[];
  nextStep: { label: string; disabledReason?: string } | null;
  readBack: { available: boolean; last: { reference: string; result: string; at: string } | null };
  unknownSend: { reference: string; delivered: boolean } | null;
  systemUnavailable: boolean;
}
export interface OpsGap {
  id: string;
  actionId: string | null;
  what: string;
  ownerOfNextStep: string;
  source: "kernel" | "adapter";
}
export interface OperationsView {
  scenario: ScenarioId;
  hasWork: boolean;
  counts: Record<Stage, number>;
  account: OpsRow[];
  marketing: OpsRow[];
  support: OpsRow[];
  /** P2: the in-app check-in delivery and the source clarification, as lifecycle facts and scoped instruction fields only. */
  delivery: OpsRow[];
  clarification: OpsRow[];
  gaps: OpsGap[];
  evidence: { sequence: number; at: string; kind: string; actor: string; strength: string; text: string }[];
  connectorLog: { at: string; system: string; actionId: string | null; text: string }[];
  readBacks: { actionId: string; at: string; result: string; reference: string }[];
  systems: { key: string; label: string; unavailable: boolean }[];
}

const OPS_EVIDENCE_KINDS = new Set([
  "action.proposed", "action.submitted", "approval.recorded", "approval.refused", "approval.revoked", "execution.attempted", "execution.failed", "execution.uncertain",
  "dispatch.reconciled", "disclosure.made", "receipt.recorded", "acceptance.recorded", "decline.recorded", "completion.recorded", "confirmation.recorded",
  "responsibility.unresolved", "capacity.lost", "action.rechecked", "action.withdrawn", "recovery.proposed",
]);

export function operationsView(w: ProtectionWorld): OperationsView {
  const protective = w.actions().filter(isProtective);
  // Optional support outreach is shown to Operations as a lifecycle fact only: no attempts, evidence, log or gap history.
  const ids = new Set(protective.filter((a) => a.typeId !== "support-handover").map((a) => a.id));
  const row = (a: GovernedAction): OpsRow => {
    const t = w.typeOf(a);
    const st = w.stage(a);
    const next = w.nextConnectorStep(a.id);
    const rb = w.latestReadBack(a.id);
    const log = w.receivingSystemLog(a.id);
    return {
      id: a.id,
      typeId: a.typeId,
      short: t.short,
      system: w.partyLabel(t.recipient),
      systemKey: t.recipient,
      stage: st.stage,
      stageLabel: st.label,
      stageDetail: st.detail,
      reached: reachedStage(a),
      notYetAccepted: st.notYetAccepted,
      authorisedBy: a.approval ? (a.approval.by.id === REVIEWER.memberId ? REVIEWER.label : a.approval.by.id) : null,
      authorisedAt: a.approval ? fmt(a.approval.at) : null,
      fields: a.typeId === "support-handover" ? [] : a.fields.filter((f) => OPS_FIELDS.includes(f.id)).map((f) => ({ label: f.label, value: f.value })),
      attempts: a.typeId === "support-handover" ? [] : a.attempts.map((x, i) => ({ n: i + 1, result: x.result, reason: x.reason, at: fmt(x.at) })),
      waitingFor: w.waitingFor(a),
      nextStep: next.step ? { label: next.step === "receive" ? "Simulate: system acknowledges receipt" : next.step === "accept" ? "Simulate: system accepts responsibility" : "Simulate: system reports the work done" } : ["sent", "received", "accepted"].includes(a.state) ? { label: "Simulate: system takes its next step", disabledReason: next.why } : null,
      readBack: { available: a.state === "completed" && t.confirmer === "holder", last: rb ? { reference: rb.reference, result: rb.result, at: fmt(rb.at) } : null },
      unknownSend: log,
      systemUnavailable: a.recipient !== null && w.unavailable.has(a.recipient),
    };
  };
  const rows = protective.map(row);
  const counts = { proposed: 0, approved: 0, waiting: 0, retry: 0, sent: 0, acknowledged: 0, applied: 0, confirmed: 0, unresolved: 0, closed: 0 } as Record<Stage, number>;
  for (const r of rows) counts[r.stage] += 1;

  const gaps: OpsGap[] = [];
  const assurance = w.assurance();
  for (const u of assurance?.unresolvedResponsibilities ?? []) {
    if (u.actionId && ids.has(u.actionId)) gaps.push({ id: `k-${u.actionId}`, actionId: u.actionId, what: `${w.label(u.actionId)}: ${u.reason}`, ownerOfNextStep: "Protection reviewer", source: "kernel" });
  }
  const correctionFor = (a: GovernedAction) => {
    const corr = CORRECTION_OF[a.typeId];
    return corr ? w.actions().find((x) => x.typeId === corr && !["withdrawn", "not_approved"].includes(x.state)) ?? null : null;
  };
  for (const a of protective.filter((x) => ids.has(x.id))) {
    const st = w.stage(a);
    if (st.notYetAccepted && a.state !== "unresolved") gaps.push({ id: `n-${a.id}`, actionId: a.id, what: `${w.label(a.id)}: sent, and not yet accepted by the system. It is not confirmed.`, ownerOfNextStep: a.state === "sent" || a.state === "received" ? w.partyLabel(a.recipient ?? "") : "Protection reviewer", source: "adapter" });
    if (a.state === "completed" && w.typeOf(a).confirmer === "holder") {
      const rb = w.latestReadBack(a.id);
      const corr = correctionFor(a);
      gaps.push({
        id: `c-${a.id}`,
        actionId: a.id,
        what: !rb ? `${w.label(a.id)}: the system reports it applied. No simulated read-back has been run, so it is not confirmed.`
          : rb.result === "matches" ? `${w.label(a.id)}: the simulated read-back matched. Waiting for the reviewer to record the confirmation.`
          : corr ? `${w.label(a.id)}: reported applied, read-back did not match, NOT confirmed. Its record is kept. Correction ${corr.id} is ${w.stage(corr).label.toLowerCase()}${corr.state === "confirmed" ? " (the correction's own confirmation does not rewrite this record)" : ""}.`
          : `${w.label(a.id)}: reported applied, but the simulated read-back did not match, so it is NOT confirmed. A separately authorised correction is the permitted next action.`,
        ownerOfNextStep: !rb ? "Protection Operations" : "Protection reviewer",
        source: "adapter",
      });
    }
    if (staleCorrection(w, a)) gaps.push({ id: `s-${a.id}`, actionId: a.id, what: `${w.label(a.id)}: not sent, and no longer applicable. It is awaiting the reviewer's withdrawal; its history is kept.`, ownerOfNextStep: "Protection reviewer", source: "adapter" });
    else if (a.state === "approved" && w.waitingFor(a).length > 0) gaps.push({ id: `w-${a.id}`, actionId: a.id, what: `${w.label(a.id)}: approved and not sent; waiting for ${w.waitingFor(a).join("; ")}.`, ownerOfNextStep: "Protection reviewer", source: "kernel" });
  }

  const actorLabel = (id: string | undefined, kind: string) => (kind === "party" ? w.partyLabel(id ?? "") : id === REVIEWER.memberId ? REVIEWER.label : id === "jaldo-os" ? "JALDO Core (automation)" : id ?? "");
  const evidence = w.evidence
    .filter((e) => e.actionId !== null && ids.has(e.actionId) && OPS_EVIDENCE_KINDS.has(e.kind))
    .map((e) => ({ sequence: e.sequence, at: fmt(e.at), kind: e.kind, actor: actorLabel(e.actor?.id, e.actor?.kind ?? ""), strength: e.strength, text: e.text }));

  return {
    scenario: w.scenario,
    hasWork: protective.length > 0,
    counts,
    account: rows.filter((r) => ["account-break", "account-break-manual", "account-break-correction"].includes(r.typeId)),
    marketing: rows.filter((r) => ["marketing-suppression", "marketing-suppression-correction"].includes(r.typeId)),
    support: rows.filter((r) => r.typeId === "support-handover"),
    delivery: rows.filter((r) => r.typeId === "early-support-checkin"),
    clarification: rows.filter((r) => r.typeId === "context-clarification-request"),
    gaps,
    evidence,
    connectorLog: w.connectorLog.filter((l) => l.actionId === null || ids.has(l.actionId)).map((l) => ({ at: fmt(l.at), system: w.partyLabel(l.system), actionId: l.actionId, text: l.text })),
    readBacks: w.readBacks.filter((r) => ids.has(r.actionId)).map((r) => ({ actionId: r.actionId, at: fmt(r.at), result: r.result, reference: r.reference })),
    systems: (w.scenario === "early-support" ? (["in-app-channel", "upstream-source"] as const) : (["account-controls", "account-controls-manual", "marketing-suppression", "marketing-suppression-manual"] as const)).map((key) => ({ key, label: w.partyLabel(key), unavailable: w.unavailable.has(key) })),
  };
}
