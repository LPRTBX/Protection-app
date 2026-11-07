import { useEffect, useRef, useState } from "react";
import { Logo } from "../Brand";
import { operatorDo, operatorView, type OperatorAction, type OperatorView } from "../../sim/views";
import { StageLine } from "../ActionCard";
import { Decisions, NextSteps, type OpenMap } from "../Decisions";
import { classifyAction, decisionCounts } from "../decisions";
import { jumpTo } from "../jump";
import { REVIEWER_STEPS, type ReviewerStep } from "../nav";
import { NavLink, useGo } from "../panelnav";
import { Empty, Panel, Result, StatusChip, useOutcome } from "../parts";
import { Authority, AuditHistory, PoliciesPanel, RequestPanel, RequestSummary, ResponsibilityBlock, ReviewPanel } from "../ReviewerParts";
import { useWorld } from "../world";
import { OVERVIEW_LABEL, OVERVIEW_URL } from "../links";
import { ExampleLoader } from "./ExampleLoader";
import { followThrough } from "./follow";
import { PresenterPanel } from "./PresenterPanel";

/** A jump requested from one step that must land on an element of another step once it has rendered. */
let pendingJump: string | null = null;
/** A jump to a decision from another step: remember the target, change step, and let the step land on it once rendered. */
export function useGoDecision() {
  const go = useGo();
  return (target: string) => { pendingJump = target; go("reviewer/decision"); };
}
export function takePendingJump(): string | null { const t = pendingJump; pendingJump = null; return t; }

/**
 * The role-focused reviewer experience for a fictional operator protection reviewer. It reads the reviewer projection and
 * issues the reviewer's existing commands. The four steps are presentation: there is no second workflow, and nothing here is
 * authentication or access control. Server-enforced access remains a production requirement.
 */
