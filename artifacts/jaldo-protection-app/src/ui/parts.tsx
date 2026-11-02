import { useId, useState, type ReactNode } from "react";
import { STAGE_LABEL, type Stage } from "../sim/stage";
import type { Outcome } from "../sim/session";

/** The three honest statuses. Text carries the meaning; colour only reinforces it. */
export type Status = "implemented" | "simulation" | "future";
const STATUS_TEXT: Record<Status, { short: string; long: string }> = {
  implemented: { short: "Runs the shared kernel", long: "Runs the real shared kernel in this browser" },
  simulation: { short: "Fictional simulation", long: "Fictional simulation: invented data and stand-in systems" },
  future: { short: "Future capability", long: "Future capability: not built, and not emulated" },
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`chip chip-${status}`} title={STATUS_TEXT[status].long} data-status={status}>
      <span aria-hidden="true" className="chip-mark">{status === "implemented" ? "●" : status === "simulation" ? "◐" : "○"}</span>
      {STATUS_TEXT[status].short}
    </span>
  );
}

const STAGE_MARK: Record<Stage, string> = { proposed: "○", approved: "◔", waiting: "◑", retry: "↻", sent: "➤", acknowledged: "◕", applied: "●", confirmed: "✔", unresolved: "!", closed: "–" };
/** A lifecycle word with a shape and the word itself, never colour alone. */
export function StageChip({ stage, label }: { stage: Stage; label?: string }) {
  return (
    <span className={`stage stage-${stage}`} data-stage={stage}>
      <span aria-hidden="true" className="stage-mark">{STAGE_MARK[stage]}</span>
      {label ?? STAGE_LABEL[stage]}
    </span>
  );
}

export function Panel({ title, status, intro, children, id, level = 2, actions }: { title: string; status?: Status; intro?: ReactNode; children: ReactNode; id?: string; level?: 2 | 3; actions?: ReactNode }) {
  const hid = useId();
  const H = (level === 2 ? "h2" : "h3") as "h2" | "h3";
  return (
    <section className="panel" aria-labelledby={hid} id={id} data-status={status}>
      <header className="panel-head">
        <H id={hid}>{title}</H>
        {status ? <StatusChip status={status} /> : null}
        {actions}
      </header>
      {intro ? <p className="panel-intro">{intro}</p> : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function DefList({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="deflist">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function Btn({ children, onClick, tone = "quiet", disabled, describedBy, type = "button" }: { children: ReactNode; onClick?: () => void; tone?: "primary" | "quiet"; disabled?: boolean; describedBy?: string; type?: "button" | "submit" }) {
  return <button type={type} className={`btn btn-${tone}`} onClick={onClick} disabled={disabled} aria-describedby={describedBy}>{children}</button>;
}

/** A button that stays disabled until a person has ticked every check. Never pre-ticked. */
export function ReviewedButton({ label, items, onConfirm, disabledReason, tone = "primary" }: { label: string; items: readonly string[]; onConfirm: () => void; disabledReason?: string; tone?: "primary" | "quiet" }) {
  const [ticked, setTicked] = useState<boolean[]>(() => items.map(() => false));
  const all = ticked.every(Boolean);
  const gid = useId();
  return (
    <fieldset className="review" disabled={!!disabledReason}>
      <legend>Before you decide, check each:</legend>
      {items.map((it, i) => (
        <label key={it} className="check">
          <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />
          <span>{it}</span>
        </label>
      ))}
      <button type="button" className={`btn btn-${tone}`} disabled={!all || !!disabledReason} aria-describedby={`${gid}-hint`} onClick={() => { onConfirm(); setTicked(items.map(() => false)); }}>
        {label}
      </button>
      <span id={`${gid}-hint`} className="hint">{disabledReason ?? (all ? "All checks made." : "Tick every check to enable this.")}</span>
    </fieldset>
  );
}

/** The last result of a step: the kernel's own words. Refusals are announced assertively, successes politely. */
export function Result({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return <div className="live" role="status" aria-live="polite" />;
  return outcome.ok ? (
    <div className="live" role="status" aria-live="polite">Done. {outcome.note}</div>
  ) : (
    <div className="live refused" role="alert"><strong>Not allowed.</strong> {outcome.message}</div>
  );
}

export function useOutcome(): [Outcome | null, (o: Outcome) => void] {
  const [o, setO] = useState<Outcome | null>(null);
  return [o, setO];
}

/** Marks the sentence as a standing disclaimer so the privacy and wording tests can recognise it. */
export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="note" data-disclaimer>{children}</p>;
}
