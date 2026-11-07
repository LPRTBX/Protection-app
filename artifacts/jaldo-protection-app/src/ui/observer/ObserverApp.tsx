import { useEffect, useRef, useState } from "react";
import { Logo } from "../Brand";
import { OVERVIEW_LABEL, OVERVIEW_URL } from "../links";
import { StatusChip } from "../parts";
import { useWorld } from "../world";
import { diffSnapshots, snapshotOf, type PanelId, type Snap } from "./changes";
import { CustomerPanel } from "./CustomerPanel";
import { OpsPanel } from "./OpsPanel";
import { ReviewerPanel } from "./ReviewerPanel";

const PANELS: { id: PanelId; label: string; short: string }[] = [
  { id: "customer", label: "Customer", short: "Customer" },
  { id: "reviewer", label: "Protection reviewer", short: "Reviewer" },
  { id: "operations", label: "Operations and connected systems", short: "Operations" },
];
const FLASH_MS = 2400;
type Mode = "desktop" | "tablet" | "phone";
const modeNow = (): Mode => (typeof window === "undefined" || !window.matchMedia ? "desktop" : window.matchMedia("(min-width: 1100px)").matches ? "desktop" : window.matchMedia("(min-width: 700px)").matches ? "tablet" : "phone");
function useMode(): Mode {
  const [mode, setMode] = useState<Mode>(modeNow);
  useEffect(() => {
    const qs = [window.matchMedia("(min-width: 1100px)"), window.matchMedia("(min-width: 700px)")];
    const on = () => setMode(modeNow());
    qs.forEach((q) => q.addEventListener("change", on));
    return () => qs.forEach((q) => q.removeEventListener("change", on));
  }, []);
  return mode;
}
const zero = (): Record<PanelId, number> => ({ customer: 0, reviewer: 0, operations: 0 });

/**
 * The demonstration observer view: the customer, the protection reviewer and Operations with their connected systems, side by
 * side, reading ONE fictional session through their own existing projections. Nothing here advances the session: every change
 * comes from a real interaction in one panel, and the other panels re-read the session immediately. The only added behaviour is
 * a brief highlight on items that really changed, and an indicator of updates in a panel that is not on screen.
 */
