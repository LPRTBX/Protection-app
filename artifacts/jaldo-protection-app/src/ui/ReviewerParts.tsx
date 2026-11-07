import { REVIEWER } from "../sim/scope";
import type { OperatorView, ReviewCard } from "../sim/views";
import { Offers } from "./ActionCard";
import { requestDetailRows } from "./decisions";
import { DefList, Empty, Panel } from "./parts";

/**
 * The reviewer's building blocks. They read only the reviewer projection (OperatorView) and are used, unchanged, by both the
 * Explore-the-system reviewer workspace and the role-focused reviewer experience, so neither re-implements a rule.
 */

export function RequestSummary({ v }: { v: OperatorView }) {
  return (
    <div className="card summary" data-testid="request-summary" data-change-key="request">
      <p><strong>{v.request!.ref}</strong> · {v.scenario === "early-support" ? "Early-support review request (from an upstream source)" : `Break request · ${v.request!.fields.find((f) => f.label === "Length of break")?.value}`}</p>
      <p className="muted">Received {v.request!.receivedAt} · {v.status === "awaiting_acceptance" ? "Waiting for a reviewer to take responsibility" : "Held by " + REVIEWER.label}</p>
      <p className="muted">Contact choice now: {v.communicationPermission.current}</p>
    </div>
  );
}

export function ResponsibilityBlock({ v, run }: { v: OperatorView; run: (key: string, actionId?: string) => void }) {
  return (
    <div id="responsibility" tabIndex={-1}>
      {v.status === "awaiting_acceptance" ? (
        <>
          <p>You are the addressed contact. Taking responsibility records your authority, conflict and capacity checks. Nothing is approved or sent by doing so.</p>
          <Offers offers={v.offers} onRun={(k) => run(k)} />
        </>
      ) : (
        <p className="muted">You hold this request. Each later step is checked against your responsibility again.</p>
      )}
    </div>
  );
}

export function PoliciesPanel({ v }: { v: OperatorView }) {
  return (
  <Panel title="Applicable policies" status="simulation" id="policies" intro="What governs the actions on this request, what each requires and whether the facts meet it. Fictional policies.">
    {v.policies.length === 0 ? <Empty>Policies appear once the plan is prepared.</Empty> : null}
    {v.policies.map((p) => (
      <section key={p.id} className="card" aria-label={p.label}>
        <h3>{p.label} <span className="muted">v{p.version}</span></h3>
        <p className="muted">Applies to: {p.appliesTo.join(", ")}</p>
        <ul className="checks">
          {p.checks.map((c) => (
            <li key={c.text} data-result={c.result}>
              <span className={`result result-${c.result}`}><span aria-hidden="true">{c.result === "met" ? "✔" : "!"}</span> {c.result === "met" ? "Met" : "Needs attention"}</span>
              <span>{c.text}<br /><span className="muted">{c.basis}</span></span>
            </li>
          ))}
        </ul>
      </section>
    ))}
    <h3>Communication permissions</h3>
    <DefList rows={[["Contact choice on the request (frozen)", v.communicationPermission.choice], ["Contact choice now", v.communicationPermission.current], ["Effect", v.communicationPermission.explanation]]} />
  </Panel>
  );
}

export function RequestPanel({ v }: { v: OperatorView }) {
  return (
  <Panel title="The request" status="implemented" id="request" intro="What the customer sent. Nothing is inferred.">
    <div tabIndex={-1} id="request-anchor" />
    <DefList rows={requestDetailRows(v).map((f) => [f.label, f.value] as const)} />
    <details className="secondary" data-testid="provenance">
      <summary>Source and provenance</summary>
      <DefList rows={v.provenance!.rows.map((r) => [r.label, r.value] as const)} />
      <ul className="list">{v.provenance!.checks.map((c) => <li key={c}>{c}</li>)}</ul>
    </details>
  </Panel>
  );
}

