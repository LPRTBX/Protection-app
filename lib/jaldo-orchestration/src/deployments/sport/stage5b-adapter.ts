import type { Actor, Scope } from "../../contracts/authority";
import type { Command } from "../../contracts/orchestration";

/**
 * Sport compatibility adapter: maps the Sports Integrity Stage 5B command
 * vocabulary (`LPRTBX/JALDO-Sports-Integrity` @ `94b8567`,
 * `src/state/coordination.ts#CoCmd`) onto the shared kernel, so the Sport
 * app can later replace its in-memory reducer "behind the same command
 * vocabulary" (its own documented seam) without the kernel knowing anything
 * about Sport.
 *
 * Identity changes meaning on the way in. In 5B a command names a simulated
 * persona and is checked against the selected view ("a persona switch is not
 * authentication"). Here every command is taken by an `Actor` the caller has
 * authenticated: Core members for staff, a party's own channel for the
 * parent and services, or a liaison member attesting on a service's behalf
 * where the configuration permits it.
 */

export type StaffId = "morgan" | "jordan";
export type Stage5BActor =
  | { k: "staff"; id: StaffId }
  | { k: "role"; id: "family" | "athlete" | "coach" | "volunteer" }
  | { k: "provider"; id: "wellbeing" | "supporter" }
  | { k: "ops" };

export type Stage5BCommand =
  | { type: "coIntakeConfirm"; nonce: string }
  | { type: "coAccept"; by: StaffId; checks: { authority: boolean; noConflict: boolean; capacity: boolean } }
  | { type: "coRoute"; by: StaffId; checks: { recipient: boolean; purpose: boolean; fields: boolean; authority: boolean } }
  | { type: "coPropose"; by: StaffId; typeId: string; from?: string }
  | { type: "coDismiss"; by: StaffId; recId: string }
  | { type: "coInform"; by: StaffId; actionId: string }
  | { type: "coSubmit"; by: StaffId; id: string }
  | { type: "coWithdraw"; by: StaffId; id: string }
  | { type: "coSend"; by: StaffId; id: string }
  | { type: "coRecheck"; by: StaffId; id: string }
  | { type: "coApprove"; actor: Stage5BActor; id: string; checks: { recipient: boolean; purpose: boolean; fields: boolean; authority: boolean } }
  | { type: "coRefuse"; actor: Stage5BActor; id: string }
  | { type: "coReceive"; actor: Stage5BActor; id: string }
  | { type: "coConfirm"; actor: Stage5BActor; id: string }
  | { type: "coRespond"; actor: Stage5BActor; id: string; answer: "accept" | "decline"; reason?: string; checks?: { scope: boolean; conflict: boolean; capacity: boolean; noReask?: boolean } }
  | { type: "coComplete"; actor: Stage5BActor; id: string; outcomeId?: string }
  | { type: "coSim"; kind: "unavailable" | "restore"; who: string }
  | { type: "coAdvance" }
  | { type: "coRelease"; actor: Stage5BActor };

/** 5B party ids → configuration party keys. */
export const SPORT_PARTIES: Record<string, string> = {
  family: "parent",
  wellbeing: "wellbeing",
  supporter: "support-person",
  ops: "operations",
  jordan: "integrity-review",
};

/** 5B recommendation ids use `capacity-accepted`; the kernel names the rule `capacity-lost-after-acceptance`. */
export const toKernelRecommendationId = (id: string) => id.replace(/^capacity-accepted:/, "capacity-lost-after-acceptance:");
export const toStage5BRecommendationId = (id: string) => id.replace(/^capacity-lost-after-acceptance:/, "capacity-accepted:");

export interface AdapterContext {
  scope: Scope;
  /** Authenticated Core members standing in for 5B staff personas. */
  members: Record<StaffId, Actor>;
  /** A member who may record a service's response on its behalf (where the configuration permits). Null: parties use their own channel. */
  liaison: ((partyKey: string) => Actor) | null;
  /** The routing target the 5B reducer would compute (`coRouteTarget`); the kernel never chooses one itself. */
  routeTarget?: string;
}

export type Translation =
  | { kind: "command"; command: Command; actor: Actor }
  | { kind: "fact"; fact: { unavailable: string } | { available: string } | { holderUnavailable: string } | { holderAvailable: string } | { holderUnavailable: string; unavailable: string } | { holderAvailable: string; available: string } | { advanceDays: 1 } }
  | { kind: "open-request" }
  | { kind: "unsupported"; reason: string };

function partyActor(ctx: AdapterContext, a: Stage5BActor): Actor | null {
  if (a.k === "staff") return a.id === "jordan" ? partyOrLiaison(ctx, "integrity-review") : ctx.members[a.id];
  if (a.k === "role") return a.id === "family" ? { kind: "party", key: "parent", scope: ctx.scope } : null;
  if (a.k === "provider") return partyOrLiaison(ctx, SPORT_PARTIES[a.id]);
  return partyOrLiaison(ctx, "operations");
}

function partyOrLiaison(ctx: AdapterContext, key: string): Actor {
  return ctx.liaison ? ctx.liaison(key) : { kind: "party", key, scope: ctx.scope };
}

