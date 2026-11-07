import { actionTypeOf, ORDERED_STATES, partyOf, subjectOf, type DeploymentConfiguration } from "../contracts/config";
import type { Actor } from "../contracts/authority";
import type { EvidenceKind, EvidenceStrength } from "../contracts/evidence";
import type {
  Command,
  CoordinationState,
  DeadlineRecord,
  Facts,
  FollowUpRecord,
  GovernedAction,
  LinkRecord,
  RefusalCode,
} from "../contracts/orchestration";
import { actorRecord, evaluateAuthority, isMemberSelf, partyMayAct } from "./authority";
import { holderOf, isLive, ownerOf, unmetPrerequisites } from "./predicates";

/**
 * Contract 1.2 behaviours: plan versions, deadlines, subject responses with an
 * owned follow-up, and linked work. Everything here is opt-in by
 * configuration: a configuration that defines none of `planVersioning`,
 * `deadlines`, action `responses` or `linkKinds` never reaches this code's
 * effects, so every 1.1 record keeps its meaning.
 *
 * Time. Every instant is an absolute UTC instant (ISO 8601 with `Z`). A
 * duration is elapsed time: a day is exactly 24 hours and nothing adjusts for
 * local clock changes. Converting a wall-clock time such as "15:45 on this
 * property's clock" to an instant is the host's job; the kernel never reads a
 * time zone. A deadline expires when `now >= dueAt` (inclusive).
 *
 * Evaluation is not scheduling. The kernel decides whether a deadline has
 * expired whenever it is asked to (any command, any event, or
 * `reconcileMoments`). It does not run a clock. A host that wants prompt
 * notice must call `reconcileMoments` on its own schedule; until it does, an
 * expiry is recognised at the next evaluation, exactly once.
 */

export type ExtDraft = { kind: EvidenceKind; actionId: string | null; audience: string[]; text: string; recipientText?: string; strength?: EvidenceStrength };
export type ExtResult = { ok: true; state: CoordinationState; drafts: ExtDraft[] } | { ok: false; code: RefusalCode; message: string };

const refuse = (code: RefusalCode, message: string): { ok: false; code: RefusalCode; message: string } => ({ ok: false, code, message });
const rank = (s: GovernedAction["state"]) => (ORDERED_STATES as readonly string[]).indexOf(s);
const subjectAud = (config: DeploymentConfiguration) => `party:${subjectOf(config).key}`;
const iso = (ms: number) => new Date(ms).toISOString();

/** Whether an open deadline has expired at `now`. Exact and inclusive. */
export function deadlineExpired(d: DeadlineRecord, now: Date): boolean {
  return d.status === "open" && now.getTime() >= Date.parse(d.dueAt);
}

const deadlineAudience = (config: DeploymentConfiguration, defId: string) => ["holder", ...(config.deadlines?.find((d) => d.id === defId)?.audience ?? []).map((k) => `party:${k}`)];

/**
 * Keeps deadline instances, follow-up deadlines and (where configured)
 * approvals in step with the state after a recorded change. Pure and
 * idempotent: settling an already-settled state changes nothing and writes
 * nothing, so duplicate processing cannot create a second instance, a second
 * `met` or a second alert.
 */
