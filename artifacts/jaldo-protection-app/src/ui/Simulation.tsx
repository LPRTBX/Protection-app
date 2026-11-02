import { BEHAVIOURS, BEHAVIOUR_LABEL, PRESETS, READ_BACKS, READ_BACK_LABEL, type ConnectorKey } from "../sim/connectors";
import { Btn, Disclaimer, Panel, StatusChip } from "./parts";
import { useWorld } from "./world";

const SYSTEMS: { key: ConnectorKey; label: string }[] = [
  { key: "account-controls", label: "Account controls system" },
  { key: "marketing-suppression", label: "Marketing suppression system" },
  { key: "support-team", label: "Support team" },
  { key: "marketing-suppression-manual", label: "Manual marketing desk" },
  { key: "account-controls-manual", label: "Manual account-control desk" },
];

/** Controls for the stand-in systems, the clock and the reviewer's grant. These are the demonstration director, not a role. */
export function Simulation() {
  const w = useWorld();
  return (
    <>
      <div className="viewpoint" role="note"><strong>Not a role.</strong> These controls direct the demonstration. They script how stand-in systems behave. They are not part of the product and give no one extra access to anything.</div>
      <Panel title="Scenarios" status="simulation" intro="Pick how the stand-in systems will behave, then run the journey from the customer. Choosing one does not change anything already sent.">
        <fieldset className="choice">
          <legend>Scenario</legend>
          {PRESETS.map((p) => (
            <label key={p.id} className={w.preset === p.id ? "on" : ""}>
              <input type="radio" name="preset" checked={w.preset === p.id} onChange={() => w.applyPreset(p.id)} />
              <span><strong>{p.label}</strong><small>{p.detail}</small></span>
            </label>
          ))}
        </fieldset>
        {w.preset === "custom" ? <p className="note">Custom: you changed a behaviour below.</p> : null}
      </Panel>

      <Panel title="Stand-in system behaviour" status="simulation" intro="Each system acts only through its own channel. Changing a behaviour applies to the next step, not to what has already happened.">
        {SYSTEMS.map((s) => (
          <section key={s.key} className="card" aria-label={s.label}>
            <h3>{s.label}</h3>
            <div className="field">
              <label htmlFor={`b-${s.key}`}>When it is sent a request</label>
              <select id={`b-${s.key}`} value={w.scripts[s.key].behaviour} onChange={(e) => w.setBehaviour(s.key, e.target.value as (typeof BEHAVIOURS)[number])}>
                {BEHAVIOURS.map((b) => <option key={b} value={b}>{BEHAVIOUR_LABEL[b]}</option>)}
              </select>
            </div>
            {w.scripts[s.key].behaviour === "times-out" ? (
              <label className="check">
                <input type="checkbox" checked={w.scripts[s.key].reachedAnyway} onChange={(e) => w.setReachedAnyway(s.key, e.target.checked)} />
                <span>The request in fact arrived (only the receiving system's own log shows this)</span>
              </label>
            ) : null}
            {s.key !== "support-team" ? (
              <div className="field">
                <label htmlFor={`r-${s.key}`}>When read back by the simulated check</label>
                <select id={`r-${s.key}`} value={w.scripts[s.key].readBack} onChange={(e) => w.setReadBack(s.key, e.target.value as (typeof READ_BACKS)[number])}>
                  {READ_BACKS.map((b) => <option key={b} value={b}>{READ_BACK_LABEL[b]}</option>)}
                </select>
              </div>
            ) : null}
          </section>
        ))}
      </Panel>

      <Panel title="Time and authority" status="simulation">
        <p>Simulated time: <time dateTime={w.now.toISOString()}>{w.now.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false })} UTC</time></p>
        <div className="actions">
          <Btn onClick={() => w.advanceDays(1)}>Advance one day</Btn>
        </div>
        <p className="muted">Time passing sends nothing and changes nothing. It only lets the kernel's configured expectations (for example, an authorised action not accepted within a day) be recognised.</p>
        <label className="check">
          <input type="checkbox" checked={w.reviewerRevoked} onChange={(e) => w.setReviewerRevoked(e.target.checked)} />
          <span>Revoke the reviewer's responsibility (the kernel then refuses approval)</span>
        </label>
      </Panel>

      <Panel title="Start again" status="simulation">
        <Btn tone="primary" onClick={() => w.reset()}>Reset the whole simulation</Btn>
        <p className="muted">Everything lives in this browser tab. Reloading also resets it.</p>
      </Panel>
      <Disclaimer>Fictional prototype. No stand-in system touches a network, an account, a marketing platform or a notification service. <StatusChip status="simulation" /></Disclaimer>
    </>
  );
}
