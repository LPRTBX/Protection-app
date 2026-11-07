import type { ReactNode } from "react";
import type { OperatorAction, OperatorView } from "../sim/views";
import { Offers, StageLine, Track } from "./ActionCard";
import { classifyView, looseOffers, nextGuidance, policiesFor, type Classified, type Group } from "./decisions";
import { DefList, Empty, Panel } from "./parts";

/** Open state for every "Review this action" entry, kept by id so an item that moves between groups stays open. */
export type OpenMap = Record<string, boolean>;

export function ReviewEntry({ id, open, setOpen, children, label = "Review this action" }: { id: string; open: OpenMap; setOpen: (m: OpenMap) => void; children: ReactNode; label?: string }) {
  return (
    <details className="review-action" data-testid="review-action" open={!!open[id]} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== !!open[id]) setOpen({ ...open, [id]: o }); }}>
      <summary>{label}</summary>
      <div className="review-body">{children}</div>
    </details>
  );
}

const GROUP_INTRO: Record<OperatorAction["group"], string> = {
  "early-support": "Optional and discretionary. Each is a separate decision for a named person. Nothing changes on the customer's account.",
  protection: "Each is a separate decision for a named person. Approving one does not approve another.",
  support: "Optional outreach. Needs the customer's CURRENT permission, checked again at every step and when sent. Whether to send it, and when, is your decision. Access to Support never depends on any of this.",
  "customer-notice": "A notice is approved only after its protection is confirmed. The customer sees nothing else about it.",
};

interface Item { key: string; cls: Classified; node: ReactNode }

