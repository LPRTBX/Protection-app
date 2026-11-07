import type { ProtectionWorld } from "../../sim/session";
import { customerView, operationsView, operatorView } from "../../sim/views";

/**
 * What changed in each role's own screen. A snapshot is a pure function of ONE role's existing projection, keyed by the item the
 * screen shows (a status, an action, an update). Diffing two snapshots says which of that role's items changed after a real
 * interaction. Nothing here reads another role's projection, so a change indicator can never carry another role's information
 * into a panel, and no highlight is ever scripted: an item is only reported when the projection it comes from really changed.
 */
export type PanelId = "customer" | "reviewer" | "operations";
export interface Entry { sig: string; label: string }
export type Snap = Record<string, Entry>;
export interface Change { key: string; label: string }

const PART_WORD = { "not-started": "not confirmed yet", applying: "sent, not confirmed yet", confirmed: "confirmed", unconfirmed: "still open" } as const;

export function customerSnapshot(w: ProtectionWorld): Snap {
  const v = customerView(w);
  const s: Snap = {};
  if (v.hasRequest) s.request = { sig: v.requested, label: "Your request was sent" };
  s.headline = { sig: `${v.headline.title}|${v.headline.body}`, label: `Status: ${v.headline.title}` };
  for (const p of v.parts) s[`part:${p.id}`] = { sig: `${p.status}|${p.text}`, label: `${p.label}: ${PART_WORD[p.status]}` };
  for (const u of v.updates) s[`update:${u.id}`] = { sig: `${u.title}|${u.body}`, label: `New update: ${u.title}` };
  if (v.invitation) s.invitation = { sig: "shown", label: "A message arrived" };
  return s;
}

export function reviewerSnapshot(w: ProtectionWorld): Snap {
  const v = operatorView(w);
  const s: Snap = {};
  if (v.request) s.request = { sig: `${v.status}|${v.request.ref}`, label: v.status === "awaiting_acceptance" ? `New request ${v.request.ref} is waiting` : `Request ${v.request.ref}: responsibility taken` };
  for (const a of v.actions) s[`action:${a.id}`] = { sig: `${a.stage}|${a.stageDetail}|${a.authorisedBy ?? ""}|${a.attempts.length}|${a.offers.map((o) => `${o.key}${o.disabledReason ? "!" : ""}`).join(",")}`, label: `${a.short}: ${a.stageLabel}` };
  for (const m of v.messages) s[`message:${m.templateId}-${m.actionId}`] = { sig: `${m.body}|${m.offer.disabledReason ?? ""}`, label: "A customer message is ready to release" };
  for (const r of v.recommendations) s[`recommendation:${r.id}`] = { sig: r.title, label: r.title };
  for (const c of v.corrections) s[`correction:${c.actionId}`] = { sig: c.reported, label: `${c.protection}: reported applied, not confirmed` };
  s.next = { sig: v.next.map((n) => n.what).join("|"), label: "What needs a person next changed" };
  return s;
}

export function operationsSnapshot(w: ProtectionWorld): Snap {
  const v = operationsView(w);
  const s: Snap = {};
  for (const r of [...v.account, ...v.marketing, ...v.support, ...v.delivery, ...v.clarification]) {
    s[`row:${r.id}`] = { sig: `${r.stage}|${r.stageDetail}|${r.attempts.length}|${r.nextStep?.label ?? ""}|${r.readBack.available}|${r.unknownSend ? "unknown" : ""}|${r.systemUnavailable}`, label: `${r.short}: ${r.stageLabel}` };
  }
  for (const g of v.gaps) s[`gap:${g.id}`] = { sig: g.what, label: g.what };
  for (const sys of v.systems) s[`system:${sys.key}`] = { sig: String(sys.unavailable), label: `${sys.label}: ${sys.unavailable ? "recorded as unavailable" : "available"}` };
  return s;
}

export const snapshotOf = (panel: PanelId, w: ProtectionWorld): Snap => (panel === "customer" ? customerSnapshot(w) : panel === "reviewer" ? reviewerSnapshot(w) : operationsSnapshot(w));

/** Items that are new or whose content changed. An item that disappeared is not reported: it has nothing left to highlight. */
export function diffSnapshots(prev: Snap, next: Snap): Change[] {
  const out: Change[] = [];
  for (const [key, e] of Object.entries(next)) if (!prev[key] || prev[key].sig !== e.sig) out.push({ key, label: e.label });
  return out;
}
