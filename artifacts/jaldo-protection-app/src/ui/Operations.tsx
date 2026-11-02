import { useState } from "react";
import type { ConnectorKey } from "../sim/connectors";
import { OPERATIONS } from "../sim/scope";
import { STAGES, STAGE_LABEL } from "../sim/stage";
import { operationsView, type OpsRow } from "../sim/views";
import { StageLine, Track } from "./ActionCard";
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

  return (
    <>
      <div className="viewpoint" role="note">
        <strong>Viewing as: Protection Operations.</strong> You see what was sent to each connected system and what came back. You cannot approve actions, record a system's response for it, or see the customer's own words or contact details.
      </div>

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
        <p className="muted">Sent is not received. Received is not accepted. Accepted is not applied. Applied is a report, not a check. Confirmed means a simulated read-back recorded in this demo matched and a person recorded it; it is not proof of wellbeing, reduced harm or operator compliance.</p>
      </Panel>

      {v.scenario === "early-support" ? (
        <>
          <Section title="In-app message delivery" id="delivery" rows={v.delivery} empty="No in-app message delivery has been authorised. Nothing is delivered until a named person approves it." setOutcome={setOutcome} />
          <Section title="Source clarification" id="clarification" rows={v.clarification} empty="No clarification has been requested." setOutcome={setOutcome} />
        </>
      ) : (
        <>
          <Section title="Account-control execution" id="account" rows={v.account} empty="No account-control work yet." setOutcome={setOutcome} />
          <Section title="Marketing suppression" id="marketing" rows={v.marketing} empty="No marketing suppression yet." setOutcome={setOutcome} />
          <Section title="Support coordination (lifecycle only)" id="support" rows={v.support} empty="No support handover. Optional support outreach exists only if the customer's current permission allows it." setOutcome={setOutcome} />
        </>
      )}

      <Panel title="Unresolved gaps" status="implemented" id="gaps" intro="Everything authorised or sent that is not yet confirmed, and who owns the next step.">
        {v.gaps.length === 0 ? (
          <Empty>No gaps right now. That is a statement about records, not about anyone's safety.</Empty>
        ) : (
          <ul className="gaps" data-testid="gaps">
            {v.gaps.map((g) => (
              <li key={g.id} className="card attention">
                <p>{g.what}</p>
                <p className="muted">Next step belongs to: <strong>{g.ownerOfNextStep}</strong> · {g.source === "kernel" ? "Recorded by the kernel" : "Derived from kernel records"}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Systems v={v} setOutcome={setOutcome} />
      <AuthorityCheck setOutcome={setOutcome} ids={[...v.account, ...v.marketing, ...v.support, ...v.delivery, ...v.clarification].map((r) => r.id)} />

      <Panel title="Recorded evidence" status="implemented" id="evidence" intro="What the kernel recorded about these actions, in order. Customer details and support history are not in this record. The simulated system log is not Core evidence.">
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
      </Panel>

      <div className="toast-space" aria-hidden="true" />
      {outcome ? <div className="toast"><Result outcome={outcome} /></div> : <Result outcome={null} />}
    </>
  );
}

function Section({ title, id, rows, empty, setOutcome }: { title: string; id: string; rows: OpsRow[]; empty: string; setOutcome: (o: ReturnType<typeof useOutcome>[0] & object) => void }) {
  return (
    <Panel title={title} status="implemented" id={id}>
      {rows.length === 0 ? <Empty>{empty}</Empty> : rows.map((r) => <Row key={r.id} r={r} setOutcome={setOutcome} />)}
    </Panel>
  );
}

function Row({ r, setOutcome }: { r: OpsRow; setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void }) {
  const w = useWorld();
  const [account, setAccount] = useState("");
  return (
    <article className="card action" aria-label={`${r.short} ${r.id}`} data-action={r.typeId} data-stage={r.stage}>
      <header>
        <h3>{r.short} <span className="muted">({r.id})</span></h3>
        <p className="muted">System: {r.system}{r.systemUnavailable ? " · recorded as unavailable" : ""}</p>
      </header>
      <StageLine stage={r.stage} label={r.stageLabel} detail={r.stageDetail} notYetAccepted={r.notYetAccepted} />
      <Track reached={r.reached} current={r.stage} />
      {r.authorisedBy ? <p className="auth">✔ Authorised by <strong>{r.authorisedBy}</strong> · {r.authorisedAt}</p> : <p className="auth muted">Not yet authorised.</p>}
      <details>
        <summary>What this system was sent</summary>
        <DefList rows={r.fields.map((f) => [f.label, f.value] as const)} />
      </details>
      {r.attempts.length > 0 ? (
        <ul className="list">{r.attempts.map((t) => <li key={t.n}>Attempt {t.n} · {t.at}: <strong>{t.result === "delivered" ? "recorded as delivered" : t.result === "failed" ? "failed" : "outcome unknown"}</strong>{t.reason ? ` (${t.reason})` : ""}</li>)}</ul>
      ) : null}
      {r.waitingFor.length > 0 ? <p className="note">Waiting for: {r.waitingFor.join("; ")}.</p> : null}

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
    </article>
  );
}

function Systems({ v, setOutcome }: { v: ReturnType<typeof operationsView>; setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void }) {
  const w = useWorld();
  return (
    <Panel title="System availability" status="simulation" id="systems" intro="Record when a connected system can no longer act. Work that system accepted keeps its acceptance and becomes an open need; nothing is passed to another system on its own.">
      <ul className="systems">
        {v.systems.map((s) => (
          <li key={s.key} className="card">
            <p><strong>{s.label}</strong> · {s.unavailable ? "! Recorded as unavailable" : "✔ Available"}</p>
            <Btn onClick={() => setOutcome(w.recordCapacity(s.key as ConnectorKey, s.unavailable ? "available" : "unavailable"))}>{s.unavailable ? "Record as available again" : "Record as unavailable"}</Btn>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AuthorityCheck({ setOutcome, ids }: { setOutcome: (o: NonNullable<ReturnType<typeof useOutcome>[0]>) => void; ids: string[] }) {
  const w = useWorld();
  const first = w.actions().find((a) => ids.includes(a.id) && a.state === "awaiting_approval") ?? w.actions().find((a) => ids.includes(a.id));
  return (
    <Panel title="Check what your role may do" status="implemented" id="authority" intro={`You are ${OPERATIONS.label}. Try an approval and see the kernel's own answer.`}>
      <p className="muted">The kernel answers a person with no standing in a request as if it did not exist. That is deliberate: it reveals nothing.</p>
      <Btn disabled={!first} onClick={() => first && setOutcome(w.tryAs("operations", { type: "approve", actionId: first.id, checks: { recipient: true, purpose: true, fields: true, authority: true } }, `Tried to approve ${w.label(first.id)} as Protection Operations`))}>
        Try to approve {first ? w.label(first.id) : "an action"}
      </Btn>
    </Panel>
  );
}
