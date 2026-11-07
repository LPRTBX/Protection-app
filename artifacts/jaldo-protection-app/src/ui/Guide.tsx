import { customerView, operationsView, operatorView } from "../sim/views";
import { OVERVIEW_LABEL, OVERVIEW_URL } from "./links";
import { StatusChip } from "./parts";
import { ScenarioPicker } from "./ScenarioPicker";
import { useWorld } from "./world";

/** The journey in seven steps, with live progress read from the same projections the three views use. */
export function Guide() {
  const w = useWorld();
  const o = operatorView(w);
  const ops = operationsView(w);
  const c = customerView(w);
  const acts = w.actions();
  const has = (typeId: string, pred: (s: string) => boolean) => acts.some((a) => a.typeId === typeId && pred(a.state));
  const atLeast = (order: string[], from: string) => (s: string) => order.indexOf(s) >= order.indexOf(from);
  const ORDER = ["proposed", "awaiting_approval", "approved", "sent", "received", "accepted", "completed", "confirmed"];

  // `every` is true for an empty list, so a confirmed state needs a recorded request and both parts present and confirmed.
  const allConfirmed = c.hasRequest && c.parts.length > 0 && c.parts.every((p) => p.status === "confirmed");

  const esc = acts.find((a) => a.typeId === "early-support-checkin");
  const escAt = (from: string) => !!esc && ORDER.indexOf(esc.state) >= ORDER.indexOf(from);
  const earlySteps = [
    { n: 1, who: "Simulated upstream source", what: "Admit the simulated review request. Nothing is prepared, approved or sent yet", link: "simulation", done: o.status !== "none" },
    { n: 2, who: "Reviewer", what: "Take responsibility and read why this needs review: what was received, where from, what is known and unknown", link: "operator", done: o.status === "owner_accepted" },
    { n: 3, who: "Reviewer", what: "Decide: prepare an optional check-in, ask the source for clarification, or take no action", link: "operator", done: acts.length > 0 },
    { n: 4, who: "Reviewer", what: "Authorise the exact check-in, if the context is current and the customer's contact choice permits it", link: "operator", done: escAt("approved") },
    { n: 5, who: "Operations + simulated channel", what: "The in-app channel receives, accepts and delivers the check-in", link: "operations", done: escAt("completed") },
    { n: 6, who: "Operations + Reviewer", what: "Run the simulated read-back, then record the confirmation", link: "operations", done: !!esc && esc.state === "confirmed" },
    { n: 7, who: "Customer", what: "The customer sees the fixed invitation and can look at information or decline optional messages", link: "customer/today", done: c.invitation !== null },
  ];
  const steps = w.scenario === "early-support" ? earlySteps : [
    { n: 1, who: "Customer", what: "The customer asks for a break", link: "customer/options", done: c.hasRequest },
    { n: 2, who: "Reviewer", what: "Take responsibility: check the source and the policies, confirm your authority", link: "operator", done: o.status === "owner_accepted" },
    { n: 3, who: "Reviewer", what: "Authorise the account and marketing actions, one decision each", link: "operator", done: has("account-break", atLeast(ORDER, "approved")) && has("marketing-suppression", atLeast(ORDER, "approved")) },
    { n: 4, who: "Reviewer + Operations", what: "Send them to the two simulated systems, which apply them", link: "operations", done: has("account-break", atLeast(ORDER, "completed")) && has("marketing-suppression", atLeast(ORDER, "completed")) },
    { n: 5, who: "Operations + Reviewer", what: "Run the simulated read-back, then record the confirmation", link: "operations", done: has("account-break", (s) => s === "confirmed") && has("marketing-suppression", (s) => s === "confirmed") },
    { n: 6, who: "Reviewer", what: "Approve what the customer is told, now that each part is confirmed", link: "operator", done: allConfirmed },
    { n: 7, who: "Customer", what: "The customer sees only the approved status information", link: "customer/today", done: allConfirmed },
  ];
  const firstOpen = steps.find((s) => !s.done)?.n;
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const early = w.scenario === "early-support";

  const openLabel = (link: string) => (link.startsWith("customer") ? "Open the customer view" : link === "simulation" ? "Open simulation controls" : link === "operations" ? "Open Operations" : "Open the reviewer workspace");

  return (
    <>
      <p className="lede">{early ? "An upstream source asks for a human early-support review. A named person decides what, if anything, happens next. Nothing is applied to the customer's account, and the customer sees nothing until an authorised message is delivered." : "A customer asks for a break. A person authorises each action, simulated systems apply them, and what is confirmed and what is still open stays visible to the people who need it, and no one else."}</p>

      <section className="next-step" aria-labelledby="next-h" data-testid="next-step">
        <p className="progress-line" data-testid="progress">{nextStep ? `Step ${nextStep.n} of ${steps.length}` : `All ${steps.length} steps complete`}</p>
        <h2 id="next-h">{nextStep ? nextStep.what : "The journey is complete"}</h2>
        {nextStep ? (
          <>
            <p className="muted">{nextStep.who}</p>
            <p><a className="btn btn-primary" href={`#/${nextStep.link}`}>{openLabel(nextStep.link)}</a></p>
          </>
        ) : <p>Every step has a recorded result. Open any role workspace to look at the evidence, or reset in Simulation controls to run it again.</p>}
      </section>

      <details className="secondary" data-testid="journey-details">
        <summary>View the whole journey ({doneCount} of {steps.length} steps done)</summary>
        <ol className="journey" data-testid="journey">
          {steps.map((s) => (
            <li key={s.n} data-done={s.done} aria-current={firstOpen === s.n ? "step" : undefined}>
              <span className="journey-n" aria-hidden="true">{s.done ? "✔" : s.n}</span>
              <div>
                <p><strong>{s.what}</strong></p>
                <p className="muted">{s.who} · {s.done ? "Done" : firstOpen === s.n ? "Next" : "Later"} · <a href={`#/${s.link}`}>Open this view</a></p>
              </div>
            </li>
          ))}
        </ol>
      </details>

      <details className="secondary" data-testid="scenario-choice">
        <summary>Choose a different scenario</summary>
        <p className="muted">Recommended: the customer-requested break. The operator-originated early-support review is a separate scenario with its own journey; the two are not one continuous workflow. Both scenarios use the same app, kernel and three role views.</p>
        <ScenarioPicker idPrefix="guide" />
      </details>

      <details className="secondary" data-testid="failure-explorations">
        <summary>Optional: when it does not go to plan</summary>
        <p className="muted">Choose a failure behaviour in Simulation controls, then run the same journey.</p>
        {early ? (
          <ul className="list">
            <li><strong>Missing or stale context.</strong> The check-in is blocked, and the reason is shown. Clarification can be requested. A refresh needs a new coordination and is unavailable here.</li>
            <li><strong>No optional-contact permission.</strong> The check-in is refused at every step. Fresh context does not create permission.</li>
            <li><strong>Delivery refused, unknown or never accepted.</strong> No blind retry, no new channel and no new recipient. A fresh approval and current permission are needed to try again.</li>
            <li><strong>Channel unavailable after accepting.</strong> No permitted route is configured, and the app says so.</li>
          </ul>
        ) : (
          <ul className="list">
            <li><strong>One succeeds, one fails.</strong> The account break is confirmed. The marketing system refuses. The customer is told only what is confirmed, and the gap is open.</li>
            <li><strong>Applied, but the read-back does not match.</strong> The original record is kept and never confirmed. A separately authorised correction is the permitted next step.</li>
            <li><strong>One outcome is unknown.</strong> A timed-out send is never retried. A separate reconciler checks the receiving system's own log and records the finding.</li>
            <li><strong>Approved but never accepted.</strong> After a day the kernel recognises the expectation has passed. Nothing is re-sent.</li>
            <li><strong>Interrupted after accepting.</strong> A fresh recovery proposal needs a person with approval authority; no earlier approval is reused.</li>
          </ul>
        )}
        <p><a className="btn btn-quiet" href="#/simulation">Open Simulation controls</a> <span className="muted">Open gaps right now: <strong>{ops.gaps.length}</strong></span></p>
      </details>

      <p className="boundary-note" data-testid="learning-entry">
        <strong>Optional, separate from this journey:</strong> <a href="#/learning">Next time: governed learning</a>, a scripted simulation on fictional data, not live AI and not a continuation of the steps above.
      </p>

      <details className="secondary" data-testid="connected-parts-details">
        <summary>How the three parts connect</summary>
        <p className="muted">One shared JALDO Core OS kernel runs under every view. Each view reads the same records and shows only what its role needs.</p>
        <ul className="parts connected-parts" data-testid="connected-parts">
          <li><strong>System</strong><span>Policy configuration, authority, coordination, evidence and follow-up.</span><a href={OVERVIEW_URL}>{OVERVIEW_LABEL}</a></li>
          <li><strong>Reviewer and Operations</strong><span>Approvals, account controls, marketing, support, gaps and execution checks.</span><span className="parts-links"><a href="#/operator">Reviewer workspace</a><a href="#/operations">Operations</a></span></li>
          <li><strong>Customer</strong><span>Requesting help or a break, communication and progress updates.</span><a href="#/customer/today">Customer view</a></li>
        </ul>
      </details>

      <details className="secondary" data-testid="status-labels">
        <summary>What the labels mean</summary>
        <p><StatusChip status="implemented" /> The screen runs the shared JALDO kernel in this browser.</p>
        <p><StatusChip status="simulation" /> Invented data, stand-in systems or a scripted sequence.</p>
        <p><StatusChip status="future" /> A proposed live capability. It is not built and not emulated here.</p>
        <p className="muted">Not connected to a live JALDO Core. Not an operational gambling-control system.</p>
      </details>
    </>
  );
}
