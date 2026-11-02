import { actionTypeOf, partyOf, subjectOf, type DeploymentConfiguration } from "../contracts/config";
import {
  WRITE_OPERATIONS,
  type Actor,
  type ActorRecord,
  type AuthorityDecision,
  type Grant,
  type Operation,
  type Scope,
} from "../contracts/authority";
import type { EvidenceStrength } from "../contracts/evidence";
import type { CoordinationState, GovernedAction } from "../contracts/orchestration";
import { ownerOf, unmetPrerequisites } from "./predicates";

/**
 * Authority evaluation. Deny by default: an operation is allowed only when
 * the actor is in the same organisation and deployment, holds a currently
 * active (unexpired, unrevoked) responsibility grant whose configured role
 * permits it, and — for writes — has a Core role that may write. There is no
 * implicit supervisory, line-management, family or guardian authority anywhere.
 * Authority is evaluated again at execution, not only at recommendation.
 */

const sameScope = (a: Scope, b: Scope) => a.organisationId === b.organisationId && a.deploymentId === b.deploymentId;

const deny = (configVersion: string, ...reasons: string[]): AuthorityDecision => ({
  outcome: "denied",
  reasons,
  requiredApprovals: [],
  basis: null,
});

export function grantActive(g: Grant, now: Date): boolean {
  if (g.revokedAt !== null && new Date(g.revokedAt).getTime() <= now.getTime()) return false;
  if (g.expiresAt !== null && new Date(g.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

/** Which kernel operations the system actor may perform, from the configured automation. */
function systemMay(config: DeploymentConfiguration, op: Operation): boolean {
  const auto = config.automation.operations;
  if (op === "prepare") return auto.includes("prepare-plan");
  if (op === "approve" || op === "execute") return auto.includes("execute-standing-authority");
  if (op === "record-capacity") return auto.includes("reconcile-status");
  return false;
}

export function evaluateAuthority(
  config: DeploymentConfiguration,
  actor: Actor,
  op: Operation,
  scope: Scope,
  now: Date,
): AuthorityDecision {
  if (!sameScope(actor.scope, scope)) return deny(config.version, "Not available in this deployment.");
  if (actor.kind === "party") return deny(config.version, "A party acts only on its own steps.");
  if (actor.kind === "system") {
    return systemMay(config, op)
      ? { outcome: "allowed", reasons: [], requiredApprovals: [], basis: { responsibility: null, configVersion: config.version, policyVersions: [] } }
      : deny(config.version, "This step is not configured for automation.");
  }
  if (WRITE_OPERATIONS.includes(op) && actor.coreRole === "reviewer") return deny(config.version, "Your Core role is read-only.");
  const roles = new Map(config.roles.map((r) => [r.id, r]));
  const permitting = actor.grants.filter((g) => roles.get(g.responsibility)?.operations.includes(op));
  const active = permitting.find((g) => grantActive(g, now));
  if (!active) {
    if (permitting.length > 0) return deny(config.version, "Your responsibility for this step has expired or been revoked.");
    return deny(config.version, "You do not hold a responsibility that permits this step.");
  }
  return {
    outcome: "allowed",
    reasons: [],
    requiredApprovals: [],
    basis: { responsibility: active.responsibility, configVersion: config.version, policyVersions: config.policies.map((p) => `${p.id}@${p.version}`) },
  };
}

export function actorRecord(actor: Actor): ActorRecord {
  if (actor.kind === "member") return { kind: "member", id: actor.id, onBehalfOf: actor.onBehalfOf ?? null };
  if (actor.kind === "party") return { kind: "party", id: actor.key, onBehalfOf: null };
  return { kind: "system", id: "jaldo-os", onBehalfOf: null };
}

export function strengthOf(actor: Actor): EvidenceStrength {
  if (actor.kind === "system") return "system-recorded";
  if (actor.kind === "party") return "party-recorded";
  return actor.onBehalfOf ? "attested" : "actor-recorded";
}

/** An authenticated member acting in their own right (not on anyone's behalf). */
export function isMemberSelf(actor: Actor, id: string | null): boolean {
  return id !== null && actor.kind === "member" && !actor.onBehalfOf && actor.id === id;
}

export type PartyAct = { ok: true; attested: boolean } | { ok: false; reason: string };

/**
 * Whether `actor` may act as party `key`: the party through its own channel
 * (not revoked, same deployment), or — only where the configuration permits
 * attestation for that party — a member with the `record-party-response`
 * responsibility recording on the party's behalf. The request owner may never
 * attest a party's response to the owner's own work (separation of duties).
 */
export function partyMayAct(
  config: DeploymentConfiguration,
  key: string,
  actor: Actor,
  state: CoordinationState,
  now: Date,
): PartyAct {
  if (actor.kind === "system") return { ok: false, reason: "The kernel never acts for a party." };
  if (actor.kind === "party") {
    if (actor.key !== key) return { ok: false, reason: "Only the named party may take this step." };
    if (!sameScope(actor.scope, state.scope)) return { ok: false, reason: "Not available in this deployment." };
    if (actor.revokedAt && new Date(actor.revokedAt).getTime() <= now.getTime()) return { ok: false, reason: "This channel has been revoked." };
    return { ok: true, attested: false };
  }
  if (actor.onBehalfOf !== key) return { ok: false, reason: "Only the named party may take this step." };
  if (partyOf(config, key).attestation !== "permitted") {
    return { ok: false, reason: "This party must act through its own channel; it cannot be recorded on its behalf." };
  }
  if (actor.id === ownerOf(state)) {
    return { ok: false, reason: "The request holder cannot record a response to their own action on another party's behalf." };
  }
  const auth = evaluateAuthority(config, actor, "record-party-response", state.scope, now);
  if (auth.outcome !== "allowed") return { ok: false, reason: auth.reasons.join(" ") };
  return { ok: true, attested: true };
}

/**
 * Whether `actor` may execute `action` now. Re-evaluated at execution time:
 * the actor's grant, the approval (and the configuration version it was given
 * under) and the action's prerequisites must all hold at that moment.
 */
export function evaluateExecutionAuthority(
  config: DeploymentConfiguration,
  state: CoordinationState,
  action: GovernedAction,
  actor: Actor,
  now: Date,
): AuthorityDecision {
  const type = actionTypeOf(config, action.typeId);
  const viaSystem = actor.kind === "system";
  if (viaSystem && !type.standingAuthority) return deny(config.version, "Only standing-authority steps run without a person.");
  if (!viaSystem && !isMemberSelf(actor, ownerOf(state))) return deny(config.version, "Only the member who owns this request may execute its actions.");
  const auth = evaluateAuthority(config, actor, "execute", state.scope, now);
  if (auth.outcome !== "allowed") return auth;
  if (action.approval === null || action.state !== "approved") {
    const who = type.approver === "subject" ? subjectOf(config).label : "The request holder";
    return { outcome: "human_review_required", reasons: ["This action has not been approved."], requiredApprovals: [who], basis: null };
  }
  if (action.approval.configVersion !== state.config.version) {
    return { outcome: "human_review_required", reasons: ["The approval was given under an earlier configuration."], requiredApprovals: ["A fresh approval"], basis: null };
  }
  const unmet = unmetPrerequisites(config, state, action.typeId);
  if (unmet.length > 0) return deny(config.version, `Waiting for: ${unmet.join(", ")}.`);
  return auth;
}
