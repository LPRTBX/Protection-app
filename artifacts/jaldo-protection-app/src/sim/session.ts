import {
  applyCommand,
  deriveAssuranceState,
  holderView,
  ingestEvent,
  openCoordination,
  recogniseMoment,
  runAnticipatoryCycle,
  subjectView,
  unmetPrerequisites,
  type Actor,
  type AssuranceState,
  type Command,
  type CoordinationState,
  type EvidenceRecord,
  type Facts,
  type GovernedAction,
  type HolderView,
  type Recommendation,
  type SubjectView,
} from "@workspace/jaldo-orchestration";
import { PROTECTION } from "../config/protection-config";
import { makeExecutor, defaultScripts, PRESETS, type Behaviour, type ConnectorKey, type ConnectorScript, type PresetId, type ReadBack } from "./connectors";
import { CONTACT_CHOICES, CUSTOMER, FICTIONAL_NOTES, OPERATIONS, REVIEWER, SCOPE, SIMULATION_START, type ContactChoice, type Duration } from "./scope";
import { stageOf, type StageView } from "./stage";

/**
 * THE DEMONSTRATION BOUNDARY.
 *
 * This module is an adapter, in the same form as the Sport workspace's. It calls the shared kernel's public operations and
 * stores what the kernel returns. It defines no action state, no transition, no authority rule, no recommendation and no
 * timer. Whether anything is allowed is the kernel's answer, and every refusal is shown in the kernel's own words.
 *
 * What it adds, and nothing more:
 *  - scripted SIMULATED systems (connectors.ts) that stand in for connectors which do not exist;
 *  - a simulated read-back recorded in the demo, whose result a person must see before the kernel's `confirm` is offered;
 *  - a contact-permission check at the command boundary below (`command`), re-read at every propose, submit, approve and
 *    send of optional support outreach. It is NOT kernel-enforced and NOT production enforcement: Core needs the permission as
 *    a precondition evaluated at approve and execute, a durable store and authenticated enforcement (docs/protection-app).
 *
 * In memory only. No network, no storage, no server, no real data. Reloading resets everything.
 */

export type Outcome = { ok: true; note: string } | { ok: false; message: string; code: string };
export interface HistoryEntry {
  at: Date;
  ok: boolean;
  /** Who, in plain words. */
  by: string;
  did: string;
  /** What the kernel said (its own refusal message, or the text of the evidence it recorded). */
  result: string;
}
export interface ConnectorLogEntry {
  at: Date;
  system: ConnectorKey;
  actionId: string | null;
  text: string;
}
export interface ReadBackRecord {
  actionId: string;
  at: Date;
  result: ReadBack;
  reference: string;
}

const CHECKS4 = { recipient: true, purpose: true, fields: true, authority: true } as const;
const ACCEPT3 = { scope: true, conflict: true, capacity: true } as const;
const NOTICE_TYPES = ["customer-account-notice", "customer-marketing-notice", "customer-manual-notice", "customer-account-correction-notice", "customer-marketing-correction-notice"] as const;
/** Optional support outreach: the only action governed by the customer's current contact permission. */
const OUTREACH = "support-handover";
/** A correction exists only for a protection whose read-back did not match. original type -> correction type. */
export const CORRECTION_OF: Record<string, string> = { "account-break": "account-break-correction", "marketing-suppression": "marketing-suppression-correction" };
const REQUEST_EVENT = "customer.break-requested";
const CAPACITY_EVENT = "connector.capacity-changed";

export interface SubmitInput {
  duration: Duration;
  contact: ContactChoice;
  note: string;
}

export interface ActorChoice {
  who: "reviewer" | "operations" | "customer" | "system";
}

