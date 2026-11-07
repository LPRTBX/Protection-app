import { useState } from "react";
import type { ConnectorKey } from "../sim/connectors";
import { OPERATIONS } from "../sim/scope";
import { STAGES, STAGE_LABEL } from "../sim/stage";
import { operationsView, type OpsRow } from "../sim/views";
import { StageLine, Track } from "./ActionCard";
import { ReviewEntry, type OpenMap } from "./Decisions";
import { classifyOpsRow, type Classified, type Group } from "./decisions";
import { Btn, DefList, Empty, Panel, Result, StageChip, useOutcome } from "./parts";
import { useWorld } from "./world";

/**
 * Protection Operations: account-control execution, marketing suppression, support coordination, recorded evidence and
 * unresolved gaps. It reads ONLY `operationsView`: customer reference, length of break and what each system was sent. Never
 * the customer's own words or contact choice, and never the customer notices.
 */
export function Operations() {
  const w = useWorld();
  const v = operationsView(w);
  const [outcome, setOutcome] = useOutcome();
  const [open, setOpen] = useState<OpenMap>({});

  return (
    <>
      <div className="viewpoint" role="note">
        <strong>Demonstration view: Operations.</strong> You see what was sent to each connected system and what came back. You cannot approve actions, record a system's response for it, or see the customer's own words or contact details.
      </div>

      <GapsPanel v={v} />

      <OverviewPanel v={v} />

      <WorkGroups v={v} open={open} setOpen={setOpen} setOutcome={setOutcome} />

      <details className="secondary" id="simulation-controls" data-testid="simulation-controls">
        <summary>Simulation controls (stand-ins for connected systems, and a role check)</summary>
        <p className="muted">These are demonstration controls. They record events a connected system would report, or probe what this role may do. They are not part of a real operator's workflow.</p>
        <Systems v={v} setOutcome={setOutcome} />
      <AuthorityCheck setOutcome={setOutcome} ids={[...v.account, ...v.marketing, ...v.support, ...v.delivery, ...v.clarification].map((r) => r.id)} />
      </details>

      <EvidenceLogs v={v} />

      <div className="toast-space" aria-hidden="true" />
      {outcome ? <div className="toast"><Result outcome={outcome} /></div> : <Result outcome={null} />}
    </>
  );
}

type OpsView = ReturnType<typeof operationsView>;

export function GapsPanel({ v }: { v: OpsView }) {
  return (
  <Panel title="What is still open" status="implemented" id="gaps" intro="Everything authorised or sent that is not yet confirmed, and who owns the next step.">
    {v.gaps.length === 0 ? (
      <Empty>No gaps right now. That is a statement about records, not about anyone's safety.</Empty>
    ) : (
      <ul className="gaps" data-testid="gaps">
        {v.gaps.map((g) => (
          <li key={g.id} className="card attention" data-change-key={`gap:${g.id}`}>
            <p>{g.what}</p>
            <p className="muted">Next step belongs to: <strong>{g.ownerOfNextStep}</strong> · {g.source === "kernel" ? "Recorded" : "Derived from the records"}</p>
          </li>
        ))}
      </ul>
    )}
  </Panel>
  );
}

export function OverviewPanel({ v }: { v: OpsView }) {
  return (
  <Panel title="Where everything stands" status="implemented" id="overview">
    {!v.hasWork ? (
      <Empty>{v.scenario === "early-support" ? "No work yet. An instruction appears here only after a named person authorises it. You never see the review context." : "No protection work yet. Work appears here after the reviewer authorises actions."}</Empty>
    ) : (
      <ul className="counts" aria-label="Protection actions by stage">
        {[...STAGES, "closed" as const].map((s) => (
          <li key={s} data-count={v.counts[s]}><StageChip stage={s} label={STAGE_LABEL[s]} /> <strong aria-label={`${v.counts[s]} actions`}>{v.counts[s]}</strong></li>
        ))}
      </ul>
    )}
    <details className="secondary" data-testid="state-definitions">
      <summary>How to read these states</summary>
      <p className="muted">        Sent is not received. Received is not accepted. Accepted is not applied. Applied is a report, not a check. Confirmed means a simulated read-back recorded in this demo matched and a person recorded it; it is not proof of wellbeing, reduced harm or operator compliance.</p>
    </details>
  </Panel>
  );
}

