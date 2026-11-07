import type { Offer, OperatorAction, OperatorView, OpsRow } from "../sim/views";

/**
 * Presentation-only grouping of what a person can do. It reads the offers, disabled reasons and stages the views already
 * produce from kernel state and eligibility. It adds no rule: an item is "available" only when the view already offers an
 * enabled primary decision, "waiting" when the view says it is blocked or sits with another system, and "done" when the
 * lifecycle is terminal.
 */
export type Group = "available" | "waiting" | "done";

/** The first enabled primary offer: the decision a person could take right now. */
export const availableOffer = (offers: readonly Offer[]): Offer | null => offers.find((o) => o.tone === "primary" && !o.disabledReason) ?? null;
/** Why the primary decision cannot be taken now, in the view's own words. */
export const blockedReason = (offers: readonly Offer[]): string | null => offers.find((o) => o.tone === "primary" && o.disabledReason)?.disabledReason ?? null;

const TERMINAL = new Set(["confirmed", "closed"]);

export interface Classified { group: Group; blocker: string | null; available: string | null }

export function classifyAction(a: Pick<OperatorAction, "stage" | "offers" | "waitingFor" | "stageDetail">): Classified {
  if (TERMINAL.has(a.stage)) return { group: "done", blocker: null, available: null };
  const open = availableOffer(a.offers);
  if (open) return { group: "available", blocker: null, available: open.label };
  const reason = blockedReason(a.offers) ?? (a.waitingFor.length ? `Waiting for: ${a.waitingFor.join("; ")}.` : a.stageDetail);
  return { group: "waiting", blocker: reason, available: null };
}

export function classifyOffers(offers: readonly Offer[], fallback: string): Classified {
  const open = availableOffer(offers);
  if (open) return { group: "available", blocker: null, available: open.label };
  return { group: "waiting", blocker: blockedReason(offers) ?? fallback, available: null };
}

export function classifyOpsRow(r: Pick<OpsRow, "stage" | "nextStep" | "readBack" | "unknownSend" | "waitingFor" | "stageDetail">): Classified {
  if (TERMINAL.has(r.stage)) return { group: "done", blocker: null, available: null };
  if (r.unknownSend) return { group: "available", blocker: null, available: "Record what the receiving system's log shows" };
  if (r.nextStep && !r.nextStep.disabledReason) return { group: "available", blocker: null, available: r.nextStep.label };
  if (r.readBack.available) return { group: "available", blocker: null, available: "Run simulated read-back" };
  const reason = r.nextStep?.disabledReason ?? (r.waitingFor.length ? `Waiting for: ${r.waitingFor.join("; ")}.` : r.stageDetail);
  return { group: "waiting", blocker: reason, available: null };
}

export interface NextItem {
  what: string;
  who: string;
  /** available: the matching decision can be taken now. blocked: it exists but cannot be completed now. other: named by the plan, availability not stated. */
  state: "available" | "blocked" | "other";
  reason: string | null;
  /** Element id of the decision, when the plan item can be matched to one. */
  target: string | null;
}

/**
 * Annotates the kernel plan's "what needs a person next" with whether each item can be done now. Matching is by the plan's own
 * wording ("Approve <action>", "Send <action>", "Release the prepared message ..."). An item that cannot be matched is kept and
 * marked "other": it is never presented as available or as blocked.
 */
