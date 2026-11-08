import { useState } from "react";
import { BEHAVIOURS, BEHAVIOUR_LABEL, READ_BACKS, READ_BACK_LABEL, type ConnectorKey } from "../../sim/connectors";
import { operationsView, type OpsRow } from "../../sim/views";
import type { OpenMap } from "../Decisions";
import { classifyOpsRow } from "../decisions";
import { EvidenceLogs, GapsPanel, OverviewPanel, Row } from "../Operations";
import { DefList, Result, useOutcome } from "../parts";
import { useWorld } from "../world";
import { PanelFrame, scrollPanelToTop, type FrameProps } from "./PanelFrame";

type Tab = "systems" | "open" | "evidence";
const TABS: { tab: Tab; label: string }[] = [
  { tab: "systems", label: "Systems" },
  { tab: "open", label: "Still open" },
  { tab: "evidence", label: "Evidence" },
];
/** The two destinations every break request is sent to; others appear once something is sent to them. */
const ALWAYS = new Set<ConnectorKey>(["account-controls", "marketing-suppression"]);

/**
 * Operations and the connected systems, reading only the Operations projection. Operations staff see what each system was sent and
 * what came back. The simulated destination controls beside each system are played by the demonstration: they are not Operations
 * staff and not the reviewer, and nothing the reviewer does presses them.
 */
