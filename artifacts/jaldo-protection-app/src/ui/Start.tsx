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
        <h1 id="screen-title" tabIndex={-1}>Choose how to experience Protection</h1>
        <p className="lede">Three separate experiences of the same fictional simulation. Each starts with a clean session.</p>

        <section className="card experience primary-experience" data-testid="experience-observe" aria-labelledby="exp-observe-h">
          <p className="tag-primary">Start here</p>
          <h2 id="exp-observe-h">See coordination across roles</h2>
          <p className="who">For partners and funders</p>
          <p>Watch the customer, the protection reviewer and Operations with their connected systems side by side, all reading one fictional session. Do something in one panel and see the others change.</p>
          <ul className="list">
            <li>The customer sends a request and the reviewer sees it</li>
            <li>The reviewer takes responsibility and approves each action; sending reaches the destination</li>
            <li>Each destination receives, accepts and executes only when its simulated controls are used</li>
            <li>Verification and an authorised message update the customer; a partial failure leaves the gap visible</li>
          </ul>
          <a className="btn btn-primary" href="#/observe" onClick={() => w.reset()}>See coordination across roles</a>
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
