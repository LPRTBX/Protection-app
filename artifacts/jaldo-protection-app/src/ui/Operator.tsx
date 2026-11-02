import { useState } from "react";
import { REVIEWER } from "../sim/scope";
import { operatorDo, operatorView, type OperatorAction, type OperatorView, type ReviewCard } from "../sim/views";
import { Offers, StageLine, Track } from "./ActionCard";
import { Btn, DefList, Empty, Panel, Result, useOutcome } from "./parts";
import { useWorld } from "./world";

/** The operator workspace: review a submitted request, check policies, confirm authority, approve specific actions. */
export function Operator() {
  const w = useWorld();
  const v = operatorView(w);
  const [outcome, setOutcome] = useOutcome();
  const run = (key: string, actionId?: string) => setOutcome(operatorDo(w, key, actionId));

  if (v.status === "none") {
    return (
      <>
        <Viewpoint />
        <Panel title="Review queue" status="implemented">
          {v.scenario === "early-support" ? (
            <>
              <Empty>No review requests are waiting. In this scenario an upstream source sends one. The simulated source's event is admitted from Simulation controls; nothing exists until then.</Empty>
              <p><a className="btn btn-primary" href="#/simulation">Open Simulation controls</a></p>
            </>
          ) : (
            <>
              <Empty>No requests are waiting. In this prototype a request arrives when the customer sends one from the Customer app.</Empty>
              <p><a className="btn btn-primary" href="#/customer/options">Open the Customer app</a></p>
            </>
          )}
        </Panel>
        <Authority v={v} />
      </>
    );
  }

  const groups: { id: OperatorAction["group"]; title: string; intro: string }[] = [
    { id: "early-support", title: "Early-support actions", intro: "Optional and discretionary. Each is a separate decision for a named person. Nothing changes on the customer's account." },
    { id: "protection", title: "Protection actions", intro: "Each is a separate decision for a named person. Approving one does not approve another." },
    { id: "support", title: "Support coordination", intro: "Optional outreach. Needs the customer's CURRENT permission, checked again at every step and when sent. Whether to send it, and when, is your decision. Access to Support never depends on any of this." },
    { id: "customer-notice", title: "What the customer is told", intro: "A notice is approved only after its protection is confirmed. The customer sees nothing else about it." },
  ];

  return (
    <>
      <Viewpoint />
      <nav className="jump" aria-label="On this page">
        <ul>
          {[...(v.review ? ["why"] : []), "request", "policies", "authority", "actions", "next", "record"].map((id) => (
            <li key={id}><a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: "start" }); document.getElementById(id)?.focus(); }}>{{ why: "Why review", request: "Request", policies: "Policies", authority: "Authority", actions: "Actions", next: "Next", record: "Record" }[id]}</a></li>
          ))}
        </ul>
      </nav>

      <Panel title="Review queue" status="implemented" id="queue">
        <ul className="queue">
          <li className="card">
            <p><strong>{v.request!.ref}</strong> · {v.scenario === "early-support" ? "Early-support review request (from an upstream source)" : `Break request · ${v.request!.fields.find((f) => f.label === "Length of break")?.value}`}</p>
            <p className="muted">Received {v.request!.receivedAt} · {v.status === "awaiting_acceptance" ? "Waiting for a reviewer to take responsibility" : "Held by " + REVIEWER.label}</p>
          </li>
        </ul>
      </Panel>

      {v.review ? <ReviewPanel r={v.review} /> : null}

      <Panel title="The request and where it came from" status="implemented" id="request" intro="Everything here is what the customer sent, as the kernel admitted it. Nothing is inferred.">
        <div tabIndex={-1} id="request-anchor" />
        <DefList rows={v.request!.fields.map((f) => [f.label, f.value] as const)} />
        <h3>Source and provenance</h3>
        <DefList rows={v.provenance!.rows.map((r) => [r.label, r.value] as const)} />
        <ul className="list">{v.provenance!.checks.map((c) => <li key={c}>{c}</li>)}</ul>
      </Panel>

      <Panel title="Applicable policies" status="simulation" id="policies" intro="Policies that govern the actions on this request, with what each requires and whether the facts meet it. Fictional policies.">
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

      <Authority v={v} />

      <Panel title="Confirm responsibility" status="implemented" id="responsibility">
        {v.status === "awaiting_acceptance" ? (
          <>
            <p>You are the addressed contact. Taking responsibility records your authority, conflict and capacity checks. Nothing is approved or sent by doing so.</p>
            <Offers offers={v.offers} onRun={(k) => run(k)} />
          </>
        ) : (
          <p>You took responsibility for this request. Every later step is checked against your responsibility again by the kernel.</p>
        )}
      </Panel>

      {v.status === "owner_accepted" ? (
        <>
          <Panel title="Authorise specific protection actions" status="implemented" id="actions" intro="No action is approved in bulk, and none is approved by the system. Each needs its own four checks.">
            {v.actions.length === 0 && v.scenario !== "early-support" ? (
              <>
                <Empty>No actions have been prepared yet.</Empty>
                <Offers offers={v.offers} onRun={(k) => run(k)} />
              </>
            ) : null}
            {v.actions.length === 0 && v.scenario === "early-support" ? <Empty>Nothing has been prepared, approved or sent. Use the decisions above.</Empty> : null}
            {v.corrections.map((c) => (
              <section key={c.actionId} className="card attention" aria-label={`Not confirmed: ${c.protection}`} data-testid="correction">
                <h3>Reported applied, but not confirmed: {c.protection}</h3>
                <DefList
                  rows={[
                    ["Unconfirmed protection", `${c.protection} (${c.actionId})`],
                    ["What is known", c.reported],
                    ["Operational owner", c.owner],
                    ["Permitted next action", c.permittedNext],
                    ["Authorisation required", c.authorisation],
                    ["Correction so far", c.correction ?? "None proposed"],
                  ]}
                />
                <Offers offers={c.offers} onRun={(k) => run(k)} />
              </section>
            ))}
            {groups.map((g) => {
              const acts = v.actions.filter((a) => a.group === g.id);
              if (acts.length === 0 && !(g.id === "support" && v.offers.some((o) => o.key === "propose:support-handover")) && !(g.id === "early-support" && v.offers.some((o) => o.key.startsWith("propose:early") || o.key.startsWith("propose:context")))) return null;
              return (
                <section key={g.id} aria-label={g.title} className="group">
                  <h3>{g.title}</h3>
                  <p className="panel-intro">{g.intro}</p>
                  {acts.map((a) => (
                    <ActionCard key={a.id} a={a} run={run} />
                  ))}
                  {g.id === "support" ? <Offers offers={v.offers.filter((o) => o.key.startsWith("propose:support"))} onRun={(k) => run(k)} /> : null}
                  {g.id === "early-support" ? <Offers offers={v.offers.filter((o) => o.key === "propose:early-support-checkin" || o.key === "propose:context-clarification-request")} onRun={(k) => run(k)} /> : null}
                  {g.id === "customer-notice" ? <Offers offers={v.offers.filter((o) => o.key.startsWith("propose:customer"))} onRun={(k) => run(k)} /> : null}
                </section>
              );
            })}
          </Panel>

          {v.recommendations.length > 0 || v.messages.length > 0 ? (
            <Panel title="Needs your decision" status="implemented" id="decide" intro="Derived by deterministic configured rules. A recommendation cannot approve or send anything.">
              {v.recommendations.map((r) => (
                <section key={r.id} className="card attention" aria-label={`${r.title} (${r.id})`}>
                  <h3>{r.title}</h3>
                  <p>{r.fact}</p>
                  <p className="muted">{r.why}</p>
                  <p className="muted"><strong>Who decides:</strong> {r.whoDecides}</p>
                  <details>
                    <summary>What is not known</summary>
                    <ul className="list">{r.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
                  </details>
                  <Offers offers={r.offers} onRun={(k) => run(k)} />
                </section>
              ))}
              {v.messages.map((m) => (
                <section key={m.templateId + m.actionId} className="card" aria-label={`Prepared customer message ${m.actionId} ${m.templateId}`}>
                  <h3>Prepared customer message</h3>
                  <p className="quote">“{m.body}”</p>
                  <p className="muted">Built from approved facts only. Released by you, never automatically.</p>
                  <Offers offers={[m.offer]} onRun={(k) => run(k)} />
                </section>
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}

      <Panel title="What needs a person next" status="implemented" id="next">
        {v.next.length === 0 ? <Empty>Nothing needs a person right now.</Empty> : <ul className="list">{v.next.map((n) => <li key={n.what}>{n.what} <span className="muted">· {n.who}</span></li>)}</ul>}
      </Panel>

      <Panel title="Record" status="implemented" id="record" intro="Evidence the kernel recorded, in order, and what each step answered.">
        <details>
          <summary>Evidence ({v.evidence.length})</summary>
          <ol className="log">{v.evidence.map((e) => <li key={e.sequence}><span className="muted">#{e.sequence} · {e.at} · {e.actor} · {e.strength}</span><br />{e.text}</li>)}</ol>
        </details>
        <details>
          <summary>Steps taken in this session ({v.history.length})</summary>
          <ol className="log history">{v.history.map((h, i) => <li key={i} className={h.ok ? "" : "refused"}><span className="muted">{h.at} · {h.by}</span><br /><strong>{h.ok ? "" : "Refused: "}{h.did}.</strong> {h.result}</li>)}</ol>
        </details>
      </Panel>

      <div className="toast-space" aria-hidden="true" />
      {outcome ? <div className="toast"><Result outcome={outcome} /></div> : <Result outcome={null} />}
    </>
  );
}

function ReviewPanel({ r }: { r: ReviewCard }) {
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

function Viewpoint() {
  return (
    <div className="viewpoint" role="note">
      <strong>Viewing as: the Protection reviewer (operator staff).</strong> You see the customer's request and the actions you may decide on. You do not see the connected systems' own controls, and you cannot record their responses for them.
    </div>
  );
}

function Authority({ v }: { v: OperatorView }) {
  return (
    <Panel title="Your authority" status="implemented" id="authority" intro="Authority is a responsibility granted to you. The kernel checks it on every step, not once.">
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
    </Panel>
  );
}

function ActionCard({ a, run }: { a: OperatorAction; run: (key: string, id?: string) => void }) {
  return (
    <article className="card action" aria-label={`${a.short} ${a.id}`} data-action={a.typeId} data-stage={a.stage}>
      <header>
        <h4>{a.short} <span className="muted">({a.id})</span></h4>
        <p className="muted">To: {a.recipient}</p>
      </header>
      <StageLine stage={a.stage} label={a.stageLabel} detail={a.stageDetail} notYetAccepted={a.notYetAccepted} />
      <Track reached={a.reached} current={a.stage} />
      {a.notApplicable ? <p className="note" role="note" data-testid="not-applicable">{a.notApplicable}</p> : null}
      {a.authorisedBy ? <p className="auth">✔ Authorised by <strong>{a.authorisedBy}</strong> · {a.authorisedAt}</p> : <p className="auth muted">Not yet authorised by anyone.</p>}
      <details>
        <summary>Exactly what would be shared, and what would not</summary>
        <DefList rows={a.fields.map((f) => [f.label, f.value] as const)} />
        <p className="muted"><strong>Never shared:</strong> {a.withheld.join("; ")}</p>
        <p className="muted"><strong>Policy:</strong> {a.policy}</p>
      </details>
      {a.attempts.length > 0 ? (
        <details>
          <summary>Attempts ({a.attempts.length})</summary>
          <ul className="list">{a.attempts.map((t) => <li key={t.n}>Attempt {t.n} · {t.at}: <strong>{t.result === "delivered" ? "recorded as delivered" : t.result === "failed" ? "failed" : "outcome unknown"}</strong>{t.reason ? ` (${t.reason})` : ""}</li>)}</ul>
        </details>
      ) : null}
      <Offers offers={a.offers} onRun={(k) => run(k, a.id)} />
    </article>
  );
}
