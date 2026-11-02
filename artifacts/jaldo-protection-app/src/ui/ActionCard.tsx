import { TRACK, TRACK_LABEL, trackSlot, type Stage, type TrackStage } from "../sim/stage";
import type { Offer } from "../sim/views";
import { Btn, ReviewedButton, StageChip } from "./parts";

/** The lifecycle track: the words in order, the furthest reached filled, the current one marked. Words, not only colour. */
export function Track({ reached, current }: { reached: TrackStage; current: Stage }) {
  const ri = TRACK.indexOf(reached);
  const slot = trackSlot(current);
  return (
    <ol className="track" aria-label="Lifecycle: proposed, approved, sent, received or accepted, applied as reported, confirmed by a simulated read-back">
      {TRACK.map((s, i) => (
        <li key={s} className={`${ri >= i ? "done" : ""} ${slot === s ? "current" : ""}`} aria-current={slot === s ? "step" : undefined}>
          <span className="track-dot" aria-hidden="true" />
          <span className="track-word">{TRACK_LABEL[s]}</span>
          {slot === s ? <span className="sr-only"> (current)</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function Offers({ offers, onRun, extra }: { offers: Offer[]; onRun: (key: string) => void; extra?: React.ReactNode }) {
  if (offers.length === 0 && !extra) return null;
  return (
    <div className="offers">
      {offers.map((o) =>
        o.checks ? (
          <ReviewedButton key={o.key} label={o.label} items={o.checks} disabledReason={o.disabledReason} onConfirm={() => onRun(o.key)} tone={o.tone} />
        ) : (
          <div key={o.key} className="offer">
            <Btn tone={o.tone} disabled={!!o.disabledReason} onClick={() => onRun(o.key)} describedBy={o.disabledReason ? `why-${o.key.replace(/[^a-z0-9]/gi, "-")}` : undefined}>{o.label}</Btn>
            {o.disabledReason ? <span className="hint" id={`why-${o.key.replace(/[^a-z0-9]/gi, "-")}`}>{o.disabledReason}</span> : null}
          </div>
        ),
      )}
      {extra}
    </div>
  );
}

export function StageLine({ stage, label, detail, notYetAccepted }: { stage: Stage; label: string; detail: string; notYetAccepted: boolean }) {
  return (
    <div className="stage-line">
      <StageChip stage={stage} label={label} />
      {notYetAccepted ? <span className="flag">Not yet accepted</span> : null}
      <p className="muted">{detail}</p>
    </div>
  );
}