function Requirements({ v, a }: { v: OperatorView; a: OperatorAction }) {
  const ps = policiesFor(v, a);
  return (
    <>
      <h5>Policy requirements</h5>
      <p className="muted"><strong>Policy:</strong> {a.policy}</p>
      {ps.length === 0 ? <p className="muted">No separate policy check is listed for this action yet.</p> : ps.map((p) => (
        <ul key={p.id} className="checks" aria-label={`${p.label} requirements`}>
          {p.checks.map((c) => (
            <li key={c.text} data-result={c.result}>
              <span className={`result result-${c.result}`}><span aria-hidden="true">{c.result === "met" ? "✔" : "!"}</span> {c.result === "met" ? "Met" : "Needs attention"}</span>
              <span>{c.text}<br /><span className="muted">{c.basis}</span></span>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}

function ActionItem({ v, a, cls, open, setOpen, run }: { v: OperatorView; a: OperatorAction; cls: Classified; open: OpenMap; setOpen: (m: OpenMap) => void; run: (k: string, id?: string) => void }) {
  return (
    <article id={`action-${a.id}`} data-change-key={`action:${a.id}`} className={`card action decision group-${cls.group}`} aria-label={`${a.short} ${a.id}`} data-action={a.typeId} data-stage={a.stage} data-group={cls.group}>
      <header>
        <h4>{a.short} <span className="muted">({a.id})</span></h4>
        <p className="muted">To: {a.recipient}</p>
      </header>
      <StageLine stage={a.stage} label={a.stageLabel} detail={a.stageDetail} notYetAccepted={a.notYetAccepted} />
      {cls.group === "waiting" && cls.blocker && cls.blocker !== a.stageDetail ? <p className="blocker" data-testid="blocker"><strong>Not available yet:</strong> {cls.blocker}</p> : null}
      {cls.group === "available" && cls.available ? <p className="available-line" data-testid="available-line"><strong>Available now:</strong> {cls.available}</p> : null}
      {a.notApplicable ? <p className="note" role="note" data-testid="not-applicable">{a.notApplicable}</p> : null}
      {a.authorisedBy ? <p className="auth">✔ Authorised by <strong>{a.authorisedBy}</strong> · {a.authorisedAt}</p> : <p className="auth muted">Not yet authorised by anyone.</p>}
      <ReviewEntry id={`action-${a.id}`} open={open} setOpen={setOpen}>
        <p className="muted">{GROUP_INTRO[a.group]}</p>
        <Track reached={a.reached} current={a.stage} />
        <h5>Exactly what would be shared</h5>
        <DefList rows={a.fields.map((f) => [f.label, f.value] as const)} />
        <p className="muted"><strong>Never shared:</strong> {a.withheld.join("; ")}</p>
        <Requirements v={v} a={a} />
        {a.attempts.length > 0 ? (
          <>
            <h5>Attempts ({a.attempts.length})</h5>
            <ul className="list">{a.attempts.map((t) => <li key={t.n}>Attempt {t.n} · {t.at}: <strong>{t.result === "delivered" ? "recorded as delivered" : t.result === "failed" ? "failed" : "outcome unknown"}</strong>{t.reason ? ` (${t.reason})` : ""}</li>)}</ul>
          </>
        ) : null}
        <h5>Your decision</h5>
        <Offers offers={a.offers} onRun={(k) => run(k, a.id)} />
      </ReviewEntry>
    </article>
  );
}

/** What needs a person next, annotated with whether each item can be done now. Only an available item links to a decision. */
export function NextSteps({ v, onJump }: { v: OperatorView; onJump: (id: string) => void }) {
  const items = nextGuidance(v);
  const available = items.filter((i) => i.state === "available");
  const other = items.filter((i) => i.state === "other");
  const blocked = items.filter((i) => i.state === "blocked");
  return (
    <div id="next" tabIndex={-1} data-testid="next-steps" data-change-key="next">
      <h3>What needs a person next</h3>
      {items.length === 0 ? <Empty>Nothing needs a person right now.</Empty> : null}
      {available.length > 0 ? (
        <>
          <p className="group-label" data-testid="next-available"><strong>Available for your decision now</strong></p>
          <ul className="list">{available.map((n, i) => <li key={`${n.what}:${i}`}>{n.what} <span className="muted">· {n.who}</span>{n.target && n.target !== "responsibility" ? <> · <a href={`#${n.target}`} onClick={(e) => { e.preventDefault(); onJump(n.target!); }}>Go to this decision</a></> : null}</li>)}</ul>
        </>
      ) : items.length > 0 ? <p data-testid="next-none-available"><strong>Nothing is available for your decision right now.</strong></p> : null}
      {other.length > 0 ? <ul className="list" data-testid="next-other">{other.map((n, i) => <li key={`${n.what}:${i}`}>{n.what} <span className="muted">· {n.who}</span></li>)}</ul> : null}
      {blocked.length > 0 ? (
        <>
          <p className="group-label" data-testid="next-waiting"><strong>Not available yet</strong></p>
          <ul className="list">{blocked.map((n, i) => <li key={`${n.what}:${i}`}>{n.what} <span className="muted">· {n.who}</span><br /><span className="muted">Cannot be completed now. {n.reason}</span></li>)}</ul>
        </>
      ) : null}
    </div>
  );
}

const TITLES: Record<Group, string> = { available: "Available for your decision now", waiting: "Waiting on another system or prerequisite", done: "Completed" };
const EMPTY: Record<Group, string> = { available: "Nothing is available for your decision right now.", waiting: "Nothing is waiting on another system or prerequisite.", done: "Nothing is completed yet." };

export function Decisions({ v, run, open, setOpen }: { v: OperatorView; run: (k: string, id?: string) => void; open: OpenMap; setOpen: (m: OpenMap) => void }) {
  const items: Item[] = [];
  const cl = classifyView(v);

  v.corrections.forEach((c, i) => {
    const cls = cl.corrections[i];
    items.push({
      key: `c-${c.actionId}`,
      cls,
      node: (
        <section key={c.actionId} id={`correction-${c.actionId}`} data-change-key={`correction:${c.actionId}`} className="card attention decision" aria-label={`Not confirmed: ${c.protection}`} data-testid="correction" data-group={cls.group}>
          <h3>Reported applied, but not confirmed: {c.protection}</h3>
          <p>{c.reported}</p>
          <p className="muted"><strong>Permitted next action:</strong> {c.permittedNext}</p>
          {cls.group === "waiting" && cls.blocker ? <p className="blocker"><strong>Not available yet:</strong> {cls.blocker}</p> : null}
          <ReviewEntry id={`correction-${c.actionId}`} open={open} setOpen={setOpen}>
            <DefList rows={[["Unconfirmed protection", `${c.protection} (${c.actionId})`], ["What is known", c.reported], ["Operational owner", c.owner], ["Permitted next action", c.permittedNext], ["Authorisation required", c.authorisation], ["Correction so far", c.correction ?? "None proposed"]]} />
            <h5>Your decision</h5>
            <Offers offers={c.offers} onRun={(k) => run(k)} />
          </ReviewEntry>
        </section>
      ),
    });
  });

  v.recommendations.forEach((r, i) => {
    const cls = cl.recommendations[i];
    items.push({
      key: `r-${r.id}`,
      cls,
      node: (
        <section key={r.id} id={`recommendation-${r.id}`} data-change-key={`recommendation:${r.id}`} className="card attention decision" aria-label={`${r.title} (${r.id})`} data-group={cls.group}>
          <h3>{r.title}</h3>
          <p>{r.fact}</p>
          {cls.group === "waiting" && cls.blocker ? <p className="blocker"><strong>Not available yet:</strong> {cls.blocker}</p> : null}
          <ReviewEntry id={`recommendation-${r.id}`} open={open} setOpen={setOpen}>
            <p className="muted">{r.why}</p>
            <p className="muted"><strong>Who decides:</strong> {r.whoDecides}</p>
            <h5>What is not known</h5>
            <ul className="list">{r.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
            <p className="muted">Derived by configured rules. A recommendation cannot approve or send anything.</p>
            <h5>Your decision</h5>
            <Offers offers={r.offers} onRun={(k) => run(k)} />
          </ReviewEntry>
        </section>
      ),
    });
  });

  v.messages.forEach((m, i) => {
    const id = `message-${m.templateId}-${m.actionId}`;
    const cls = cl.messages[i];
    items.push({
      key: id,
      cls,
      node: (
        <section key={id} id={id} data-change-key={`message:${m.templateId}-${m.actionId}`} className="card decision" aria-label={`Prepared customer message ${m.actionId} ${m.templateId}`} data-group={cls.group}>
          <h3>Prepared customer message</h3>
          <p className="muted">{m.purpose}</p>
          {cls.group === "waiting" && cls.blocker ? <p className="blocker"><strong>Not available yet:</strong> {cls.blocker}</p> : <p className="available-line"><strong>Available now:</strong> {m.offer.label}</p>}
          <ReviewEntry id={id} open={open} setOpen={setOpen}>
            <h5>Exactly what the customer would be told</h5>
            <p className="quote">“{m.body}”</p>
            <p className="muted">Built from approved facts only. Released by you, never automatically.</p>
            <h5>Your decision</h5>
            <Offers offers={[m.offer]} onRun={(k) => run(k)} />
          </ReviewEntry>
        </section>
      ),
    });
  });

  v.actions.forEach((a, i) => {
    const cls = cl.actions[i];
    items.push({ key: a.id, cls, node: <ActionItem key={a.id} v={v} a={a} cls={cls} open={open} setOpen={setOpen} run={run} /> });
  });

  // Preparing something new is not a decision on an existing action; each offer is shown with its own availability.
  looseOffers(v).forEach((o, i) => {
    const cls = cl.loose[i];
    items.push({ key: `o-${o.key}`, cls, node: <div key={o.key} className="card decision prepare" data-group={cls.group}><Offers offers={[o]} onRun={(k) => run(k)} /></div> });
  });

  const empty = v.actions.length === 0 && items.length === 0;
  return (
    <Panel title="Decisions" status="implemented" id="actions" intro="Each action is a separate decision. Nothing is approved in bulk or by the system, and each approval needs its own checks.">
      {empty ? <Empty>{v.scenario === "early-support" ? "Nothing has been prepared, approved or sent." : "No actions have been prepared yet."}</Empty> : null}
      {(["available", "waiting", "done"] as const).map((g) => {
        const list = items.filter((i) => i.cls.group === g);
        return (
          <section key={g} id={`decisions-${g}`} className={`decision-group group-${g}`} aria-labelledby={`decisions-${g}-h`} data-group={g} data-count={list.length}>
            <h3 id={`decisions-${g}-h`}>{TITLES[g]} <span className="count">({list.length})</span></h3>
            {list.length === 0 ? <p className="muted">{EMPTY[g]}</p> : list.map((i) => i.node)}
          </section>
        );
      })}
    </Panel>
  );
}
