import { customerView, operationsView, operatorView } from "../sim/views";
import { Panel, StatusChip } from "./parts";
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

  const steps = [
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
      <p className="lede">A customer asks for a break. A person authorises each specific action. Separate simulated systems apply them. What was applied, by whom, and what is still open stays visible to the people who need to see it, and nothing more is shown to anyone else. It coordinates the response across existing systems; it does not replace an operator's responsible-gambling programme, score anyone, or only restrict.</p>
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
        <ul className="list">
          <li><strong>One succeeds, one fails.</strong> The account break is confirmed. The marketing system refuses. The customer is told only what is confirmed, and the gap is open.</li>
          <li><strong>Applied, but the read-back does not match.</strong> The system reports it applied; the simulated check disagrees. The original record is kept and never confirmed. A separately authorised correction is the permitted next step.</li>
          <li><strong>One outcome is unknown.</strong> A timed-out send is never retried. A separate reconciler checks the receiving system's own log and records the finding.</li>
          <li><strong>Approved but never accepted.</strong> Authorised and sent, but nobody accepted it. After a day the kernel recognises the expectation has passed. Nothing is re-sent.</li>
          <li><strong>Interrupted after accepting.</strong> The system accepted, then became unavailable. A fresh recovery proposal needs a person with approval authority; no earlier approval is reused.</li>
        </ul>
        <p><a className="btn btn-quiet" href="#/simulation">Open Simulation controls</a></p>
      </Panel>
      <Panel title="What this is" status="simulation">
        <p>A fictional prototype. All names, systems and data are invented, and everything lives in this browser tab. It does not touch any real account, marketing platform, notification service or gambling system. It uses the shared JALDO kernel in the browser; it is not connected to a live JALDO Core.</p>
        <p><StatusChip status="implemented" /> means the screen runs the shared kernel. <StatusChip status="simulation" /> means invented data and stand-in systems. <StatusChip status="future" /> means not built.</p>
      </Panel>
    </>
  );
}