export function ObserverApp() {
  const w = useWorld();
  const version = w.getVersion();
  const mode = useMode();
  const [order, setOrder] = useState<PanelId[]>(["customer", "reviewer", "operations"]);
  const visible = new Set<PanelId>(mode === "desktop" ? PANELS.map((p) => p.id) : mode === "tablet" ? order.slice(0, 2) : order.slice(0, 1));
  const [unseen, setUnseen] = useState<Record<PanelId, number>>(zero);
  const [pulse, setPulse] = useState<Record<PanelId, boolean>>({ customer: false, reviewer: false, operations: false });
  const [announce, setAnnounce] = useState("");
  const prev = useRef<Record<PanelId, Snap> | null>(null);
  const timers = useRef(new Map<Element, number>());
  const visibleKey = [...visible].join(",");

  // A real change in the session: find what changed in each role's own projection, highlight it, and note updates in hidden panels.
  useEffect(() => {
    const next = { customer: snapshotOf("customer", w), reviewer: snapshotOf("reviewer", w), operations: snapshotOf("operations", w) };
    const before = prev.current;
    prev.current = next;
    if (!before) return;
    const say: string[] = [];
    const add = zero();
    const pulsed: PanelId[] = [];
    for (const p of PANELS) {
      const changes = diffSnapshots(before[p.id], next[p.id]);
      if (changes.length === 0) continue;
      const root = document.getElementById(`panel-${p.id}`);
      for (const c of changes) {
        root?.querySelectorAll(`[data-change-key="${c.key}"]`).forEach((el) => {
          el.setAttribute("data-changed", "1");
          const old = timers.current.get(el);
          if (old) window.clearTimeout(old);
          timers.current.set(el, window.setTimeout(() => { el.removeAttribute("data-changed"); timers.current.delete(el); }, FLASH_MS));
        });
      }
      pulsed.push(p.id);
      if (!visible.has(p.id)) add[p.id] = changes.length;
      say.push(`${p.short} panel: ${changes[0].label}${changes.length > 1 ? ` and ${changes.length - 1} more` : ""}`);
    }
    if (pulsed.length) {
      setPulse((s) => ({ ...s, ...Object.fromEntries(pulsed.map((id) => [id, true])) }));
      window.setTimeout(() => setPulse((s) => ({ ...s, ...Object.fromEntries(pulsed.map((id) => [id, false])) })), FLASH_MS);
      setUnseen((s) => ({ customer: s.customer + add.customer, reviewer: s.reviewer + add.reviewer, operations: s.operations + add.operations }));
      setAnnounce(say.join(". "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Panels that come on screen have nothing unseen.
  useEffect(() => { setUnseen((s) => ({ customer: visible.has("customer") ? 0 : s.customer, reviewer: visible.has("reviewer") ? 0 : s.reviewer, operations: visible.has("operations") ? 0 : s.operations })); }, [visibleKey]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const bring = (id: PanelId) => setOrder((o) => [id, ...o.filter((x) => x !== id)]);
  const wrongScenario = w.scenario !== "customer-break";
  const common = (id: PanelId) => ({ visible: visible.has(id), pulse: pulse[id], unseen: unseen[id] });

  return (
    <div className="shell route-observe">
      <a className="skip" href="#observer-main" onClick={(e) => { e.preventDefault(); document.getElementById("observer-main")?.focus(); }}>Skip to the panels</a>
      <header className="topbar" role="banner">
        <div className="brand">
          <Logo />
          <span className="vertical">Protection · Demonstration observer view</span>
        </div>
        <a className="btn btn-quiet leave" href="#/start" data-testid="leave-preview">Choose a different experience</a>
      </header>
      <div className="context observer-notice" role="region" aria-label="Demonstration observer view">
        <p className="ctx-labels"><StatusChip status="simulation" /> <span><strong>Demonstration observer view.</strong> Three roles' screens over one fictional session. In real use, each person sees only their own screen. Fictional data, in this browser only.</span></p>
        <p className="muted auth-note" data-testid="presentation-note">This layout is presentation, not authentication. Server-enforced access remains a production requirement.
          {" "}<button type="button" className="btn btn-quiet reset-inline" onClick={() => w.reset()} data-testid="observer-reset">Start the session again</button></p>
        <details className="notice-more" data-testid="notice-more">
          <summary>About this view</summary>
          <p className="reset-in-more"><button type="button" className="btn btn-quiet" onClick={() => w.reset()} data-testid="observer-reset-more">Start the session again</button></p>
          <p>Each panel reads only its own role's information and works on its own, with its own navigation and scroll. A change made in one panel appears in the others as soon as it happens, and the item that changed is highlighted briefly.</p>
          <p className="muted">Nothing here advances by itself. Approving or sending never moves another system: each destination answers only when its simulated controls are used.</p>
        </details>
      </div>

      {mode !== "desktop" ? (
        <div className="panel-switch" role="group" aria-label={mode === "tablet" ? "Choose two panels to compare" : "Choose a panel"} data-testid="panel-switch">
          {PANELS.map((p) => (
            <button key={p.id} type="button" className="btn btn-quiet" aria-pressed={visible.has(p.id)} onClick={() => bring(p.id)} data-testid={`switch-${p.id}`}>
              <span>{p.short}</span>
              {unseen[p.id] > 0 ? <span className="obs-unseen" data-testid={`switch-unseen-${p.id}`}>{unseen[p.id]} new</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {wrongScenario ? (
        <p className="note attention" role="note" data-testid="wrong-scenario">This session is the early-support scenario, which has no customer. Start the session again to watch the customer-requested break across the three roles.</p>
      ) : null}

      <h1 className="sr-only">Demonstration observer view: the customer, the protection reviewer, and Operations with connected systems</h1>
      <main id="observer-main" className="observer-grid" tabIndex={-1} data-mode={mode}>
        <CustomerPanel {...common("customer")} />
        <ReviewerPanel {...common("reviewer")} />
        <OpsPanel {...common("operations")} />
      </main>
      <div className="sr-only" role="status" aria-live="polite" data-testid="observer-announce">{announce}</div>
      <footer className="footer" role="contentinfo">
        <p><a href={OVERVIEW_URL}>{OVERVIEW_LABEL}</a>. A fictional prototype. It is not connected to a live Core and is not an operational gambling-control system. Role-specific screens and this combined layout are presentation, not authentication; server-enforced access remains a production requirement.</p>
      </footer>
    </div>
  );
}