export class ProtectionWorld {
  readonly config = PROTECTION;
  now = SIMULATION_START;
  version = 0;
  state: CoordinationState | null = null;
  evidence: EvidenceRecord[] = [];
  readonly history: HistoryEntry[] = [];
  readonly connectorLog: ConnectorLogEntry[] = [];
  readonly readBacks: ReadBackRecord[] = [];
  readonly unavailable = new Set<string>();
  scripts: Record<ConnectorKey, ConnectorScript> = defaultScripts();
  preset: PresetId | "custom" = "happy";
  /** Actions whose send timed out AND which in fact arrived. Known only to the simulated receiving system. */
  private readonly arrived = new Set<string>();
  /** The reviewer's approval responsibility can be revoked in the simulation to show that authority is checked on every use. */
  reviewerRevoked = false;
  private listeners = new Set<() => void>();
  private n = 0;
  private requestRef: string | null = null;
  receivedAt: Date | null = null;
  /** The customer's CURRENT contact permission. The request's own field is frozen and is never rewritten by a change. */
  private contactNow: ContactChoice | null = null;

  // ───────────────────────── plumbing ─────────────────────────
  notify() {
    this.version += 1;
    for (const l of this.listeners) l();
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;

  reset() {
    this.now = SIMULATION_START;
    this.state = null;
    this.evidence = [];
    this.history.length = 0;
    this.connectorLog.length = 0;
    this.readBacks.length = 0;
    this.unavailable.clear();
    this.scripts = defaultScripts();
    this.preset = "happy";
    this.arrived.clear();
    this.reviewerRevoked = false;
    this.requestRef = null;
    this.receivedAt = null;
    this.contactNow = null;
    this.n = 0;
    this.notify();
  }

  advanceDays(days: number) {
    this.now = new Date(this.now.getTime() + days * 86_400_000);
    this.history.push({ at: this.now, ok: true, by: "Simulation", did: `Advanced the simulated clock by ${days} day${days === 1 ? "" : "s"}`, result: "Nothing is sent or changed by time passing. Configured expectations are re-read." });
    this.notify();
  }

  applyPreset(id: PresetId) {
    const preset = PRESETS.find((p) => p.id === id)!;
    const next = defaultScripts();
    for (const [k, v] of Object.entries(preset.scripts)) next[k as ConnectorKey] = { ...next[k as ConnectorKey], ...v };
    this.scripts = next;
    this.preset = id;
    this.notify();
  }
  setBehaviour(key: ConnectorKey, behaviour: Behaviour) {
    this.scripts = { ...this.scripts, [key]: { ...this.scripts[key], behaviour } };
    this.preset = "custom";
    this.notify();
  }
  setReachedAnyway(key: ConnectorKey, reached: boolean) {
    this.scripts = { ...this.scripts, [key]: { ...this.scripts[key], reachedAnyway: reached } };
    this.preset = "custom";
    this.notify();
  }
  setReadBack(key: ConnectorKey, readBack: ReadBack) {
    this.scripts = { ...this.scripts, [key]: { ...this.scripts[key], readBack } };
    this.preset = "custom";
    this.notify();
  }
  setReviewerRevoked(revoked: boolean) {
    this.reviewerRevoked = revoked;
    this.history.push({ at: this.now, ok: true, by: "Simulation", did: revoked ? "Revoked the reviewer's responsibility grant" : "Restored the reviewer's responsibility grant", result: "Authority is evaluated again on every use." });
    this.notify();
  }

  // ───────────────────────── actors ─────────────────────────
  reviewer(): Actor {
    return {
      kind: "member",
      id: REVIEWER.memberId,
      coreRole: "operator",
      scope: SCOPE,
      grants: [{ responsibility: "protection-reviewer", grantedAt: SIMULATION_START.toISOString(), expiresAt: null, revokedAt: this.reviewerRevoked ? SIMULATION_START.toISOString() : null }],
    };
  }
  operations(): Actor {
    return {
      kind: "member",
      id: OPERATIONS.memberId,
      coreRole: "operator",
      scope: SCOPE,
      grants: [
        { responsibility: "protection-operations", grantedAt: SIMULATION_START.toISOString(), expiresAt: null, revokedAt: null },
        { responsibility: "execution-reconciler", grantedAt: SIMULATION_START.toISOString(), expiresAt: null, revokedAt: null },
      ],
    };
  }
  /** A member holding only the support responsibility. Used to show that having a role name is not authority. */
  supportAgent(): Actor {
    return { kind: "member", id: "support-agent-fictional", coreRole: "operator", scope: SCOPE, grants: [{ responsibility: "support-agent", grantedAt: SIMULATION_START.toISOString(), expiresAt: null, revokedAt: null }] };
  }
  customerActor(): Actor {
    return { kind: "party", key: "customer", scope: SCOPE };
  }
  connectorActor(key: ConnectorKey): Actor {
    return { kind: "party", key, scope: SCOPE };
  }

  facts(): Facts {
    return {
      now: this.now,
      unavailable: this.unavailable,
      eligibleHolders: [REVIEWER.memberId],
      executor: makeExecutor(this.scripts, (key, actionId, arrived) => {
        if (arrived) this.arrived.add(actionId);
      }),
    };
  }

  private who(actor: Actor): string {
    if (actor.kind === "party") return actor.key === "customer" ? CUSTOMER.alias : this.partyLabel(actor.key);
    if (actor.kind === "system") return "JALDO Core (automation)";
    if (actor.id === REVIEWER.memberId) return REVIEWER.label;
    if (actor.id === OPERATIONS.memberId) return OPERATIONS.label;
    return "Support agent (fictional)";
  }
  partyLabel(key: string) {
    return this.config.parties.find((p) => p.key === key)?.label ?? key;
  }

  private record(by: string, did: string, ok: boolean, result: string) {
    this.history.push({ at: this.now, ok, by, did, result });
    this.notify();
  }
  private fail(by: string, did: string, r: { code: string; message: string }): Outcome {
    this.record(by, did, false, r.message);
    return { ok: false, code: r.code, message: r.message };
  }

  /** Send one command through the kernel and keep whatever it returns. */
  command(command: Command, actor: Actor, did: string): Outcome {
    if (!this.state) return { ok: false, code: "not_found", message: "No request is open." };
    const refused = this.boundary(command);
    if (refused) return this.fail(this.who(actor), did, refused);
    const r = applyCommand(this.config, this.state, { id: `cmd-${++this.n}`, command }, actor, this.facts());
    if (!r.ok) return this.fail(this.who(actor), did, r);
    this.state = r.state;
    this.evidence.push(...r.evidence);
    this.record(this.who(actor), did, true, r.evidence.map((e) => e.text).join(" ") || "Recorded.");
    return { ok: true, note: "Recorded." };
  }

  /**
   * The demo's single command boundary. Every kernel command in this app passes through `command`, so this runs for the UI, for
   * `tryAs`, and for tests that drive commands directly. Two adapter checks, both stated as such:
   *  1. optional support outreach needs the customer's CURRENT permission, read afresh each time (so an approval given while
   *     permission was held is stale once it is withdrawn). Required notices and marketing are not governed by it;
   *  2. a correction exists only for a protection whose simulated read-back did not match.
   * Hiding a button is never the safeguard. Not production enforcement.
   */
  private boundary(command: Command): { code: string; message: string } | null {
    const typeOfAction = (id: string) => this.action(id)?.typeId ?? null;
    const gated =
      (command.type === "propose" && command.actionType === OUTREACH) ||
      (["submit", "approve", "execute"].includes(command.type) && typeOfAction((command as { actionId: string }).actionId) === OUTREACH);
    if (gated && !this.supportOutreachPermitted()) {
      return { code: "permission_declined", message: "Optional support outreach is not permitted: the customer's current contact choice does not allow it. Nothing was proposed, approved or sent. This check is the demo's own; production needs Core to enforce it." };
    }
    // 2. A correction is revalidated at EVERY step that moves it forward, not only when proposed: the original must still be
    //    reported applied with a read-back that does not match. A pending correction is never auto-completed, auto-withdrawn
    //    or silently re-approved; the reviewer can withdraw it (history is kept). Sending one that was already sent is not
    //    re-checked: that record is frozen.
    const target = command.type === "propose" ? command.actionType : ["submit", "approve", "execute"].includes(command.type) ? typeOfAction((command as { actionId: string }).actionId) : null;
    if (target && this.isCorrectionType(target) && !this.correctionApplicable(target)) {
      return {
        code: "correction_not_applicable",
        message: "A correction applies only while the protection is reported applied and its latest simulated read-back does not match. That no longer holds, so this correction is not proposed, submitted, approved or sent. An existing one can be withdrawn; its history is kept.",
      };
    }
    // 3. Confirmation is a person's record and the kernel does not know the demo's read-backs, so the demo requires the LATEST
    //    simulated read-back to match, here, for every route to `confirm` (the `confirm()` helper included).
    if (command.type === "confirm") {
      const a = this.action(command.actionId);
      if (a && a.state === "completed") {
        const rb = this.latestReadBack(a.id);
        if (!rb) return { code: "readback_required", message: "No simulated read-back has been recorded for this action, so its result is unknown and it cannot be confirmed. Protection Operations runs the read-back; the reviewer then records the confirmation." };
        if (rb.result !== "matches") return { code: "readback_required", message: "The latest simulated read-back did not match, so this cannot be confirmed. A separately authorised correction is the permitted next action." };
      }
    }
    return null;
  }
  isCorrectionType(typeId: string): boolean {
    return Object.values(CORRECTION_OF).includes(typeId);
  }
  /** Whether a correction of this type may still move forward: its original is applied and its latest read-back mismatched. */
  correctionApplicable(correctionType: string): boolean {
    const original = Object.entries(CORRECTION_OF).find(([, c]) => c === correctionType)?.[0];
    return !!original && !!this.mismatchedAction(original);
  }
  /** The completed, unconfirmed action of this type whose latest read-back did not match, if any. */
  mismatchedAction(typeId: string) {
    return this.actions().find((a) => a.typeId === typeId && a.state === "completed" && this.latestReadBack(a.id)?.result === "does-not-match") ?? null;
  }

  // ───────────────────────── customer ─────────────────────────
  /** The customer submits their own request through their own channel. The kernel admits it or refuses it. */
  submitRequest(input: SubmitInput): Outcome {
    if (this.state) return this.fail(CUSTOMER.alias, "Submitted a break request", { code: "already_open", message: "A request is already open in this simulation. Reset to start again." });
    const def = this.config.events.find((e) => e.type === REQUEST_EVENT)!;
    const note = FICTIONAL_NOTES.find((n) => n.text === input.note)?.text;
    if (!note) return this.fail(CUSTOMER.alias, "Submitted a break request", { code: "fictional_input_only", message: "This review build accepts only the fictional example messages. Free text is refused so that no real personal or health detail can be entered." });
    const event = {
      schema: "jaldo.event",
      id: `evt-${++this.n}`,
      idempotencyKey: `break-${this.n}`,
      type: REQUEST_EVENT,
      occurredAt: this.now.toISOString(),
      scope: SCOPE,
      source: { system: "customer-app", reference: "REQ-0001" },
      provenance: { method: "party-channel" },
      purpose: def.purpose,
      classification: def.maxClassification,
      context: { who: CUSTOMER.alias, ask: "A break from gambling", duration: input.duration, contact: input.contact, note },
    };
    const r = openCoordination(this.config, event, { destination: REVIEWER.memberId }, this.customerActor(), this.facts());
    if (!r.ok) return this.fail(CUSTOMER.alias, "Submitted a break request", r);
    this.state = r.state;
    this.evidence.push(...r.evidence);
    this.requestRef = "REQ-0001";
    this.contactNow = input.contact;
    this.receivedAt = this.now;
    this.record(CUSTOMER.alias, "Submitted a break request", true, "The request was admitted by the kernel and addressed to the protection reviewer.");
    return { ok: true, note: "Request sent." };
  }

  /** The customer changes their contact choice. A frozen disclosure is never rewritten; later commands read the new choice. */
  changeContactChoice(choice: ContactChoice): Outcome {
    if (!this.state) return { ok: false, code: "not_found", message: "No request is open." };
    if (!CONTACT_CHOICES.some((c) => c.id === choice)) return this.fail(CUSTOMER.alias, "Changed their contact choice", { code: "fictional_input_only", message: "Unknown contact choice." });
    this.contactNow = choice;
    this.record(CUSTOMER.alias, "Changed their contact choice", true, "Recorded. Anything already sent keeps the disclosure it was sent under. Optional support outreach is checked against this choice each time.");
    return { ok: true, note: "Contact choice saved." };
  }
  get currentContact(): ContactChoice | null {
    return this.contactNow;
  }

  // ───────────────────────── reviewer ─────────────────────────
  acceptResponsibility(): Outcome {
    return this.command({ type: "acceptRequest", checks: { authority: true, noConflict: true, capacity: true } }, this.reviewer(), "Took responsibility for the request after checking authority, conflict and capacity");
  }
  /** The kernel prepares the configured plan as proposals only. Nothing is approved or sent. */
  preparePlan(): Outcome {
    if (!this.state) return { ok: false, code: "not_found", message: "No request is open." };
    const r = runAnticipatoryCycle(this.config, this.state, this.facts(), `cycle-${++this.n}`);
    this.state = r.state;
    this.evidence.push(...r.evidence);
    this.record("JALDO Core (automation)", "Prepared the configured plan as proposals", true, r.evidence.length ? r.evidence.map((e) => e.text).join(" ") : "Nothing new to prepare.");
    return { ok: true, note: "Prepared." };
  }
  approve(actionId: string): Outcome {
    return this.command({ type: "approve", actionId, checks: CHECKS4 }, this.reviewer(), `Approved ${this.label(actionId)} after the four checks`);
  }
  refuseApproval(actionId: string): Outcome {
    return this.command({ type: "refuse", actionId }, this.reviewer(), `Did not approve ${this.label(actionId)}`);
  }
  submit(actionId: string): Outcome {
    return this.command({ type: "submit", actionId }, this.reviewer(), `Put ${this.label(actionId)} forward for approval`);
  }
  withdraw(actionId: string): Outcome {
    return this.command({ type: "withdraw", actionId }, this.reviewer(), `Withdrew ${this.label(actionId)}`);
  }
  revokeApproval(actionId: string): Outcome {
    return this.command({ type: "revokeApproval", actionId }, this.reviewer(), `Revoked the approval for ${this.label(actionId)}`);
  }
  recheck(actionId: string): Outcome {
    return this.command({ type: "recheck", actionId }, this.reviewer(), `Re-checked ${this.label(actionId)}`);
  }
  /** One idempotent attempt through the executor port. The simulated system's scripted behaviour decides the result. */
  dispatch(actionId: string): Outcome {
    const out = this.command({ type: "execute", actionId }, this.reviewer(), `Sent ${this.label(actionId)} to the system, under the approval already given`);
    const a = this.action(actionId);
    if (out.ok && a) {
      const last = a.attempts[a.attempts.length - 1];
      const sys = a.recipient as ConnectorKey | null;
      if (sys && last) {
        const text =
          last.result === "delivered" ? `Request ${last.key} received. Reference ${last.reference ?? "none"}. No response yet.`
          : last.result === "failed" ? `Request ${last.key} refused: ${last.reason}.`
          : `Request ${last.key}: no response before the time limit.`;
        this.connectorLog.push({ at: this.now, system: sys, actionId, text });
      }
    }
    return out;
  }
  propose(actionType: string, fromRecommendation?: string): Outcome {
    const t = this.config.actions.find((x) => x.id === actionType)!;
    return this.command({ type: "propose", actionType, ...(fromRecommendation ? { fromRecommendation } : {}) }, this.reviewer(), `Proposed ${t.short}${fromRecommendation ? " from a current recommendation" : ""}`);
  }
  dismissRecommendation(recommendationId: string): Outcome {
    return this.command({ type: "dismissRecommendation", recommendationId }, this.reviewer(), "Chose to keep waiting on a recommendation");
  }
  releaseCommunication(templateId: string, actionId: string): Outcome {
    return this.command({ type: "releaseCommunication", templateId, actionId }, this.reviewer(), "Released a prepared customer message, built from approved facts only");
  }
  /** Confirmation is a person's record. The read-back requirement lives in `boundary`, so this wrapper and a direct command agree. */
  confirm(actionId: string): Outcome {
    const rb = this.latestReadBack(actionId);
    return this.command({ type: "confirm", actionId }, this.reviewer(), `Recorded confirmation of ${this.label(actionId)}${rb ? `, citing read-back ${rb.reference}` : ""}`);
  }

  // ───────────────────────── the simulated systems, acting through their own channels ─────────────────────────
  /** Which step the system's own channel would take next, if any, and why not. */
  nextConnectorStep(actionId: string): { step: "receive" | "accept" | "complete" | null; why: string } {
    const a = this.action(actionId);
    if (!a || !a.recipient) return { step: null, why: "Not sent to a system." };
    const key = a.recipient as ConnectorKey;
    if (a.recipient === "customer") return { step: null, why: "Addressed to the customer." };
    const script = this.scripts[key];
    if (this.unavailable.has(key)) return { step: null, why: "The system is recorded as unavailable." };
    if (a.state === "sent") return script.behaviour === "no-acknowledgement" ? { step: null, why: "In this scenario the system never accepts it." } : { step: "receive", why: "" };
    if (a.state === "received") return { step: "accept", why: "" };
    if (a.state === "accepted") return { step: "complete", why: "" };
    return { step: null, why: "Nothing for the system to do." };
  }
  /** The system's own authenticated channel records its next step. A member can never do this on its behalf. */
  connectorStep(actionId: string): Outcome {
    const a = this.action(actionId);
    const next = this.nextConnectorStep(actionId);
    if (!a || !a.recipient || !next.step) return { ok: false, code: "invalid_state", message: next.why || "Nothing to do." };
    const key = a.recipient as ConnectorKey;
    const actor = this.connectorActor(key);
    const label = this.partyLabel(key);
    const cmd: Command =
      next.step === "receive" ? { type: "receive", actionId }
      : next.step === "accept" ? { type: "accept", actionId, checks: ACCEPT3 }
      : { type: "complete", actionId };
    const out = this.command(cmd, actor, `${label} ${next.step === "receive" ? "acknowledged receipt of" : next.step === "accept" ? "accepted" : "reported done"}: ${this.label(actionId)}`);
    if (out.ok) this.connectorLog.push({ at: this.now, system: key, actionId, text: next.step === "receive" ? "Receipt acknowledged." : next.step === "accept" ? "Responsibility accepted." : "Work reported done." });
    return out;
  }

  /** A simulated read-back, recorded in the demo, from a stand-in source separate from the system that applied the control. */
  readBack(actionId: string): Outcome {
    const a = this.action(actionId);
    if (!a || a.state !== "completed" || !a.recipient) return this.fail(OPERATIONS.label, `Ran a read-back for ${this.label(actionId)}`, { code: "invalid_state", message: "A read-back is only meaningful once the system reports the work done." });
    const script = this.scripts[a.recipient as ConnectorKey];
    const rec: ReadBackRecord = { actionId, at: this.now, result: script.readBack, reference: `RB-${actionId}-${this.readBacks.filter((r) => r.actionId === actionId).length + 1}` };
    this.readBacks.push(rec);
    this.record(OPERATIONS.label, `Ran a simulated read-back for ${this.label(actionId)}`, true, rec.result === "matches" ? `Read-back ${rec.reference} matched what was requested. This is a simulated source recorded in the demo, not real-world assurance.` : `Read-back ${rec.reference} did not match what was requested. Nothing is confirmed.`);
    return { ok: true, note: "Read-back recorded." };
  }
  latestReadBack(actionId: string): ReadBackRecord | null {
    const all = this.readBacks.filter((r) => r.actionId === actionId);
    return all.length ? all[all.length - 1] : null;
  }

  // ───────────────────────── Protection Operations ─────────────────────────
  recordCapacity(partyKey: ConnectorKey, status: "available" | "unavailable"): Outcome {
    if (!this.state) return { ok: false, code: "not_found", message: "No request is open." };
    const def = this.config.events.find((e) => e.type === CAPACITY_EVENT)!;
    if (status === "unavailable") this.unavailable.add(partyKey);
    else this.unavailable.delete(partyKey);
    const event = {
      schema: "jaldo.event", id: `evt-${++this.n}`, idempotencyKey: `cap-${this.n}`, type: CAPACITY_EVENT, occurredAt: this.now.toISOString(),
      scope: SCOPE, source: { system: "protection-operations" }, provenance: { method: "member-recorded" }, purpose: def.purpose, classification: "internal",
      context: { party: partyKey, status },
    };
    const did = `Recorded that ${this.partyLabel(partyKey)} is ${status}`;
    const r = ingestEvent(this.config, this.state, event, this.operations(), this.facts());
    if (!r.ok) {
      if (status === "unavailable") this.unavailable.delete(partyKey);
      else this.unavailable.add(partyKey);
      return this.fail(OPERATIONS.label, did, r);
    }
    this.state = r.state;
    this.evidence.push(...r.evidence);
    this.record(OPERATIONS.label, did, true, r.evidence.map((e) => e.text).join(" ") || "Recorded. No authorised work was in flight to this system.");
    return { ok: true, note: "Recorded." };
  }

  /** What the simulated RECEIVING system's own log says about an unknown send. This is where the evidence reference comes from. */
  receivingSystemLog(actionId: string): { delivered: boolean; reference: string } | null {
    const a = this.action(actionId);
    if (!a || a.gap?.kind !== "dispatch_uncertain" || !a.recipient) return null;
    const delivered = this.arrived.has(actionId);
    return { delivered, reference: delivered ? `LOG-${a.recipient.slice(0, 3).toUpperCase()}-${actionId}` : `LOG-${a.recipient.slice(0, 3).toUpperCase()}-${actionId}-NONE` };
  }
  reconcile(actionId: string, finding: "verified_delivered" | "verified_not_delivered", evidenceReference: string, account: string): Outcome {
    return this.command(
      { type: "reconcileDispatch", actionId, finding, evidenceReference, account, basis: { kind: "purpose-grant" } },
      this.operations(),
      `Reconciled the unknown send of ${this.label(actionId)}: ${finding === "verified_delivered" ? "delivered" : "not delivered"}`,
    );
  }
  /** Used by the interface to show the kernel's own refusal when a role without the responsibility tries a step. */
  tryAs(actor: "operations" | "support", command: Command, did: string): Outcome {
    return this.command(command, actor === "operations" ? this.operations() : this.supportAgent(), did);
  }

  // ───────────────────────── reads ─────────────────────────
  action(id: string): GovernedAction | null {
    return this.state?.actions.find((a) => a.id === id) ?? null;
  }
  actions(): GovernedAction[] {
    return this.state ? this.state.actions.filter((a) => !a.heldBack) : [];
  }
  label(actionId: string): string {
    const a = this.action(actionId);
    return a ? `${this.config.actions.find((t) => t.id === a.typeId)!.short} (${a.id})` : actionId;
  }
  typeOf(a: GovernedAction) {
    return this.config.actions.find((t) => t.id === a.typeId)!;
  }
  isNotice(a: GovernedAction) {
    return (NOTICE_TYPES as readonly string[]).includes(a.typeId);
  }
  waitingFor(a: GovernedAction): string[] {
    return this.state ? unmetPrerequisites(this.config, this.state, a.typeId) : [];
  }
  stage(a: GovernedAction): StageView {
    return stageOf(a, { waitingFor: this.waitingFor(a), recipientUnavailable: a.recipient !== null && this.unavailable.has(a.recipient), maxAttempts: this.config.execution.maxAttempts });
  }

  holder(): HolderView | null {
    return this.state ? holderView(this.config, this.state, this.evidence, this.facts(), REVIEWER.memberId) : null;
  }
  /** Active recommendations, derived by the kernel for the request owner only. */
  recommendations(): Recommendation[] {
    return this.state && this.state.status === "owner_accepted" ? recogniseMoment(this.config, this.state, this.facts()) : [];
  }
  assurance(): AssuranceState | null {
    return this.state ? deriveAssuranceState(this.config, this.state, this.evidence, this.facts()) : null;
  }
  subject(): SubjectView | null {
    return this.state ? subjectView(this.config, this.state, this.evidence) : null;
  }
  get ref() {
    return this.requestRef;
  }
  /** Whether the customer's CURRENT contact choice permits optional support outreach. */
  supportOutreachPermitted(): boolean {
    return CONTACT_CHOICES.find((x) => x.id === this.contactNow)?.supportOutreach ?? false;
  }
}