export function AuditHistory({ v }: { v: OperatorView }) {
  return (
  <details className="secondary" id="record" data-testid="audit-history">
    <summary>Audit history (evidence {v.evidence.length} · steps taken {v.history.length})</summary>
    <p className="muted">Evidence recorded, in order, and what each step answered.</p>
    <details>
      <summary>Evidence ({v.evidence.length})</summary>
      <ol className="log">{v.evidence.map((e) => <li key={e.sequence}><span className="muted">#{e.sequence} · {e.at} · {e.actor} · {e.strength}</span><br />{e.text}</li>)}</ol>
    </details>
    <details>
      <summary>Steps taken in this session ({v.history.length})</summary>
      <ol className="log history">{v.history.map((h, i) => <li key={i} className={h.ok ? "" : "refused"}><span className="muted">{h.at} · {h.by}</span><br /><strong>{h.ok ? "" : "Refused: "}{h.did}.</strong> {h.result}</li>)}</ol>
    </details>
  </details>
  );
}

export function ReviewPanel({ r }: { r: ReviewCard }) {
  return (
    <section className="panel review-card" id="why" aria-labelledby="why-h" tabIndex={-1} data-testid="review-card" data-context={r.context.state}>
      <header className="panel-head">
        <h2 id="why-h">{r.title}</h2>
        <span className="chip chip-simulation" data-status="simulation"><span aria-hidden="true" className="chip-mark">◐</span>Simulated source</span>
      </header>
      <p className="lede-small"><strong>What was received.</strong> {r.received}</p>
      <div className="two">
        <div>
          <h3>Where it came from</h3>
          <DefList rows={[["Source", r.source.name], ["Reference", r.source.reference], ["Event time", r.source.eventTime], ["Provenance", r.source.simulated]]} />
          <h3>Source context</h3>
          <p className={`ctx ctx-${r.context.state}`}><span aria-hidden="true">{r.context.state === "current" ? "✔" : "!"}</span> <strong>{r.context.label}.</strong> {r.context.text}</p>
          <h3>Known limits of this source</h3>
          <ul className="list">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <div>
          <h3>What is known (permitted facts only)</h3>
          <DefList rows={r.permitted.map((p) => [p.label, p.value] as const)} />
          <h3>What is not known</h3>
          <ul className="list">{r.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
          <h3>Policy</h3>
          <ul className="list">{r.policy.map((p) => <li key={p.label}>{p.label} <span className="muted">v{p.version}</span></li>)}</ul>
        </div>
      </div>
      <h3>What you can decide</h3>
      <ul className="decisions">
        {r.decisions.map((d) => (
          <li key={d.what} data-status={d.status}>
            <span className={`result result-${d.status === "available" ? "met" : "needs-attention"}`}><span aria-hidden="true">{d.status === "available" ? "✔" : d.status === "blocked" ? "!" : "–"}</span> {d.status === "available" ? "Available" : d.status === "blocked" ? "Blocked" : "Unavailable"}</span>
            <span><strong>{d.what}.</strong>{d.why ? <> <span className="muted">{d.why}</span></> : null}</span>
          </li>
        ))}
      </ul>
      <DefList rows={[["Who decides", r.whoDecides], ["What would be shared", r.willShare], ["Existing protections", r.protections]]} />
      <h3>What remains outstanding</h3>
      <ul className="list">{r.outstanding.length ? r.outstanding.map((o) => <li key={o}>{o}</li>) : <li>Nothing outstanding.</li>}</ul>
    </section>
  );
}

export function Viewpoint() {
  return (
    <div className="viewpoint" role="note">
      <strong>Demonstration view: Protection reviewer.</strong> You see the request and the actions you may decide on, not the connected systems' own controls.
    </div>
  );
}

export function Authority({ v }: { v: OperatorView }) {
  return (
    <>
      {v.authority.active ? null : <p className="card attention bad-text" data-testid="authority-revoked">! Your responsibility is revoked. {v.authority.note}</p>}
      <details className="secondary" id="authority" data-testid="authority-details">
        <summary>Your authority · {v.authority.active ? "Active" : "Revoked"}</summary>
        <p className="muted">Authority is a responsibility granted to you. It is checked again on every step, not once.</p>
        <DefList
          rows={[
            ["You are", v.authority.holder],
            ["Responsibility", v.authority.responsibility],
            ["Status", <span key="s" className={v.authority.active ? "ok-text" : "bad-text"}>{v.authority.active ? "✔ Active. " : "! Revoked. "}{v.authority.note}</span>],
          ]}
        />
        <div className="two">
          <div><h3>This lets you</h3><ul className="list">{v.authority.permits.map((p) => <li key={p}>{p}</li>)}</ul></div>
          <div><h3>This does not let you</h3><ul className="list">{v.authority.doesNotPermit.map((p) => <li key={p}>{p}</li>)}</ul></div>
        </div>
      </details>
    </>
  );
}