export function settleExtensions(config: DeploymentConfiguration, state: CoordinationState, facts: Facts): { state: CoordinationState; drafts: ExtDraft[] } {
  const defs = config.deadlines ?? [];
  const guards = config.actions.some((t) => t.withdrawApprovalOnLoss);
  if (defs.length === 0 && !guards) return { state, drafts: [] };
  const at = facts.now.toISOString();
  const drafts: ExtDraft[] = [];
  let next = state;

  // 1. An approved, unreleased action whose prerequisites stopped being valid returns to awaiting approval.
  if (guards) {
    const lost = next.actions.filter((a) => a.state === "approved" && !a.heldBack && actionTypeOf(config, a.typeId).withdrawApprovalOnLoss);
    for (const a of lost) {
      const unmet = [...unmetPrerequisites(config, next, a.typeId, a, "approval"), ...unmetPrerequisites(config, next, a.typeId, a, "release")];
      if (unmet.length === 0) continue;
      const t = actionTypeOf(config, a.typeId);
      next = { ...next, actions: next.actions.map((x) => (x.id === a.id ? { ...x, state: "awaiting_approval" as const, approval: null } : x)) };
      drafts.push({
        kind: "authority.stale",
        actionId: a.id,
        audience: ["holder", ...(t.approver === "subject" ? [subjectAud(config)] : [])],
        text: `The approval for ${t.short} (${a.id}) was withdrawn because a required step is no longer valid: ${unmet.join("; ")}. Nothing was sent. The earlier records are kept; the step must be renewed and a fresh approval given before anything is released.`,
      });
    }
  }

  // 2. Deadline instances.
  const instances = [...(next.deadlines ?? [])];
  let changed = false;
  const find = (id: string) => instances.findIndex((d) => d.id === id);
  const open = (defId: string, id: string, subject: DeadlineRecord["subject"], afterMinutes: number, label: string, what: string) => {
    changed = true;
    instances.push({ id, defId, subject, setAt: at, dueAt: iso(facts.now.getTime() + afterMinutes * 60_000), status: "open", closedAt: null, late: null, history: [{ at, kind: "set", from: null, to: iso(facts.now.getTime() + afterMinutes * 60_000), reasonId: null }] });
    drafts.push({ kind: "deadline.set", actionId: subject.kind === "action" ? subject.actionId : null, audience: deadlineAudience(config, defId), text: `A deadline was set for ${what}: ${label}, due ${iso(facts.now.getTime() + afterMinutes * 60_000)} (UTC). Passing it records a moment for the holder to decide on; nothing is sent or changed automatically.`, strength: "system-recorded" });
  };
  const close = (i: number, status: "met" | "cancelled", what: string) => {
    changed = true;
    const d = instances[i];
    const late = status === "met" ? facts.now.getTime() >= Date.parse(d.dueAt) : null;
    instances[i] = { ...d, status, closedAt: at, late, history: [...d.history, { at, kind: status, from: null, to: null, reasonId: null }] };
    drafts.push({
      kind: status === "met" ? "deadline.met" : "deadline.cancelled",
      actionId: d.subject.kind === "action" ? d.subject.actionId : null,
      audience: deadlineAudience(config, d.defId),
      text: status === "met" ? `The deadline for ${what} was met${late ? " after its due time" : " in time"}.` : `The deadline for ${what} no longer applies because the step it waited for ended without being met.`,
      strength: "system-recorded",
    });
  };
  for (const def of defs) {
    if ("action" in def.on) {
      const on = def.on;
      for (const a of next.actions.filter((x) => x.typeId === on.action)) {
        const id = `${def.id}:${a.id}`;
        const i = find(id);
        const what = `${actionTypeOf(config, a.typeId).short} (${a.id})`;
        const dead = a.heldBack || !isLive(a) || a.state === "unresolved" || a.state === "declined";
        if (i < 0) {
          if (!dead && rank(a.state) >= ORDERED_STATES.indexOf(on.from) && rank(a.state) < ORDERED_STATES.indexOf(on.until)) open(def.id, id, { kind: "action", actionId: a.id }, def.afterMinutes, def.label, what);
        } else if (instances[i].status === "open") {
          if (dead || rank(a.state) < ORDERED_STATES.indexOf(on.from)) close(i, "cancelled", what);
          else if (rank(a.state) >= ORDERED_STATES.indexOf(on.until)) close(i, "met", what);
        }
      }
    } else if ("response" in def.on) {
      const on = def.on;
      for (const a of next.actions.filter((x) => x.typeId === on.response && !x.heldBack)) {
        const id = `${def.id}:${a.id}`;
        const i = find(id);
        const what = `a response to ${actionTypeOf(config, a.typeId).short} (${a.id})`;
        if (i < 0) {
          if (a.state === "completed" || a.state === "confirmed") open(def.id, id, { kind: "action", actionId: a.id }, def.afterMinutes, def.label, what);
        } else if (instances[i].status === "open" && (a.responses?.length ?? 0) > 0) close(i, "met", what);
      }
    } else {
      for (const fu of next.followUps ?? []) {
        const id = `${def.id}:${fu.id}`;
        const i = find(id);
        const what = `follow-up ${fu.id}`;
        if (i < 0) {
          if (fu.status === "open") open(def.id, id, { kind: "follow-up", followUpId: fu.id }, def.afterMinutes, def.label, what);
        } else if (instances[i].status === "open" && fu.status === "closed") close(i, "met", what);
      }
    }
  }
  if (changed) next = { ...next, deadlines: instances };
  return { state: next, drafts };
}

// ─────────────────────────────────────────────────────────────────────────
// Linked work
// ─────────────────────────────────────────────────────────────────────────

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:#/-]{2,63}$/;
const linkAudience = (config: DeploymentConfiguration, kindId: string) => {
  const k = config.linkKinds?.find((x) => x.id === kindId);
  return ["holder", ...(k ? [k.party, ...k.visibleTo] : []).map((p) => `party:${p}`)];
};

