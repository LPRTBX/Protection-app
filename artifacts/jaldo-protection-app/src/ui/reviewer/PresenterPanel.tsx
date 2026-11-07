import { useState } from "react";
import { operationsView } from "../../sim/views";
import { Systems, WorkGroups } from "../Operations";
import { Simulation } from "../Simulation";
import { Result, useOutcome } from "../parts";
import type { OpenMap } from "../Decisions";
import { useWorld } from "../world";
import { ExampleLoader } from "./ExampleLoader";

/**
 * The presenter panel. It is a different surface from the reviewer's workspace and is not reachable from the reviewer's
 * navigation: a presenter plays the connected systems and other teams, and sets up the demonstration. Nothing in it is the
 * reviewer's authority, and nothing in it happens because the reviewer approved or sent something.
 */
export function PresenterPanel() {
  const w = useWorld();
  const ops = operationsView(w);
  const [outcome, setOutcome] = useOutcome();
  const [open, setOpen] = useState<OpenMap>({});
  return (
    <aside className="presenter" aria-label="Presenter panel, demonstration only" data-testid="presenter-panel">
      <details id="presenter-panel" className="presenter-details">
        <summary>Presenter panel · demonstration only, outside the reviewer's role</summary>
        <p className="presenter-note" role="note">
          <strong>This is not the reviewer.</strong> A presenter plays the connected systems and other teams, and sets up the demonstration. Nothing here is the reviewer's authority. No other system acts because the reviewer approved or sent something: each response below happens only when the presenter chooses to run it, and the reviewer's workspace shows it only once it is recorded.
        </p>

        <section aria-labelledby="presenter-setup-h" className="presenter-section">
          <h2 id="presenter-setup-h">Demonstration setup</h2>
          <ExampleLoader compact />
          <p><button type="button" className="btn btn-quiet" onClick={() => w.reset()}>Reset the whole simulation</button> <span className="muted">Clears every record, approval and message.</span></p>
        </section>

        <WorkGroups v={ops} open={open} setOpen={setOpen} setOutcome={setOutcome} perspective="presenter" />
        <Systems v={ops} setOutcome={setOutcome} />

        <details className="secondary" data-testid="presenter-behaviour">
          <summary>Stand-in behaviour, scenario and the simulated clock</summary>
          <Simulation />
        </details>
        <div aria-live="polite"><Result outcome={outcome} /></div>
      </details>
    </aside>
  );
}
