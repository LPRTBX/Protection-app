import type { OperatorAction, OperatorView } from "../../sim/views";
import { classifyAction } from "../decisions";

/**
 * Follow-through, read from the reviewer's own projection. An action is placed by its existing stage and offers; nothing is
 * inferred. "Approved" and "sent" are the reviewer's steps; whether another system received, accepted or applied it is a separate
 * fact the stage already carries, and an outcome is not confirmed until the simulated read-back matches and the reviewer records it.
 */
export type FollowGroup = "needs-you" | "with-others" | "held" | "confirmed" | "closed";

const WITH_OTHERS = new Set(["sent", "acknowledged", "applied", "retry", "unresolved"]);

export function followGroup(a: Pick<OperatorAction, "stage" | "offers" | "waitingFor" | "stageDetail">): FollowGroup {
  const c = classifyAction(a);
  if (a.stage === "confirmed") return "confirmed";
  if (a.stage === "closed") return "closed";
  if (c.group === "available") return "needs-you";
  return WITH_OTHERS.has(a.stage) ? "with-others" : "held";
}

export interface Follow {
  groups: Record<FollowGroup, OperatorAction[]>;
  /** Everything authorised or sent that is not confirmed: what the reviewer must not treat as done. */
  unconfirmed: OperatorAction[];
}

export function followThrough(v: OperatorView): Follow {
  const groups: Record<FollowGroup, OperatorAction[]> = { "needs-you": [], "with-others": [], held: [], confirmed: [], closed: [] };
  for (const a of v.actions) groups[followGroup(a)].push(a);
  const unconfirmed = v.actions.filter((a) => ["sent", "acknowledged", "applied", "retry", "unresolved"].includes(a.stage));
  return { groups, unconfirmed };
}