/**
 * The required links that block `actionType` at `at` while they are not
 * resolved. An `unknown` status blocks: it is never read as resolved.
 * Informational links never appear here.
 */
export function linkBlockers(config: DeploymentConfiguration, state: CoordinationState, actionType: string, at: "approval" | "release" | "completion" | "confirmation"): string[] {
  if (!config.linkKinds) return [];
  return (state.links ?? [])
    .filter((l) => !l.withdrawn && l.status !== "resolved")
    .filter((l) => config.linkKinds!.find((k) => k.id === l.kindId)?.blocks.some((b) => b.actionType === actionType && b.at === at))
    .map((l) => `${config.linkKinds!.find((k) => k.id === l.kindId)!.label} (${l.reference}) resolved`);
}

/** What one party may see of the links: only kinds it is responsible for or has been named for. The holder sees all. */
export function linksFor(config: DeploymentConfiguration, state: CoordinationState, viewer: { holder: true } | { party: string }): LinkRecord[] {
  return (state.links ?? []).filter((l) => {
    if (l.withdrawn) return false;
    if ("holder" in viewer) return true;
    const k = config.linkKinds?.find((x) => x.id === l.kindId);
    return !!k && (k.party === viewer.party || k.visibleTo.includes(viewer.party));
  });
}

/** Deadlines a viewer may see. A party sees a time only when its key is in the deadline's configured audience. */
export function deadlinesFor(config: DeploymentConfiguration, state: CoordinationState, viewer: { holder: true } | { party: string }): DeadlineRecord[] {
  return (state.deadlines ?? []).filter((d) => ("holder" in viewer ? true : (config.deadlines?.find((x) => x.id === d.defId)?.audience ?? []).includes(viewer.party)));
}

// ─────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────

