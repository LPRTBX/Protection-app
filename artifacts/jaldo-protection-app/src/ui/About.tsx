import { PROTECTION } from "../config/protection-config";
import { Panel, Disclaimer } from "./parts";

const SCREENS: [string, string, string][] = [
  ["Customer", "Today · Protection options · Support · My updates", "Own request and approved messages only"],
  ["Reviewer", "Review queue · Request and source · Policies · Authority · Actions · Decisions · Record", "The request, the actions the reviewer may decide on, evidence"],
  ["Operations", "Overview · Account control · Marketing · Support · Gaps · Availability · Evidence", "Customer reference, length of break, what each system was sent"],
  ["Simulation controls", "Scenarios · Stand-in behaviour · Clock · Authority", "Directs the demonstration; not a role"],
  ["Next time: governed learning", "Evidence timing · Dry run · Approval · Versioned simulation · Rollback · Customer summary preview", "An optional, separate scripted replay on fixed fictional evidence; not a role and not part of the journey"],
];

const MATRIX: { who: string; may: string; mayNot: string }[] = [
  { who: "Customer", may: "Submit their own request. See their own request and messages a person approved.", mayNot: "See any internal state, system, attempt, reviewer note or other person's data. Approve anything." },
  { who: "Protection reviewer", may: "Hold a request, propose, approve each specific action, send under that approval, release a prepared message, record confirmation.", mayNot: "Record a connected system's response for it. Verify the delivery of their own send. Change a policy." },
  { who: "Protection Operations", may: "Record that a system is unavailable. Reconcile an unknown send (never as the holder). Run a simulated read-back recorded in the demo.", mayNot: "Approve. Record a system's acceptance for it. See the customer's words or contact choice." },
  { who: "Connected systems (simulated)", may: "Acknowledge, accept and report done, each through its own channel.", mayNot: "Be spoken for by any person. See anything not sent to them." },
  { who: "Support agent / marketing operator", may: "Act on a handover or suppression sent to their team.", mayNot: "Hold the request, approve, or see other teams' records." },
  { who: "JALDO Core automation", may: "Prepare the plan as proposals, recognise moments, prepare messages.", mayNot: "Approve, send, change an account or change marketing. Nothing consequential runs without a person." },
];

export function About() {
  return (
    <>
      <Panel title="What this prototype is" status="simulation">
        <p>JALDO Protection is a mobile-first prototype of one governed journey: a customer asks for a break, a person authorises specific actions, separate simulated systems apply them, and each role sees only what it needs.</p>
        <p>It reuses the shared JALDO orchestration kernel through a configuration ({PROTECTION.id} v{PROTECTION.version}). It adds no second orchestration engine and does not claim live Core integration. The separate coordination workspace and briefings on the JALDO site are scripted simulations of their own and are not part of this app.</p>
      </Panel>
      <Panel title="Two scenarios, one app" status="implemented">
        <p><strong>Customer-requested break</strong> starts when the customer asks. <strong>Operator-originated early-support review</strong> starts when a fictional upstream source asks for a human review. Both use the same kernel and the same three role views. A signal never creates a restriction, and a review request is not evidence that harm occurred.</p>
      </Panel>
      <Panel title="Screen map" status="implemented">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Screens table, scrolls sideways on small screens">
          <table>
            <caption className="sr-only">Screens and what each shows</caption>
            <thead><tr><th scope="col">Area</th><th scope="col">Screens</th><th scope="col">Shows</th></tr></thead>
            <tbody>{SCREENS.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Role-authority matrix" status="implemented" intro="Authority is a granted responsibility, checked by the kernel on every step. There is no universal access.">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Roles table, scrolls sideways on small screens">
          <table>
            <caption className="sr-only">What each role may and may not do</caption>
            <thead><tr><th scope="col">Role</th><th scope="col">May</th><th scope="col">May not</th></tr></thead>
            <tbody>{MATRIX.map((r) => <tr key={r.who}><th scope="row">{r.who}</th><td>{r.may}</td><td>{r.mayNot}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Production boundaries" status="future" intro="Proposed live capabilities. None is built, and none is emulated here.">
        <ul className="list">
          <li>Live JALDO Core integration, tenant-scoped storage and server-enforced permissions.</li>
          <li>Real identity, authentication and identity matching.</li>
          <li>Server-enforced access for each role. The role-specific reviewer experience, and the navigation between roles in Explore the system, are presentation, not authentication; none of it restricts access.</li>
          <li>Verified, jurisdiction-specific help and self-exclusion information. JALDO does not perform registration.</li>
          <li>Scenario-scoped plans, multiple request events (a source-context refresh), permissions and context freshness as kernel preconditions, and customer-requested support: kernel capabilities that do not exist yet. The early-support scenario checks them at the demo command boundary only.</li>
          <li>Real connectors to account controls, marketing suppression and support systems, and a real notification channel.</li>
          <li>A durable communication-permissions store and authenticated server enforcement. The check in this prototype is client-side and is not production enforcement.</li>
          <li>Expectations measured in minutes or hours (the kernel's smallest unit is one day).</li>
          <li>Evaluation of customer outcomes. Nothing here measures or implies one. A confirmed control is not a customer outcome.</li>
          <li>Kernel support for verification results and permissions as first-class preconditions; here they are demo-boundary checks.</li>
        </ul>
      </Panel>
      <Disclaimer>Nothing in this prototype scores, ranks, profiles or classifies a person, infers vulnerability, or decides anything about a customer. The only trigger is the customer's own request.</Disclaimer>
    </>
  );
}
