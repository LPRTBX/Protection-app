import { actionTypeOf, partyOf, policyOf, subjectOf, type DeploymentConfiguration } from "../contracts/config";
import type { CoordinationState, Facts } from "../contracts/orchestration";
import { isLive, ownerOf, recipientEligible, unmetPrerequisites } from "./predicates";
import { recognise, type Recommendation } from "./recognition";
import { triggerHolds } from "./transitions";

/**
 * The coordination plan: what JALDO has prepared, derived on read from the
 * configuration and the recorded facts. Preparing a plan discloses nothing
 * and decides nothing. Each step says whether it is already authorised
 * (standing policy), who must still approve it, what it waits for, and what
 * it would share.
 */

export type StepStatus = "to-prepare" | "prepared" | "awaiting-approval" | "authorised" | "blocked" | "in-progress" | "done" | "unresolved";

export interface PlanStep {
  actionType: string;
  label: string;
  recipientLabel: string;
  actionId: string | null;
  status: StepStatus;
  /** `standing-policy`, or who must approve. */
  authority: string;
  waitingFor: string[];
  wouldShare: string[];
  policy: string;
}

export interface CommunicationIntent {
  templateId: string;
  actionId: string;
  toLabel: string;
  purpose: string;
  /** Always "prepared": the kernel never sends a communication. */
  status: "prepared";
}

export interface CoordinationPlan {
  configVersion: string;
  steps: PlanStep[];
  recovery: Recommendation[];
  communications: CommunicationIntent[];
  /** What a person must do next, and who. Empty means nothing needs anyone now. */
  awaitingHuman: { what: string; who: string }[];
}

export function prepareCoordinationPlan(config: DeploymentConfiguration, s: CoordinationState, facts: Facts): CoordinationPlan {
  const owner = ownerOf(s);
  const awaitingHuman: { what: string; who: string }[] = [];
  if (!owner) {
    awaitingHuman.push({ what: "Accept responsibility for the request after the authority, conflict and capacity checks", who: "The addressed contact" });
    return { configVersion: config.version, steps: [], recovery: [], communications: [], awaitingHuman };
  }
  const own = s.actions.filter((a) => !a.heldBack);
  const types = [...new Set([...config.recognition.plan, ...own.map((a) => a.typeId)])];
  const steps: PlanStep[] = types.map((typeId) => {
    const t = actionTypeOf(config, typeId);
    const a = [...own].reverse().find((x) => x.typeId === typeId && isLive(x)) ?? null;
    const approver = t.standingAuthority ? "standing-policy" : t.approver === "subject" ? subjectOf(config).label : "The request holder";
    const waitingFor = unmetPrerequisites(config, s, typeId);
    let status: StepStatus;
    if (!a) status = recipientEligible(config, typeId, facts).ok ? "to-prepare" : "unresolved";
    else if (a.state === "proposed") status = "prepared";
    else if (a.state === "awaiting_approval") status = "awaiting-approval";
    else if (a.state === "approved") status = waitingFor.length > 0 ? "blocked" : "authorised";
    else if (a.state === "unresolved") status = "unresolved";
    else if (["confirmed", "completed", "declined"].includes(a.state)) status = "done";
    else status = "in-progress";
    if (status === "awaiting-approval") awaitingHuman.push({ what: `Approve ${t.short}`, who: approver });
    if (status === "prepared") awaitingHuman.push({ what: `Put ${t.short} forward for approval, or withdraw it`, who: "The request holder" });
    if (status === "authorised" && !t.standingAuthority) awaitingHuman.push({ what: `Send ${t.short}`, who: "The request holder" });
    if (status === "unresolved") awaitingHuman.push({ what: `Decide what happens with ${t.short}: no authorised recipient can act`, who: "The request holder" });
    return {
      actionType: typeId,
      label: t.label,
      recipientLabel: partyOf(config, t.recipient).label,
      actionId: a?.id ?? null,
      status,
      authority: approver,
      waitingFor,
      wouldShare: t.fields.map((f) => f.label),
      policy: `${policyOf(config, t.policy).label} (${policyOf(config, t.policy).version})`,
    };
  });
  const rec = recognise(config, s, facts, owner);
  const recovery = rec.active.filter((r) => r.ruleId === "capacity-lost-after-acceptance" || r.ruleId === "unavailable-before-acceptance");
  for (const r of recovery) awaitingHuman.push({ what: r.pathway ? `Consider ${r.pathway.label}` : `${r.title}: decide what happens next`, who: "The request holder" });
  for (const r of rec.active.filter((x) => x.ruleId === "expectation-passed")) awaitingHuman.push({ what: r.title, who: "The request holder" });
  const communications: CommunicationIntent[] = config.automation.operations.includes("prepare-communications")
    ? config.communications.flatMap((c) =>
        own
          .filter((a) => a.typeId === c.trigger.actionType && triggerHolds(c.trigger.evidence, a, facts) && !s.released.some((r) => r.templateId === c.id && r.actionId === a.id))
          .map((a) => ({ templateId: c.id, actionId: a.id, toLabel: c.to === "subject" ? subjectOf(config).label : partyOf(config, c.to).label, purpose: c.purpose, status: "prepared" as const })),
      )
    : [];
  for (const c of communications) awaitingHuman.push({ what: `Release the prepared message to ${c.toLabel}, or leave it`, who: "The request holder" });
  return { configVersion: config.version, steps, recovery, communications, awaitingHuman };
}
