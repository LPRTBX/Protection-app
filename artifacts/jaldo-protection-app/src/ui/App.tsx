import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "./Brand";
import { OPERATOR } from "../sim/scope";
import type { ProtectionWorld } from "../sim/session";
import { About } from "./About";
import { CustomerApp } from "./Customer";
import { Guide } from "./Guide";
import { LearningReview } from "./LearningReview";
import { OVERVIEW_LABEL, OVERVIEW_URL } from "./links";
import { experienceOf, NAV, NAV_GROUPS, routeOf } from "./nav";
import { Operations } from "./Operations";
import { Operator } from "./Operator";
import { StatusChip } from "./parts";
import { Simulation } from "./Simulation";
import { ObserverApp } from "./observer/ObserverApp";
import { ReviewerApp } from "./reviewer/ReviewerApp";
import { Start } from "./Start";
import { WorldProvider, useWorld } from "./world";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => { window.removeEventListener("hashchange", cb); window.removeEventListener("popstate", cb); };
};
const getHash = () => window.location.hash;

export function App({ world, initialRoute }: { world?: ProtectionWorld; initialRoute?: string }) {
  return (
    <WorldProvider world={world}>
      <Shell initialRoute={initialRoute} />
    </WorldProvider>
  );
}

/** Dispatches to one of the three surfaces: the front door, the role-focused reviewer experience, or Explore the system. */
export function Shell({ initialRoute }: { initialRoute?: string }) {
  const hash = useSyncExternalStore(subscribeHash, getHash, () => (initialRoute ? `#/${initialRoute}` : ""));
  const exp = experienceOf(initialRoute ? `#/${initialRoute}` : hash);
  if (exp.experience === "start") return <Start />;
  if (exp.experience === "observe") return <ObserverApp />;
  if (exp.experience === "reviewer") return <ReviewerApp step={exp.step} />;
  return <ExploreShell initialRoute={initialRoute} />;
}

function ExploreShell({ initialRoute }: { initialRoute?: string }) {
  const world = useWorld();
  const hash = useSyncExternalStore(subscribeHash, getHash, () => (initialRoute ? `#/${initialRoute}` : ""));
  const { route, tab } = routeOf(initialRoute ? `#/${initialRoute}` : hash);
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    setMenuOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    // Move focus to the screen title so keyboard and screen-reader users land at the top of the new view.
    const h1 = document.getElementById("screen-title") ?? main.current?.querySelector("h1");
    (h1 as HTMLElement | null)?.focus();
  }, [route, tab]);

  const item = NAV.find((n) => n.route === route)!;
  const customer = route === "customer";

  return (
    <div className={`shell route-${route}`}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to the main content</a>
      <header className="topbar" role="banner">
        <div className="brand">
          <Logo />
          <span className="vertical">Protection · Explore the system</span>
        </div>
        <button type="button" className="menu-toggle btn btn-quiet" aria-expanded={menuOpen} aria-controls="primary-nav" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </header>
      <div className="overview-bar">
        <a className="overview-link" href={OVERVIEW_URL} data-testid="overview-link">
          <span aria-hidden="true">←</span> {OVERVIEW_LABEL}
          <span className="overview-sub"> · the whole system, in one page</span>
        </a>
      </div>
      <div className="context" role="region" aria-label="Prototype status">
        <p className="ctx-labels"><StatusChip status="simulation" /> <span><strong>Simulation.</strong> Fictional data, in this browser only. No live systems.</span></p>
      </div>

      <div className="layout">
        <nav id="primary-nav" className={`nav ${menuOpen ? "open" : ""}`} aria-label="JALDO Protection prototype">
          <div className="nav-group" role="group" aria-labelledby="nav-experience">
            <p className="nav-heading" id="nav-experience">Experience</p>
            <ul><li><a href="#/start">Choose an experience<span className="nav-sub">Explore the system, or experience the reviewer role</span></a></li></ul>
          </div>
          {NAV_GROUPS.map((g) => (
            <div key={g.id} className="nav-group" role="group" aria-labelledby={`nav-${g.id}`}>
              <p className="nav-heading" id={`nav-${g.id}`}>{g.label}</p>
              {g.note ? <p className="nav-note">{g.note}</p> : null}
              <ul>
                {NAV.filter((n) => n.group === g.id).map((n) => (
                  <li key={n.route}>
                    <a href={`#/${n.route}`} aria-current={route === n.route ? "page" : undefined}>
                      {n.label}
                      <span className="nav-sub">{n.hint}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main id="main" ref={main} className={`main ${customer ? "main-customer" : ""}`} tabIndex={-1}>
          {customer ? null : <h1 id="screen-title" tabIndex={-1}>{item.label}</h1>}
          {route === "guide" ? <Guide /> : null}
          {customer ? <CustomerApp tab={tab} /> : null}
          {route === "operator" ? <Operator /> : null}
          {route === "operations" ? <Operations /> : null}
          {route === "simulation" ? <Simulation /> : null}
          {route === "learning" ? <LearningReview /> : null}
          {route === "about" ? <About /> : null}
        </main>
      </div>

      <footer className="footer" role="contentinfo">
        <p>
          <a href={OVERVIEW_URL}>{OVERVIEW_LABEL}</a>. JALDO Protection is a configured use of the shared JALDO Core OS. This prototype runs the shared kernel in the browser and is not connected to a live Core. It is not an operational gambling-control system, and a valid configuration is not evidence that anything is operational.
        </p>
      </footer>
      <span className="sr-only" aria-hidden="true" data-world-version={world.version} />
    </div>
  );
}