export function nextGuidance(v: OperatorView): NextItem[] {
  const byShort = (name: string, pred: (a: OperatorAction) => boolean) => v.actions.find((a) => a.short === name && pred(a));
  const messages = [...v.messages];
  const out: NextItem[] = v.next.map((n) => {
    const base = { what: n.what, who: n.who };
    let m: RegExpMatchArray | null;
    if ((m = n.what.match(/^Approve (.+)$/))) {
      const a = byShort(m[1], (x) => x.offers.some((o) => o.key === "approve"));
      const o = a?.offers.find((x) => x.key === "approve");
      if (a && o) return o.disabledReason ? { ...base, state: "blocked", reason: o.disabledReason, target: `action-${a.id}` } : { ...base, state: "available", reason: null, target: `action-${a.id}` };
    } else if ((m = n.what.match(/^Put (.+) forward for approval/))) {
      const a = byShort(m[1], (x) => x.offers.some((o) => o.key === "submit"));
      if (a) return { ...base, state: "available", reason: null, target: `action-${a.id}` };
    } else if ((m = n.what.match(/^Send (.+)$/))) {
      const a = byShort(m[1], (x) => x.offers.some((o) => o.key === "dispatch"));
      const o = a?.offers.find((x) => x.key === "dispatch");
      if (a && o) return o.disabledReason ? { ...base, state: "blocked", reason: o.disabledReason, target: `action-${a.id}` } : { ...base, state: "available", reason: null, target: `action-${a.id}` };
    } else if (n.what.startsWith("Release the prepared message")) {
      const msg = messages.shift();
      if (msg) return msg.offer.disabledReason ? { ...base, state: "blocked", reason: msg.offer.disabledReason, target: `message-${msg.templateId}-${msg.actionId}` } : { ...base, state: "available", reason: null, target: `message-${msg.templateId}-${msg.actionId}` };
    } else if (n.what.startsWith("Accept responsibility")) {
      const o = v.offers.find((x) => x.key === "accept");
      if (o) return { ...base, state: o.disabledReason ? "blocked" : "available", reason: o.disabledReason ?? null, target: "responsibility" };
    }
    return { ...base, state: "other", reason: null, target: null };
  });
  const rank = { available: 0, other: 1, blocked: 2 } as const;
  return out.map((x, i) => ({ x, i })).sort((p, q) => rank[p.x.state] - rank[q.x.state] || p.i - q.i).map((p) => p.x);
}

/** Policies that name this action, so its own requirements can be shown with it. */
export const policiesFor = (v: OperatorView, a: Pick<OperatorAction, "short">) => v.policies.filter((p) => p.appliesTo.includes(a.short));

/** Request fields already covered by the summary or the provenance section; shown once. */
export const COVERED_BY_SUMMARY = new Set(["Length of break", "Contact choice", "Source reference", "Source", "Where this came from"]);
export const requestDetailRows = (v: OperatorView) => (v.request?.fields ?? []).filter((f) => !COVERED_BY_SUMMARY.has(f.label));

/** "Prepare" offers that are not a decision on an existing action; each is shown with its own availability. */
export const looseOffers = (v: OperatorView): Offer[] => v.offers.filter((o) => o.key.startsWith("propose:") || (o.key === "prepare" && v.actions.length === 0));

const classifyLoose = (o: Offer): Classified => (o.disabledReason ? { group: "waiting", blocker: o.disabledReason, available: null } : { group: "available", blocker: null, available: o.label });

/** Every item the reviewer could decide on, classified once, so the decisions panel and the "My work" counts cannot disagree. */
export function classifyView(v: OperatorView) {
  return {
    corrections: v.corrections.map((c) => classifyOffers(c.offers, "A separately authorised correction is the permitted next action.")),
    recommendations: v.recommendations.map((r) => classifyOffers(r.offers, r.why)),
    messages: v.messages.map((m) => classifyOffers([m.offer], "Not available yet.")),
    actions: v.actions.map((a) => classifyAction(a)),
    loose: looseOffers(v).map(classifyLoose),
  };
}

export function decisionCounts(v: OperatorView): Record<Group, number> {
  const c = classifyView(v);
  const all = [...c.corrections, ...c.recommendations, ...c.messages, ...c.actions, ...c.loose];
  return { available: all.filter((x) => x.group === "available").length, waiting: all.filter((x) => x.group === "waiting").length, done: all.filter((x) => x.group === "done").length };
}
