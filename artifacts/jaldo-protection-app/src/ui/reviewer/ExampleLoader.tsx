import { Result, useOutcome } from "../parts";
import { useWorld } from "../world";
import { EXAMPLES, loadExample } from "./example";

/** "Load fictional example": demonstration setup. It runs existing world commands and is clearly not the reviewer's work. */
export function ExampleLoader({ compact = false, onLoaded }: { compact?: boolean; onLoaded?: () => void }) {
  const w = useWorld();
  const [outcome, setOutcome] = useOutcome();
  const loaded = !!w.state;
  return (
    <section className={`example-loader ${compact ? "compact" : ""}`} aria-labelledby={compact ? "example-h-c" : "example-h"} data-testid={compact ? "example-loader-presenter" : "example-loader"}>
      <h2 id={compact ? "example-h-c" : "example-h"}>Load fictional example</h2>
      <p className="setup-label" data-testid={compact ? "setup-label-presenter" : "setup-label"}><strong>Demonstration setup.</strong> This sets the scene so there is something to review. It is not part of the reviewer's work, and everything it loads is fictional.</p>
      <p className="muted">The two examples below are separate scenarios. Loading one does not continue into the other, and no workflow joins them.</p>
      <ul className="examples">
        {EXAMPLES.map((e, i) => (
          <li key={e.id} className="card">
            <h3>{e.label}{i === 0 ? <span className="tag">Start here</span> : <span className="tag">Separate scenario</span>}</h3>
            <p>{e.summary}</p>
            <p className="muted">{e.setup}</p>
            <button type="button" className={`btn ${i === 0 ? "btn-primary" : "btn-quiet"}`} disabled={loaded} aria-describedby={loaded ? "example-why" : undefined}
              onClick={() => { const r = loadExample(w, e.id); setOutcome(r); if (r.ok) onLoaded?.(); }}>
              Load fictional example: {e.label.toLowerCase()}
            </button>
          </li>
        ))}
      </ul>
      {loaded ? <p className="hint" id="example-why">A fictional session is already loaded. Reset it from the presenter panel to load another example.</p> : null}
      <Result outcome={outcome} />
    </section>
  );
}