export function EvidenceLogs({ v }: { v: OpsView }) {
  return (
  <details className="secondary" id="evidence" data-testid="evidence-details">
    <summary>Recorded evidence and logs</summary>
    <p className="muted">What the kernel recorded about these actions, in order. Customer details and support history are not in this record. The simulated system log is not Core evidence.</p>
    <details open>
      <summary>Kernel evidence ({v.evidence.length})</summary>
      <ol className="log" data-testid="ops-evidence">{v.evidence.map((e) => <li key={e.sequence}><span className="muted">#{e.sequence} · {e.at} · {e.actor} · {e.strength}</span><br />{e.text}</li>)}</ol>
    </details>
    <details>
      <summary>Simulated system log ({v.connectorLog.length})</summary>
      <p className="muted">Written by the stand-in systems. Not Core evidence.</p>
      <ol className="log">{v.connectorLog.map((l, i) => <li key={i}><span className="muted">{l.at} · {l.system}</span><br />{l.text}</li>)}</ol>
    </details>
    <details>
      <summary>Simulated read-backs ({v.readBacks.length})</summary>
      <p className="muted">Recorded in the demo from a stand-in source separate from the system that applied the control. Not real-world assurance.</p>
      <ol className="log">{v.readBacks.map((r) => <li key={r.reference}><span className="muted">{r.at} · {r.reference}</span><br />{r.actionId}: {r.result === "matches" ? "matched what was requested" : "did NOT match what was requested"}</li>)}</ol>
    </details>
  </details>
  );
}

export function WorkGroups({ v, open, setOpen, setOutcome, perspective = "operations" }: { v: ReturnType<typeof operationsView>; open: OpenMap; setOpen: (m: OpenMap) => void; setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void; perspective?: "operations" | "presenter" }) {
  const rows: OpsRow[] = v.scenario === "early-support" ? [...v.delivery, ...v.clarification] : [...v.account, ...v.marketing, ...v.support];
  const presenter = perspective === "presenter";
  const titles: Record<Group, string> = { available: presenter ? "Available to simulate now" : "Available for your action now", waiting: "Waiting on another system or prerequisite", done: "Completed" };
  const emptyText: Record<Group, string> = { available: presenter ? "No simulated response is available right now." : "Nothing is available for your action right now.", waiting: "Nothing is waiting on another system or prerequisite.", done: "Nothing is completed yet." };
  return (
    <Panel title={presenter ? "Simulated responses from other systems and teams" : "Execution"} status={presenter ? "simulation" : "implemented"} id={presenter ? "presenter-work" : "work"} intro={presenter ? "Each row is a response a connected system or another team would give, played by the presenter. None happens because a reviewer approved or sent something; the presenter chooses to run it." : v.scenario === "early-support" ? "Work appears here only after a named person authorises it. You never see the review context." : "Work appears here only after a named person authorises it. Each row shows what is available to you, what is waiting, and what is completed."}>
      {rows.length === 0 ? <Empty>{v.scenario === "early-support" ? "No in-app message delivery or clarification has been authorised. Nothing is delivered until a named person approves it." : "No account-control, marketing or support work yet."}</Empty> : null}
      {rows.length === 0 ? null : (["available", "waiting", "done"] as const).map((g) => {
        const list = rows.map((r) => ({ r, cls: classifyOpsRow(r) })).filter((x) => x.cls.group === g);
        return (
          <section key={g} id={`ops-${g}`} className={`decision-group group-${g}`} aria-labelledby={`ops-${g}-h`} data-group={g} data-count={list.length}>
            <h3 id={`ops-${g}-h`}>{titles[g]} <span className="count">({list.length})</span></h3>
            {list.length === 0 ? <p className="muted">{emptyText[g]}</p> : list.map(({ r, cls }) => <Row key={r.id} r={r} cls={cls} open={open} setOpen={setOpen} setOutcome={setOutcome} presenter={presenter} />)}
          </section>
        );
      })}
    </Panel>
  );
}

export function Row({ r, cls, open, setOpen, setOutcome, presenter = false }: { r: OpsRow; cls: Classified; open: OpenMap; setOpen: (m: OpenMap) => void; setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void; presenter?: boolean }) {
  const w = useWorld();
  const [account, setAccount] = useState("");
  const stepControls = (
    <>
  {r.nextStep || r.readBack.available ? <h5>{presenter ? `Simulated destination controls · ${r.system}` : "Simulated step"}</h5> : null}
  {r.nextStep || r.readBack.available ? <p className="muted">{presenter ? "Played by the demonstration, not by Operations staff or the reviewer. Each step happens only when it is pressed here; approving or sending never presses it." : "These buttons stand in for the connected system or the independent check. A person cannot act for the system."}</p> : null}
  <div className="offers">
    {r.nextStep ? (
      <div className="offer">
        <Btn tone="primary" disabled={!!r.nextStep.disabledReason} onClick={() => setOutcome(w.connectorStep(r.id))} describedBy={r.nextStep.disabledReason ? `why-${r.id}` : undefined}>{r.nextStep.label}</Btn>
        {r.nextStep.disabledReason ? <span className="hint" id={`why-${r.id}`}>{r.nextStep.disabledReason}</span> : <span className="hint">The system acts through its own channel. A person cannot do this for it.</span>}
      </div>
    ) : null}
    {r.readBack.available ? (
      <div className="offer">
        <Btn tone="primary" onClick={() => setOutcome(w.readBack(r.id))}>Run simulated read-back</Btn>
        <span className="hint">{r.readBack.last ? `Last: ${r.readBack.last.result === "matches" ? "matched" : "did not match"} (${r.readBack.last.reference}). Only the reviewer can record confirmation.` : "Checks the control from a stand-in source separate from the applying system. Recorded in the demo."}</span>
      </div>
    ) : null}
  </div>
    </>
  );
  return (
    <article id={`ops-${r.id}`} data-change-key={`row:${r.id}`} className={`card action decision group-${cls.group}`} aria-label={`${r.short} ${r.id}`} data-action={r.typeId} data-stage={r.stage} data-group={cls.group}>
      <header>
        <h4>{r.short} <span className="muted">({r.id})</span></h4>
        <p className="muted">System: {r.system}{r.systemUnavailable ? " · recorded as unavailable" : ""}</p>
      </header>
      <StageLine stage={r.stage} label={r.stageLabel} detail={r.stageDetail} notYetAccepted={r.notYetAccepted} />
      {r.unknownSend ? <p className="note attention" data-testid="unknown-send"><strong>The outcome of this send is unknown.</strong> It may have arrived. It is not retried until a separate person records what the receiving system's own log shows.</p> : null}
      {cls.group === "waiting" && cls.blocker && cls.blocker !== r.stageDetail ? <p className="blocker" data-testid="blocker"><strong>Not available yet:</strong> {cls.blocker}</p> : null}
      {cls.group === "available" && cls.available ? <p className="available-line" data-testid="available-line"><strong>Available now:</strong> {cls.available}</p> : null}
      {r.authorisedBy ? <p className="auth">✔ Authorised by <strong>{r.authorisedBy}</strong> · {r.authorisedAt}</p> : <p className="auth muted">Not yet authorised.</p>}
      {presenter && (r.nextStep || r.readBack.available) ? <div className="presenter-steps" data-testid="presenter-steps">{stepControls}</div> : null}
      <ReviewEntry id={`ops-${r.id}`} open={open} setOpen={setOpen}>
        <Track reached={r.reached} current={r.stage} />
        <h5>What this system was sent</h5>
        <DefList rows={r.fields.map((f) => [f.label, f.value] as const)} />
        {r.attempts.length > 0 ? (
          <>
            <h5>Attempts ({r.attempts.length})</h5>
            <ul className="list">{r.attempts.map((t) => <li key={t.n}>Attempt {t.n} · {t.at}: <strong>{t.result === "delivered" ? "recorded as delivered" : t.result === "failed" ? "failed" : "outcome unknown"}</strong>{t.reason ? ` (${t.reason})` : ""}</li>)}</ul>
          </>
        ) : null}
        {r.waitingFor.length > 0 ? <p className="note">Waiting for: {r.waitingFor.join("; ")}.</p> : null}

        {presenter ? null : stepControls}

        {r.unknownSend ? (
          <section className="card attention" aria-label="Reconcile an unknown send">
            <h4>The outcome of this send is unknown</h4>
            <p>It may have arrived. It is not retried until a separate person records what the receiving system's own log shows.</p>
            <DefList rows={[["Receiving system's log", `${r.unknownSend.delivered ? "The request arrived." : "The request did not arrive."} Reference ${r.unknownSend.reference}`]]} />
            <div className="field">
              <label htmlFor={`acct-${r.id}`}>Your account of what the log shows (at least 10 characters)</label>
              <textarea id={`acct-${r.id}`} rows={2} value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <Btn tone="primary" onClick={() => setOutcome(w.reconcile(r.id, r.unknownSend!.delivered ? "verified_delivered" : "verified_not_delivered", r.unknownSend!.reference, account))}>
              Record: {r.unknownSend.delivered ? "it was delivered" : "it was not delivered"}
            </Btn>
          </section>
        ) : null}
      </ReviewEntry>
    </article>
  );
}

export function Systems({ v, setOutcome }: { v: ReturnType<typeof operationsView>; setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void }) {
  const w = useWorld();
  return (
    <section id="systems" aria-labelledby="systems-h"><h3 id="systems-h">System availability</h3><p className="muted">Record when a connected system can no longer act. Work that system accepted keeps its acceptance and becomes an open need; nothing is passed to another system on its own.</p>
      <ul className="systems">
        {v.systems.map((s) => (
          <li key={s.key} className="card">
            <p><strong>{s.label}</strong> · {s.unavailable ? "! Recorded as unavailable" : "✔ Available"}</p>
            <Btn onClick={() => setOutcome(w.recordCapacity(s.key as ConnectorKey, s.unavailable ? "available" : "unavailable"))}>{s.unavailable ? "Record as available again" : "Record as unavailable"}</Btn>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuthorityCheck({ setOutcome, ids }: { setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void; ids: string[] }) {
  const w = useWorld();
  const first = w.actions().find((a) => ids.includes(a.id) && a.state === "awaiting_approval") ?? w.actions().find((a) => ids.includes(a.id));
  return (
    <section id="authority" aria-labelledby="authority-h"><h3 id="authority-h">Check what your role may do</h3><p className="muted">You are {OPERATIONS.label}. Try an approval and see the kernel's own answer.</p>
      <p className="muted">The kernel answers a person with no standing in a request as if it did not exist. That is deliberate: it reveals nothing.</p>
      <Btn disabled={!first} onClick={() => first && setOutcome(w.tryAs("operations", { type: "approve", actionId: first.id, checks: { recipient: true, purpose: true, fields: true, authority: true } }, `Tried to approve ${w.label(first.id)} as Protection Operations`))}>
        Try to approve {first ? w.label(first.id) : "an action"}
      </Btn>
    </section>
  );
}