export function ReviewerApp({ step }: { step: ReviewerStep }) {
  const w = useWorld();
  const v = operatorView(w);
  const [outcome, setOutcome] = useOutcome();
  const [open, setOpen] = useState<OpenMap>({});
  const first = useRef(true);
  const run = (key: string, actionId?: string) => setOutcome(operatorDo(w, key, actionId));
  const item = REVIEWER_STEPS.find((s) => s.step === step)!;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
    const target = takePendingJump();
    if (target && jumpTo(target)) return;
    (document.getElementById("screen-title") as HTMLElement | null)?.focus();
  }, [step]);

  const counts = v.status === "none" ? null : decisionCounts(v);
  const unconfirmed = v.status === "owner_accepted" ? followThrough(v).unconfirmed.length : 0;
  const badge = (s: ReviewerStep) => (s === "decision" && counts && counts.available > 0 ? `${counts.available} available` : s === "follow-through" && unconfirmed > 0 ? `${unconfirmed} not confirmed` : s === "my-work" && v.status === "awaiting_acceptance" ? "1 waiting" : null);

  return (
    <div className="shell route-reviewer reviewer-shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to the main content</a>
      <header className="topbar" role="banner">
        <div className="brand">
          <Logo />
          <span className="vertical">Protection · Reviewer role</span>
        </div>
        <a className="btn btn-quiet leave" href="#/start" data-testid="leave-preview">Choose a different experience</a>
      </header>
      <div className="context" role="region" aria-label="Preview notice">
        <p className="ctx-labels"><StatusChip status="simulation" /> <span><strong>Reviewer role preview.</strong> You are a fictional operator protection reviewer. Fictional data, in this browser only. No live systems.</span></p>
        <p className="muted auth-note" data-testid="presentation-note">This navigation is presentation, not authentication. Server-enforced access remains a production requirement.</p>
      </div>

      <nav className="reviewer-nav" aria-label="Reviewer workspace">
        <ul>
          {REVIEWER_STEPS.map((s, i) => (
            <li key={s.step}>
              <a href={`#/${s.path}`} aria-current={s.step === step ? "page" : undefined}>
                <span className="step-n" aria-hidden="true">{i + 1}</span>
                <span className="step-label">{s.label}</span>
                <span className="nav-sub">{s.hint}</span>
                {badge(s.step) ? <span className="badge" data-testid={`badge-${s.step}`}>{badge(s.step)}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" className="main" tabIndex={-1}>
        <h1 id="screen-title" tabIndex={-1}>{item.label}</h1>
        {step === "my-work" ? <MyWork v={v} /> : null}
        {step === "situation" ? <Situation v={v} /> : null}
        {step === "decision" ? <Decision v={v} run={run} open={open} setOpen={setOpen} /> : null}
        {step === "follow-through" ? <FollowThrough v={v} /> : null}
        <div className="toast-space" aria-hidden="true" />
        {outcome ? <div className="toast"><Result outcome={outcome} /></div> : <Result outcome={null} />}
      </main>

      <PresenterPanel />

      <footer className="footer" role="contentinfo">
        <p>
          <a href={OVERVIEW_URL}>{OVERVIEW_LABEL}</a>. A fictional prototype of one role in a JALDO Protection configuration. It is not connected to a live Core and is not an operational gambling-control system. Role-specific navigation is presentation, not authentication; server-enforced access remains a production requirement.
        </p>
      </footer>
    </div>
  );
}

const Back = ({ to, children }: { to: string; children: string }) => <NavLink className="btn btn-quiet" to={to}>{children}</NavLink>;

function Nothing({ children }: { children: string }) {
  return (
    <Panel title="Nothing here yet" status="implemented">
      <Empty>{children}</Empty>
      <p><NavLink className="btn btn-primary" to="reviewer">Go to My work</NavLink></p>
    </Panel>
  );
}

// ───────────────────────── My work ─────────────────────────
export function MyWork({ v, observer = false }: { v: OperatorView; observer?: boolean }) {
  const goDecision = useGoDecision();
  if (v.status === "none" && observer) {
    return (
      <Panel title="Your queue" status="implemented" id="queue">
        <Empty>Nothing is waiting for you. The customer's request will appear here as soon as they send it.</Empty>
      </Panel>
    );
  }
  if (v.status === "none") {
    return (
      <>
        <Panel title="Your queue" status="implemented" id="queue">
          <Empty>Nothing is waiting for you. In a real operator, work would arrive from the customer app or an upstream source. For this preview, load a fictional example.</Empty>
        </Panel>
        <ExampleLoader />
      </>
    );
  }
  const c = decisionCounts(v);
  const early = v.scenario === "early-support";
  return (
    <>
      <Panel title="Your queue" status="implemented" id="queue">
        <RequestSummary v={v} />
        <p className="muted" data-testid="scenario-note">{early ? "This is the early-support review scenario, a separate scenario from the customer-requested break." : "This is the customer-requested break scenario."}</p>
        <ul className="count-lines" data-testid="decision-counts">
          <li><strong>{c.available}</strong> available for your decision now</li>
          <li><strong>{c.waiting}</strong> waiting on another system or prerequisite</li>
          <li><strong>{c.done}</strong> completed</li>
        </ul>
        <NextSteps v={v} onJump={goDecision} />
        <p className="actions">
          {v.status === "awaiting_acceptance" ? <NavLink className="btn btn-primary" to="reviewer/decision">Take responsibility in Decision</NavLink> : c.available > 0 ? <NavLink className="btn btn-primary" to="reviewer/decision">Go to Decision ({c.available} available)</NavLink> : <NavLink className="btn btn-primary" to="reviewer/follow-through">See follow-through</NavLink>}
          <Back to="reviewer/situation">Read the situation first</Back>
        </p>
      </Panel>
    </>
  );
}

// ───────────────────────── Situation ─────────────────────────
export function Situation({ v, observer = false }: { v: OperatorView; observer?: boolean }) {
  if (v.status === "none") return <Nothing>{observer ? "There is no situation to read yet. The customer has not sent a request." : "There is no situation to read yet. Load a fictional example in My work."}</Nothing>;
  return (
    <>
      <Panel title="The request" status="implemented" id="situation-summary">
        <RequestSummary v={v} />
      </Panel>
      {v.review ? <ReviewPanel r={v.review} /> : null}
      <PoliciesPanel v={v} />
      <RequestPanel v={v} />
      <Authority v={v} />
      <p className="actions"><NavLink className="btn btn-primary" to="reviewer/decision">Go to Decision</NavLink></p>
    </>
  );
}

// ───────────────────────── Decision ─────────────────────────
export function Decision({ v, run, open, setOpen, observer = false }: { v: OperatorView; run: (k: string, id?: string) => void; open: OpenMap; setOpen: (m: OpenMap) => void; observer?: boolean }) {
  if (v.status === "none") return <Nothing>{observer ? "There is nothing to decide yet. The customer has not sent a request." : "There is nothing to decide yet. Load a fictional example in My work."}</Nothing>;
  return (
    <>
      <Panel title="Before you decide" status="implemented" id="before-decide">
        <p><strong>Contact choice now:</strong> {v.communicationPermission.current}</p>
        <p className="muted">{v.communicationPermission.explanation}</p>
        <p className="muted">The full requirements, uncertainty and source are in <NavLink to="reviewer/situation">Situation</NavLink>. Each decision below repeats what it would share and the requirements that apply to it.</p>
      </Panel>
      {v.status === "awaiting_acceptance" ? (
        <Panel title="Take responsibility" status="implemented" id="responsibility-panel">
          <NextSteps v={v} onJump={jumpTo} />
          <ResponsibilityBlock v={v} run={run} />
        </Panel>
      ) : (
        <>
          <Panel title="Your responsibility" status="implemented" id="responsibility-panel">
            <ResponsibilityBlock v={v} run={run} />
            <NextSteps v={v} onJump={jumpTo} />
          </Panel>
          <Decisions v={v} run={run} open={open} setOpen={setOpen} />
          <p className="actions"><NavLink className="btn btn-primary" to="reviewer/follow-through">See follow-through</NavLink></p>
        </>
      )}
    </>
  );
}

// ───────────────────────── Follow-through ─────────────────────────
function FollowItem({ a }: { a: OperatorAction }) {
  const c = classifyAction(a);
  return (
    <article className="card follow-item" aria-label={`${a.short} ${a.id}`} data-stage={a.stage} data-change-key={`action:${a.id}`}>
      <header>
        <h4>{a.short} <span className="muted">({a.id})</span></h4>
        <p className="muted">To: {a.recipient}</p>
      </header>
      <StageLine stage={a.stage} label={a.stageLabel} detail={a.stageDetail} notYetAccepted={a.notYetAccepted} />
      {c.blocker && c.blocker !== a.stageDetail && a.stage !== "unresolved" ? <p className="blocker"><strong>Waiting:</strong> {c.blocker}</p> : null}
      {a.authorisedBy ? <p className="auth">✔ Authorised by <strong>{a.authorisedBy}</strong> · {a.authorisedAt}</p> : <p className="auth muted">Not yet authorised by anyone.</p>}
    </article>
  );
}

export function FollowThrough({ v, observer = false }: { v: OperatorView; observer?: boolean }) {
  if (v.status === "none") return <Nothing>{observer ? "There is nothing to follow through yet. The customer has not sent a request." : "There is nothing to follow through yet. Load a fictional example in My work."}</Nothing>;
  if (v.status === "awaiting_acceptance" || v.actions.length === 0) {
    return (
      <Panel title="Nothing decided yet" status="implemented">
        <Empty>No action has been put forward, approved or sent, so there is nothing to follow through. Nothing has happened on any other system.</Empty>
        <p><NavLink className="btn btn-primary" to="reviewer/decision">Go to Decision</NavLink></p>
      </Panel>
    );
  }
  const f = followThrough(v);
  const section = (id: string, title: string, intro: string, list: OperatorAction[]) =>
    list.length === 0 ? null : (
      <section id={id} className="decision-group" aria-labelledby={`${id}-h`} data-count={list.length}>
        <h3 id={`${id}-h`}>{title} <span className="count">({list.length})</span></h3>
        <p className="muted">{intro}</p>
        {list.map((a) => <FollowItem key={a.id} a={a} />)}
      </section>
    );
  return (
    <>
      <Panel title="What has happened since you decided" status="implemented" id="follow" intro="Approving and sending are your steps. Another system has acted only when its own response is recorded here as received, accepted or applied. An outcome is confirmed only after the simulated read-back matches and you record it.">
        {f.unconfirmed.length > 0 ? <p className="note" role="note" data-testid="unconfirmed-note"><strong>{f.unconfirmed.length} not confirmed.</strong> Do not treat {f.unconfirmed.map((a) => a.short.toLowerCase()).join(" or ")} as done.</p> : null}
        {section("follow-needs-you", "Needs your decision", "Something here is available for you to decide now.", f.groups["needs-you"])}
        {section("follow-with-others", "With another system or team, not confirmed", "These have left your hands. They are not done until the other side responds and the check matches.", f.groups["with-others"])}
        {section("follow-held", "Held until a prerequisite or an approval", "Nothing has been sent for these.", f.groups.held)}
        {section("follow-confirmed", "Confirmed", "A simulated read-back matched and a named person recorded the confirmation. A confirmed control is not a customer outcome.", f.groups.confirmed)}
        {section("follow-closed", "Closed", "No longer in play.", f.groups.closed)}
        {f.groups["needs-you"].length > 0 ? <p><NavLink className="btn btn-primary" to="reviewer/decision">Go to Decision</NavLink></p> : null}
      </Panel>
      {v.corrections.length > 0 ? (
        <Panel title="Reported applied, but not confirmed" status="implemented" id="follow-corrections">
          {v.corrections.map((c) => (
            <section key={c.actionId} className="card attention" aria-label={`Not confirmed: ${c.protection}`}>
              <h3>{c.protection}</h3>
              <p>{c.reported}</p>
              <p className="muted"><strong>Next step belongs to:</strong> {c.owner}. <strong>Permitted next action:</strong> {c.permittedNext}</p>
            </section>
          ))}
        </Panel>
      ) : null}
      <AuditHistory v={v} />
    </>
  );
}