/** Approvals and confirmations by the parent are the parent's own; staff approvals are the holder's. */
function approverActor(ctx: AdapterContext, a: Stage5BActor): Actor | null {
  if (a.k === "role" && a.id === "family") return { kind: "party", key: "parent", scope: ctx.scope };
  if (a.k === "staff") return ctx.members[a.id];
  return null;
}

export function translate(cmd: Stage5BCommand, ctx: AdapterContext): Translation {
  switch (cmd.type) {
    case "coIntakeConfirm":
      return { kind: "open-request" };
    case "coAccept":
      return { kind: "command", command: { type: "acceptRequest", checks: cmd.checks }, actor: ctx.members[cmd.by] };
    case "coRoute":
      if (!ctx.routeTarget) return { kind: "unsupported", reason: "No eligible routing target; the kernel never invents one." };
      return { kind: "command", command: { type: "routeRequest", to: ctx.routeTarget, checks: cmd.checks }, actor: ctx.members[cmd.by] };
    case "coPropose":
      if (cmd.typeId === "athlete-offer") return { kind: "unsupported", reason: "The athlete offer is not carried over pending specialist review." };
      return { kind: "command", command: { type: "propose", actionType: cmd.typeId, ...(cmd.from ? { fromRecommendation: toKernelRecommendationId(cmd.from) } : {}) }, actor: ctx.members[cmd.by] };
    case "coDismiss":
      return { kind: "command", command: { type: "dismissRecommendation", recommendationId: toKernelRecommendationId(cmd.recId) }, actor: ctx.members[cmd.by] };
    case "coInform":
      return { kind: "command", command: { type: "releaseCommunication", templateId: "support-interrupted", actionId: cmd.actionId }, actor: ctx.members[cmd.by] };
    case "coSubmit":
      return { kind: "command", command: { type: "submit", actionId: cmd.id }, actor: ctx.members[cmd.by] };
    case "coWithdraw":
      return { kind: "command", command: { type: "withdraw", actionId: cmd.id }, actor: ctx.members[cmd.by] };
    case "coSend":
      return { kind: "command", command: { type: "execute", actionId: cmd.id }, actor: ctx.members[cmd.by] };
    case "coRecheck":
      return { kind: "command", command: { type: "recheck", actionId: cmd.id }, actor: ctx.members[cmd.by] };
    case "coApprove":
    case "coRefuse": {
      const actor = approverActor(ctx, cmd.actor);
      if (!actor) return { kind: "unsupported", reason: "Only the holder or the parent approves." };
      return { kind: "command", command: cmd.type === "coApprove" ? { type: "approve", actionId: cmd.id, checks: cmd.checks } : { type: "refuse", actionId: cmd.id }, actor };
    }
    case "coConfirm": {
      const actor = approverActor(ctx, cmd.actor);
      if (!actor) return { kind: "unsupported", reason: "Only the configured confirmer confirms." };
      return { kind: "command", command: { type: "confirm", actionId: cmd.id }, actor };
    }
    case "coReceive":
    case "coRespond":
    case "coComplete": {
      const actor = partyActor(ctx, cmd.actor);
      if (!actor) return { kind: "unsupported", reason: "A young person's own choices are not carried over." };
      if (cmd.type === "coReceive") return { kind: "command", command: { type: "receive", actionId: cmd.id }, actor };
      if (cmd.type === "coComplete") return { kind: "command", command: { type: "complete", actionId: cmd.id, ...(cmd.outcomeId ? { outcomeId: cmd.outcomeId } : {}) }, actor };
      if (cmd.type !== "coRespond") return { kind: "unsupported", reason: "Unknown response." };
      return cmd.answer === "accept"
        ? { kind: "command", command: { type: "accept", actionId: cmd.id, checks: { scope: !!cmd.checks?.scope, conflict: !!cmd.checks?.conflict, capacity: !!cmd.checks?.capacity }, noReask: !!cmd.checks?.noReask }, actor }
        : { kind: "command", command: { type: "decline", actionId: cmd.id, reasonId: cmd.reason ?? "" }, actor };
    }
    case "coSim":
      // The second contact is both an eligible holder (routing target) and the review recipient party (SPORT_PARTIES.jordan). In the 5B reducer one
      // "unavailable" mark removes both, so both facts must be returned together; returning only the holder side leaves a review proposed to an unavailable recipient.
      if (cmd.who === "jordan") return { kind: "fact", fact: cmd.kind === "unavailable" ? { holderUnavailable: "jordan", unavailable: SPORT_PARTIES.jordan } : { holderAvailable: "jordan", available: SPORT_PARTIES.jordan } };
      return { kind: "fact", fact: cmd.kind === "unavailable" ? { unavailable: SPORT_PARTIES[cmd.who] } : { available: SPORT_PARTIES[cmd.who] } };
    case "coAdvance":
      return { kind: "fact", fact: { advanceDays: 1 } };
    case "coRelease":
      return { kind: "unsupported", reason: "A general note to every coach (a role-group broadcast) is not in contract 1.0.0; proposed as a minor version." };
  }
}