/** Handles the contract 1.2 commands. Returns null for any other command. */
export function extensionCommand(config: DeploymentConfiguration, s: CoordinationState, cmd: Command, actor: Actor, facts: Facts): ExtResult | null {
  const at = facts.now.toISOString();
  const now = facts.now;
  const owner = ownerOf(s);
  const by = actorRecord(actor);
  const holderMay = (): ExtResult | null => {
    if (owner === null || !isMemberSelf(actor, owner)) return refuse("not_permitted", "Only the member who owns this request may take this step.");
    const d = evaluateAuthority(config, actor, "prepare", s.scope, now);
    return d.outcome === "allowed" ? null : refuse("not_permitted", d.reasons.join(" "));
  };
  const findAction = (id: string) => s.actions.find((a) => a.id === id && !a.heldBack) ?? null;

  switch (cmd.type) {
    case "revisePlan": {
      const denied = holderMay();
      if (denied) return denied;
      if (!config.planVersioning) return refuse("invalid_state", "This configuration does not use plan versions.");
      if (!config.changeReasons?.some((r) => r.id === cmd.reasonId)) return refuse("reason_required", "A plan revision needs one of the configured reasons.");
      const version = (s.planVersion ?? 1) + 1;
      const withdraw = s.actions.filter((a) => !a.heldBack && a.sentAt === null && ["proposed", "awaiting_approval", "approved", "unresolved"].includes(a.state));
      return {
        ok: true,
        state: {
          ...s,
          planVersion: version,
          actions: s.actions.map((a) => (withdraw.includes(a) ? { ...a, state: "withdrawn" as const, withdrawal: { at, reason: "plan_revised" as const } } : a)),
        },
        drafts: [
          { kind: "plan.revised", actionId: null, audience: ["holder", subjectAud(config)], text: `The holder revised the plan (now version ${version}). Unsent work of the earlier version was withdrawn and no earlier agreement or approval carries over; each must be given again. Work already sent keeps its record under the earlier version.`, recipientText: "The plan changed. Earlier agreements and approvals do not carry over." },
          ...withdraw.map((a): ExtDraft => ({ kind: "action.withdrawn", actionId: a.id, audience: ["holder"], text: `${actionTypeOf(config, a.typeId).short} (${a.id}) was withdrawn because the plan was revised. Nothing was sent.` })),
        ],
      };
    }

    case "recordResponse": {
      const a = findAction(cmd.actionId);
      if (!a) return refuse("not_found", "No such action.");
      const type = actionTypeOf(config, a.typeId);
      const subject = subjectOf(config);
      const m = partyMayAct(config, subject.key, actor, s, now);
      if (!m.ok) return refuse("not_permitted", `Only ${subject.label} records their own response. ${m.reason}`);
      if (!type.responses) return refuse("invalid_state", "This step does not take a response.");
      const resp = type.responses.find((r) => r.id === cmd.responseId);
      if (!resp) return refuse("reason_required", "A response needs one of the configured responses.");
      if (a.state !== "completed" && a.state !== "confirmed") return refuse("invalid_state", "A response can only follow work reported as done.");
      const prior = a.responses ?? [];
      if (prior.length > 0 && prior[prior.length - 1].responseId === resp.id) return refuse("invalid_state", "That response is already recorded.");
      const record = { responseId: resp.id, effect: resp.effect, at, by, supersedes: prior.length > 0 };
      let next: CoordinationState = { ...s, actions: s.actions.map((x) => (x.id === a.id ? { ...x, responses: [...prior, record] } : x)) };
      const drafts: ExtDraft[] = [
        {
          kind: "response.recorded",
          actionId: a.id,
          audience: ["holder", subjectAud(config)],
          text: `${subject.label} reported "${resp.label}" for ${type.short} (${a.id})${prior.length > 0 ? ", replacing an earlier report that stays on record" : ""}. This is their own report. It is not an assessment of them or of anyone's work, and it does not change the delivery record.`,
          recipientText: `Your response was recorded: "${resp.label}".`,
        },
      ];
      if (resp.effect === "unsatisfied" && !(next.followUps ?? []).some((f) => f.actionId === a.id && f.status === "open")) {
        const n = (next.followUps ?? []).filter((f) => f.actionId === a.id).length + 1;
        const fu: FollowUpRecord = { id: `FU-${a.id}-${n}`, actionId: a.id, responseId: resp.id, openedAt: at, openedOwner: holderOf(next), status: "open", closedAt: null, outcomeId: null };
        next = { ...next, followUps: [...(next.followUps ?? []), fu] };
        drafts.push({ kind: "followup.opened", actionId: a.id, audience: ["holder"], text: `A follow-up (${fu.id}) is open for the holder to review after the report on ${type.short} (${a.id}). It is owned by whoever holds the request and stays open until the holder closes it with a recorded outcome.` });
      }
      return { ok: true, state: next, drafts };
    }

    case "closeFollowUp": {
      const denied = holderMay();
      if (denied) return denied;
      const fu = (s.followUps ?? []).find((f) => f.id === cmd.followUpId);
      if (!fu) return refuse("not_found", "No such follow-up.");
      if (fu.status !== "open") return refuse("invalid_state", "This follow-up is already closed.");
      if (!config.followUpOutcomes?.some((o) => o.id === cmd.outcomeId)) return refuse("reason_required", "Closing a follow-up needs one of the configured outcomes.");
      return {
        ok: true,
        state: { ...s, followUps: (s.followUps ?? []).map((f) => (f.id === fu.id ? { ...f, status: "closed" as const, closedAt: at, outcomeId: cmd.outcomeId } : f)) },
        drafts: [{ kind: "followup.closed", actionId: fu.actionId, audience: ["holder", subjectAud(config)], text: `The holder closed follow-up ${fu.id} with a recorded outcome. Closing it does not change the delivery record or the person's own report.`, recipientText: "The follow-up on your response was reviewed and closed." }],
      };
    }

    case "rescheduleDeadline":
    case "cancelDeadline": {
      const denied = holderMay();
      if (denied) return denied;
      const d = (s.deadlines ?? []).find((x) => x.id === cmd.deadlineId);
      if (!d) return refuse("not_found", "No such deadline.");
      if (d.status !== "open") return refuse("invalid_state", "Only an open deadline can be changed.");
      if (!config.changeReasons?.some((r) => r.id === cmd.reasonId)) return refuse("reason_required", "A deadline change needs one of the configured reasons.");
      if (cmd.type === "cancelDeadline") {
        return {
          ok: true,
          state: { ...s, deadlines: (s.deadlines ?? []).map((x) => (x.id === d.id ? { ...x, status: "cancelled" as const, closedAt: at, history: [...x.history, { at, kind: "cancelled" as const, from: x.dueAt, to: null, reasonId: cmd.reasonId }] } : x)) },
          drafts: [{ kind: "deadline.cancelled", actionId: d.subject.kind === "action" ? d.subject.actionId : null, audience: deadlineAudience(config, d.defId), text: `The holder cancelled deadline ${d.id} (was due ${d.dueAt} UTC). The step it waited for is not met by this.` }],
        };
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(cmd.dueAt) || Number.isNaN(Date.parse(cmd.dueAt))) return refuse("reason_required", "A new due time must be an absolute UTC instant (ISO 8601 ending in Z).");
      if (Date.parse(cmd.dueAt) <= now.getTime()) return refuse("invalid_state", "A new due time must be later than now. To stop waiting, cancel the deadline instead.");
      if (Date.parse(cmd.dueAt) === Date.parse(d.dueAt)) return refuse("invalid_state", "That is already the due time.");
      return {
        ok: true,
        state: { ...s, deadlines: (s.deadlines ?? []).map((x) => (x.id === d.id ? { ...x, dueAt: new Date(cmd.dueAt).toISOString(), history: [...x.history, { at, kind: "rescheduled" as const, from: x.dueAt, to: new Date(cmd.dueAt).toISOString(), reasonId: cmd.reasonId }] } : x)) },
        drafts: [{ kind: "deadline.rescheduled", actionId: d.subject.kind === "action" ? d.subject.actionId : null, audience: deadlineAudience(config, d.defId), text: `The holder moved deadline ${d.id} from ${d.dueAt} to ${new Date(cmd.dueAt).toISOString()} (UTC). The earlier time stays on record.` }],
      };
    }

    case "linkWork": {
      const denied = holderMay();
      if (denied) return denied;
      const kind = config.linkKinds?.find((k) => k.id === cmd.kindId);
      if (!kind) return refuse("not_found", "This deployment has no such link kind.");
      if (!REFERENCE.test(cmd.reference) || cmd.reference.includes("://")) return refuse("reason_required", "A link needs an identifier in the other system (not a link and not free text).");
      if (!["open", "unknown"].includes(cmd.status)) return refuse("reason_required", "A new link starts as open or unknown.");
      if ((s.links ?? []).some((l) => !l.withdrawn && l.kindId === kind.id && l.reference === cmd.reference)) return refuse("already_open", "That work is already linked.");
      const link: LinkRecord = { id: `LNK-${(s.links ?? []).length + 1}`, kindId: kind.id, reference: cmd.reference, status: cmd.status, openedAt: at, updatedAt: at, updatedBy: by, withdrawn: false };
      return {
        ok: true,
        state: { ...s, links: [...(s.links ?? []), link] },
        drafts: [{ kind: "link.recorded", actionId: null, audience: linkAudience(config, kind.id), text: `${kind.label} (${cmd.reference}) was linked as ${kind.dependency === "required" ? "a required dependency" : "informational work"}, status ${cmd.status}. ${kind.dependency === "required" ? "It blocks the steps configured for it until it is resolved." : "It is shown beside this request and blocks nothing."}` }],
      };
    }

    case "recordLinkStatus": {
      const l = (s.links ?? []).find((x) => x.id === cmd.linkId && !x.withdrawn);
      if (!l) return refuse("not_found", "No such link.");
      const kind = config.linkKinds!.find((k) => k.id === l.kindId)!;
      const m = partyMayAct(config, kind.party, actor, s, now);
      if (!m.ok) return refuse("not_permitted", `Only ${partyOf(config, kind.party).label} records the status of its own work. ${m.reason}`);
      if (l.status === cmd.status) return refuse("invalid_state", "That is already the recorded status.");
      return {
        ok: true,
        state: { ...s, links: (s.links ?? []).map((x) => (x.id === l.id ? { ...x, status: cmd.status, updatedAt: at, updatedBy: by } : x)) },
        drafts: [{ kind: "link.status-recorded", actionId: null, audience: linkAudience(config, kind.id), text: `${kind.label} (${l.reference}) was recorded as ${cmd.status}.${m.attested ? " Recorded on the party's behalf by a member (attested)." : ""} This does not change the state of any step in this request.`, strength: m.attested ? "attested" : "party-recorded" }],
      };
    }

    case "withdrawLink": {
      const denied = holderMay();
      if (denied) return denied;
      const l = (s.links ?? []).find((x) => x.id === cmd.linkId && !x.withdrawn);
      if (!l) return refuse("not_found", "No such link.");
      const kind = config.linkKinds!.find((k) => k.id === l.kindId)!;
      if (kind.dependency === "required") return refuse("not_permitted", "A required dependency cannot be withdrawn by the holder. Only the responsible party can resolve it.");
      return {
        ok: true,
        state: { ...s, links: (s.links ?? []).map((x) => (x.id === l.id ? { ...x, withdrawn: true, updatedAt: at, updatedBy: by } : x)) },
        drafts: [{ kind: "link.withdrawn", actionId: null, audience: linkAudience(config, kind.id), text: `The holder withdrew the link to ${kind.label} (${l.reference}). The other work is not affected.` }],
      };
    }

    default:
      return null;
  }
}
