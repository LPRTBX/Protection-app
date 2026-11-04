import { customerView, operationsView, operatorView } from "../sim/views";
import { Panel, StatusChip } from "./parts";
import { ScenarioPicker } from "./ScenarioPicker";
import { useWorld } from "./world";
import { LearningReview } from "./LearningReview";

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

  const esc = acts.find((a) => a.typeId === "early-support-checkin");
  const escAt = (from: string) => !!esc && ORDER.indexOf(esc.state) >= ORDER.indexOf(from);
  const earlySteps = [
    { n: 1, who: "Simulated upstream source", what: "Sends a fixed review request. Signal intake admits it; nothing is prepared, approved or sent", link: "simulation", done: o.status !== "none" },
    { n: 2, who: "Operator", what: "Takes responsibility and reads 'Why this needs review': what was received, where from, what is known and unknown", link: "operator", done: o.status === "owner_accepted" },
    { n: 3, who: "Operator", what: "Decides: prepare an optional check-in, ask the source for clarification, or record that they will not proceed", link: "operator", done: acts.length > 0 },
    { n: 4, who: "Operator", what: "Authorises the exact check-in after four checks, if context is current and the customer's contact choice permits it", link: "operator", done: escAt("approved") },
    { n: 5, who: "Operations + simulated channel", what: "The in-app channel receives, accepts and delivers it through its own channel", link: "operations", done: escAt("completed") },
    { n: 6, who: "Operations + Operator", what: "A simulated read-back is run, then the reviewer records the confirmation", link: "operations", done: !!esc && esc.state === "confirmed" },
    { n: 7, who: "Customer", what: "Sees the fixed invitation only now, and can look at information or decline optional messages", link: "customer/today", done: c.invitation !== null },
  ];
  const steps = w.scenario === "early-support" ? earlySteps : [
    { n: 1, who: "Customer", what: "Asks for a break", link: "customer/options", done: c.hasRequest },
    { n: 2, who: "Operator", what: "Takes responsibility, checks the source and the policies, confirms their authority", link: "operator", done: o.status === "owner_accepted" },
    { n: 3, who: "Operator", what: "Authorises the specific account and marketing actions, one decision each", link: "operator", done: has("account-break", atLeast(ORDER, "approved")) && has("marketing-suppression", atLeast(ORDER, "approved")) },
    { n: 4, who: "Operator + Operations", what: "Sends them to the two stand-in systems, which accept and apply them through their own channels", link: "operations", done: has("account-break", atLeast(ORDER, "completed")) && has("marketing-suppression", atLeast(ORDER, "completed")) },
    { n: 5, who: "Operations + Operator", what: "A simulated read-back is run in the demo, then the reviewer records the confirmation", link: "operations", done: has("account-break", (s) => s === "confirmed") && has("marketing-suppression", (s) => s === "confirmed") },
    { n: 6, who: "Operator", what: "Approves what the customer is told, now that each part is confirmed", link: "operator", done: c.parts.every((p) => p.status === "confirmed") },
    { n: 7, who: "Customer", what: "Sees only the approved status information", link: "customer/today", done: c.parts.every((p) => p.status === "confirmed") },
  ];
  const firstOpen = steps.find((s) => !s.done)?.n;

  return (
    <>
      <Panel title="Choose what to demonstrate" status="simulation" intro="Two scenarios share the same app, kernel and three role views. The customer-requested break (P1) is unchanged.">
        <ScenarioPicker idPrefix="guide" />
      </Panel>
      <p className="jump"><a className="btn btn-quiet" href="#learning-review">Explore the Next time learning demonstration</a></p>
      <p className="lede">{w.scenario === "early-support" ? "An upstream protection source asks for a human early-support review. JALDO explains the context, prepares an optional response, and a named person decides. Nothing is applied to the customer's account, the customer sees nothing until an authorised message is delivered, and the customer stays in control of what happens next." : "A customer asks for a break.  A person authorises each specific action. Separate simulated systems apply them. What was applied, by whom, and what is still open stays visible to the people who need to see it, and nothing more is shown to anyone else. It coordinates the response across existing systems; it does not replace an operator's responsible-gambling programme, score anyone, or only restrict."}</p>
      <p className="tagline"><strong>One Core. Configured for your world.</strong></p>
      <Panel title="The journey" status="implemented" intro="Each step is a real kernel command. Progress below is read from the records, not from a script.">
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
        <p className="muted">Currently open gaps in Protection Operations: <strong>{ops.gaps.length}</strong></p>
      </Panel>
      <Panel title="When it does not go to plan" status="simulation" intro="Choose a scenario in Simulation controls, then run the same journey.">
        {w.scenario === "early-support" ? (
          <ul className="list">
            <li><strong>Missing or stale context.</strong> The check-in is blocked, and the reason is shown. Clarification can be requested. A refresh needs a new coordination and is unavailable here.</li>
            <li><strong>No optional-contact permission.</strong> The check-in is refused at every step. Fresh context does not create permission.</li>
            <li><strong>Delivery refused, unknown or never accepted.</strong> No blind retry, no new channel and no new recipient. A fresh approval and current permission are needed to try again.</li>
            <li><strong>Channel unavailable after accepting.</strong> No permitted route is configured, and the app says so.</li>
          </ul>
        ) : null}
        {w.scenario === "early-support" ? null : <ul className="list">
          <li><strong>One succeeds, one fails.</strong> The account break is confirmed. The marketing system refuses. The customer is told only what is confirmed, and the gap is open.</li>
          <li><strong>Applied, but the read-back does not match.</strong> The system reports it applied; the simulated check disagrees. The original record is kept and never confirmed. A separately authorised correction is the permitted next step.</li>
          <li><strong>One outcome is unknown.</strong> A timed-out send is never retried. A separate reconciler checks the receiving system's own log and records the finding.</li>
          <li><strong>Approved but never accepted.</strong> Authorised and sent, but nobody accepted it. After a day the kernel recognises the expectation has passed. Nothing is re-sent.</li>
          <li><strong>Interrupted after accepting.</strong> The system accepted, then became unavailable. A fresh recovery proposal needs a person with approval authority; no earlier approval is reused.</li>
        </ul>}
        <p><a className="btn btn-quiet" href="#/simulation">Open Simulation controls</a></p>
      </Panel>
      <LearningReview />
      <Panel title="What this is" status="simulation">
        <p>A fictional prototype. All names, systems and data are invented, and everything lives in this browser tab. It does not touch any real account, marketing platform, notification service or gambling system. It uses the shared JALDO kernel in the browser; it is not connected to a live JALDO Core.</p>
        <p><StatusChip status="implemented" /> means the screen runs the shared kernel. <StatusChip status="simulation" /> means invented data and stand-in systems. <StatusChip status="future" /> means not built.</p>
      </Panel>
    </>
  );
}
