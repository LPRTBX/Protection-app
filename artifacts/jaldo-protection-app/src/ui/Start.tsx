import { OVERVIEW_LABEL, OVERVIEW_URL } from "./links";
import { Logo } from "./Brand";
import { StatusChip } from "./parts";
import { useWorld } from "./world";

/** The front door: two separate experiences. Choosing one starts a clean fictional session. */
export function Start() {
  const w = useWorld();
  return (
    <div className="shell route-start">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to the main content</a>
      <header className="topbar" role="banner">
        <div className="brand">
          <Logo />
          <span className="vertical">Protection</span>
        </div>
      </header>
      <div className="context" role="region" aria-label="Prototype status">
        <p className="ctx-labels"><StatusChip status="simulation" /> <span><strong>Simulation.</strong> Fictional data, in this browser only. No live systems.</span></p>
      </div>
      <main id="main" className="main start" tabIndex={-1}>
        <h1 id="screen-title" tabIndex={-1}>See Protection coordinate around an event</h1>
        <p className="lede">Start with a fictional system signal, not a customer report. Shared Core rules explain what can be reviewed; people still decide.</p>

        <section className="card experience primary-experience" data-testid="experience-observe" aria-labelledby="exp-observe-h">
          <p className="tag-primary">Start here</p>
          <h2 id="exp-observe-h">Start a fictional system-event replay</h2>
          <p className="who">For partners and funders</p>
          <p>An upstream source event opens a human review and brings its limited context into the reviewer and Operations views. No issue is inferred and no customer request is invented.</p>
          <ul className="list">
            <li>Configured Core rules recommend asking the source to clarify what remains unknown</li>
            <li>The reviewer takes responsibility and separately approves any action</li>
            <li>Configured fictional destinations respond after an authorised send; an uncertain response remains unresolved</li>
            <li>Read-back and reviewer confirmation remain separate; no outcome is claimed as helpful</li>
          </ul>
          <a className="btn btn-primary" href="#/observe" onClick={(e) => {
            e.preventDefault();
            const started = w.startSystemEventReplay();
            if (started.ok) window.location.hash = "#/observe";
          }}>Start the fictional system-event replay</a>
          <p className="muted">The source event, rules and destination responses are simulated in this browser. There is no live Core, AI or sector connection.</p>
          <p><a href="#/observe" onClick={(e) => {
            e.preventDefault();
            const ready = w.startCustomerRequestDemo();
            if (ready.ok) window.location.hash = "#/observe";
          }}>Or start with a customer-requested break</a></p>
        </section>

        <p className="muted secondary-intro">Or explore one thing at a time:</p>
        <ul className="experiences">
          <li className="card experience" data-testid="experience-explore">
            <h2>Explore the system</h2>
            <p className="who">The guided journey</p>
            <p>See how one request is carried from review to verified action, and what each role sees, one view at a time.</p>
            <ul className="list">
              <li>A guided journey with one recommended path</li>
              <li>Switch between the customer, reviewer and operations views</li>
              <li>Scenario and failure controls</li>
              <li>An optional governed-learning demonstration</li>
            </ul>
            <a className="btn btn-quiet" href="#/guide" onClick={() => w.reset()}>Explore the system</a>
          </li>
          <li className="card experience" data-testid="experience-reviewer">
            <h2>Experience the reviewer role</h2>
            <p className="who">For a fictional operator protection reviewer</p>
            <p>Work as the reviewer, in one workspace, from your queue to the follow-through.</p>
            <ul className="list">
              <li>My work, Situation, Decision, Follow-through</li>
              <li>No switching to the customer or Operations views</li>
              <li>A fictional example you load yourself</li>
              <li>A separate presenter panel for simulated responses from other systems</li>
            </ul>
            <a className="btn btn-quiet" href="#/reviewer" onClick={() => w.reset()}>Experience the reviewer role</a>
          </li>
        </ul>
        <p className="muted" data-testid="presentation-note">Role-specific navigation is presentation, not authentication. Server-enforced access remains a production requirement.</p>
      </main>
      <footer className="footer" role="contentinfo">
        <p><a href={OVERVIEW_URL}>{OVERVIEW_LABEL}</a>. JALDO Protection is a configured use of the shared JALDO Core OS. This prototype is not connected to a live Core and is not an operational gambling-control system.</p>
      </footer>
    </div>
  );
}