export function OpsPanel(props: Omit<FrameProps, "id" | "title" | "sees" | "children" | "nav" | "footer">) {
  const w = useWorld();
  const v = operationsView(w);
  const [tab, setTab] = useState<Tab>("systems");
  const [open, setOpen] = useState<OpenMap>({});
  const [outcome, setOutcome] = useOutcome();
  const rows: OpsRow[] = [...v.account, ...v.marketing, ...v.support];
  // P2 outreach is intentionally lifecycle-only in Operations: do not render recipient fields, message wording,
  // attempts, or source/context details in this role's system panel.
  const earlySupportRows: OpsRow[] = w.scenario === "early-support" ? [...v.delivery, ...v.clarification] : [];
  const shown = v.systems.filter((s) => ALWAYS.has(s.key as ConnectorKey) || rows.some((r) => r.systemKey === s.key) || earlySupportRows.some((r) => r.systemKey === s.key));
  return (
    <PanelFrame
      id="operations"
      title="Operations and connected systems"
      sees="What each connected system was sent and what came back. Not the customer's words or the reviewer's workspace."
      {...props}
      nav={
        <nav className="obs-nav" aria-label="Operations sections">
          <ul>
            {TABS.map((t) => (
              <li key={t.tab}>
                <a href={`#ops-${t.tab}`} aria-current={t.tab === tab ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab(t.tab); scrollPanelToTop("operations"); }}>{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      }
      footer={<div className="obs-result" aria-live="polite"><Result outcome={outcome} /></div>}
    >
      {tab === "systems" ? (
        <div data-testid="ops-systems">
          {shown.map((s) => {
            const key = s.key as ConnectorKey;
            const mine = rows.filter((r) => r.systemKey === key);
            const lifecycle = earlySupportRows.filter((r) => r.systemKey === key);
            const script = w.scripts[key];
            return (
              <section key={key} className="destination" aria-label={s.label} data-system={key} data-change-key={`system:${key}`}>
                <header className="destination-head">
                  <h3>{s.label}</h3>
                  <span className="chip chip-simulation" data-status="simulation"><span aria-hidden="true" className="chip-mark">◐</span>Simulated destination</span>
                </header>
                {s.unavailable ? <p className="note attention" data-testid="system-unavailable"><strong>Recorded as unavailable.</strong> Work it accepted keeps its acceptance and becomes an open need.</p> : null}
                {mine.length === 0 && lifecycle.length === 0 ? <p className="muted" data-testid="nothing-sent">Nothing has been sent to this system.</p> : null}
                {mine.map((r) => {
                  const cls = classifyOpsRow(r);
                  const delivered = r.attempts.some((t) => t.result === "delivered");
                  return (
                    <div key={r.id} className="destination-row">
                      <p className="sent-line" data-testid="sent-line" data-delivered={delivered}>
                        {delivered ? <><strong>Received from the reviewer's send:</strong> {r.short}</>
                          : r.stage === "retry" ? <><strong>A send was attempted and refused.</strong> Nothing is recorded as delivered to this system.</>
                          : r.stage === "proposed" ? <><strong>Prepared, not yet approved.</strong> Nothing has been sent to this system.</>
                          : r.stage === "unresolved" ? <><strong>No delivery is recorded.</strong> A person decides what happens next.</>
                          : <><strong>Approved by the reviewer, not sent.</strong> Nothing has reached this system, and nothing here changes until it is sent.</>}
                      </p>
                      {delivered ? <DefList rows={r.fields.map((f) => [f.label, f.value] as const)} /> : null}
                      <Row r={r} cls={cls} open={open} setOpen={setOpen} setOutcome={setOutcome} presenter />
                    </div>
                  );
                })}
                {lifecycle.map((r) => (
                  <article
                    key={r.id}
                    className="destination-row p2-lifecycle"
                    aria-label={`${r.short} ${r.id} lifecycle status`}
                    data-testid="p2-system-status"
                    data-action={r.typeId}
                    data-stage={r.stage}
                  >
                    <h4>{r.short} <span className="muted">({r.id})</span></h4>
                    <p className="sent-line"><strong>{r.stageLabel}.</strong> {r.stageDetail}</p>
                    {r.authorisedBy ? <p className="muted">Approved by {r.authorisedBy} · {r.authorisedAt}</p> : null}
                    {r.readBack.available
                      ? r.readBack.last
                        ? <p className="muted">Separate simulated read-back: {r.readBack.last.result}. This does not show that the action helped.</p>
                        : <p className="muted">No separate read-back is recorded. This is not confirmed.</p>
                      : null}
                    {r.stage === "unresolved" ? <p className="note attention">Unresolved. No completion or destination confirmation is recorded.</p> : null}
                    <p className="muted">Scoped lifecycle status only · fictional destination</p>
                  </article>
                ))}
                <div className="destination-controls" role="group" aria-label={`Simulated destination controls for ${s.label}`} data-testid={`controls-${key}`}>
                  <h4>Simulated destination controls · {s.label}</h4>
                  <p className="muted">Played by the demonstration. These settings decide how this system answers; they are not Operations staff and not the reviewer.</p>
                  <div className="field">
                    <label htmlFor={`obs-b-${key}`}>When it is sent a request</label>
                    <select id={`obs-b-${key}`} value={script.behaviour} onChange={(e) => w.setBehaviour(key, e.target.value as (typeof BEHAVIOURS)[number])}>
                      {BEHAVIOURS.map((b) => <option key={b} value={b}>{BEHAVIOUR_LABEL[b]}</option>)}
                    </select>
                  </div>
                  {key !== "support-team" ? (
                    <div className="field">
                      <label htmlFor={`obs-r-${key}`}>When read back by the simulated check</label>
                      <select id={`obs-r-${key}`} value={script.readBack} onChange={(e) => w.setReadBack(key, e.target.value as (typeof READ_BACKS)[number])}>
                        {READ_BACKS.map((b) => <option key={b} value={b}>{READ_BACK_LABEL[b]}</option>)}
                      </select>
                    </div>
                  ) : null}
                  <button type="button" className="btn btn-quiet" onClick={() => setOutcome(w.recordCapacity(key, s.unavailable ? "available" : "unavailable"))}>
                    {s.unavailable ? "Simulate: this system is available again" : "Simulate: this system becomes unavailable"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
      {tab === "open" ? (<><GapsPanel v={v} /><OverviewPanel v={v} /></>) : null}
      {tab === "evidence" ? <EvidenceLogs v={v} /> : null}
    </PanelFrame>
  );
}
