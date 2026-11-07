import { BEHAVIOURS, BEHAVIOUR_LABEL, P2_PRESETS, PRESETS, READ_BACKS, READ_BACK_LABEL, type ConnectorKey } from "../sim/connectors";
import { CONTEXTS, CONTEXT_LABEL } from "../sim/scope";
import { ScenarioPicker } from "./ScenarioPicker";
import { Btn, Disclaimer, Panel, StatusChip } from "./parts";
import { useWorld } from "./world";

const SYSTEMS: { key: ConnectorKey; label: string }[] = [
  { key: "account-controls", label: "Account controls system" },
  { key: "marketing-suppression", label: "Marketing suppression system" },
  { key: "support-team", label: "Support team" },
  { key: "marketing-suppression-manual", label: "Manual marketing desk" },
  { key: "in-app-channel", label: "In-app message channel" },
  { key: "upstream-source", label: "Upstream protection source" },
  { key: "account-controls-manual", label: "Manual account-control desk" },
];

/** Controls for the stand-in systems, the clock and the reviewer's grant. These are the demonstration director, not a role. */
function DefListLite({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <dl className="deflist">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function Simulation() {
  const w = useWorld();
  return (
    <>
      <div className="viewpoint" role="note"><strong>Not a role.</strong> These controls direct the demonstration. They script how stand-in systems behave. They are not part of the product and give no one extra access to anything.</div>
      <Panel title="Scenario" status="simulation" intro="Which journey this session demonstrates.">
        <ScenarioPicker />
      </Panel>

      {w.scenario === "early-support" ? (
        <Panel title="Variant" status="simulation" intro="Chosen before the event is admitted; frozen after. Choosing one creates no record.">
          <fieldset className="choice" disabled={!!w.state}>
            <legend>Variant</legend>
            {P2_PRESETS.map((p) => (
              <label key={p.id} className={w.preset === p.id ? "on" : ""}>
                <input type="radio" name="p2preset" checked={w.preset === p.id} onChange={() => w.applyP2Preset(p.id)} />
                <span><strong>{p.label}</strong><small>{p.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="v-context">Source context the event will carry</label>
            <select id="v-context" value={w.variant.context} disabled={!!w.state} onChange={(e) => w.setVariant({ context: e.target.value as (typeof CONTEXTS)[number] })}>
              {CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="v-contact">Contact choice on file (a fictional record, not consent)</label>
            <select id="v-contact" value={w.variant.contact} disabled={!!w.state} onChange={(e) => w.setVariant({ contact: e.target.value as "permitted" | "not-permitted" })}>
              <option value="permitted">Permits an optional in-app message</option>
              <option value="not-permitted">Does not permit optional outreach</option>
            </select>
          </div>
          {w.preset === "custom" ? <p className="note">Custom: you changed a variant or a behaviour.</p> : null}
        </Panel>
      ) : (
        <Panel title="Scripted behaviour (customer-requested break)" status="simulation" intro="Pick how the stand-in systems will behave, then run the journey from the customer. Choosing one does not change anything already sent.">
          <fieldset className="choice">
            <legend>Behaviour</legend>
            {PRESETS.map((p) => (
              <label key={p.id} className={w.preset === p.id ? "on" : ""}>
                <input type="radio" name="preset" checked={w.preset === p.id} onChange={() => w.applyPreset(p.id)} />
                <span><strong>{p.label}</strong><small>{p.detail}</small></span>
              </label>
            ))}
          </fieldset>
          {w.preset === "custom" ? <p className="note">Custom: you changed a behaviour below.</p> : null}
        </Panel>
      )}

      {w.scenario === "early-support" ? (
        <Panel title="Simulated upstream source" status="simulation" intro="The director plays the upstream protection source, which is not a role in the app. The event is fixed and fictional: a request for a human review. It is never attributed to the customer.">
          <DefListLite rows={[["Event", "protection.review-requested"], ["Origin", "Upstream protection source (simulated), admitted by signal intake (holds only 'prepare')"], ["Context it will carry", CONTEXT_LABEL[w.variant.context]], ["Contact choice on file", w.variant.contact === "permitted" ? "Permits an optional in-app message" : "Does not permit optional outreach"]]} />
          <div className="actions">
            <Btn tone="primary" disabled={!!w.state} onClick={() => w.admitSignal()}>Admit the simulated review event</Btn>
          </div>
          <p className="muted">{w.state ? "The event has been admitted. Open the Reviewer workspace." : "Nothing exists yet. Admitting the event is the only way a review opens. It prepares, approves and sends nothing."}</p>
        </Panel>
      ) : null}

      <Panel title="Stand-in system behaviour" status="simulation" intro="Each system acts only through its own channel. Changing a behaviour applies to the next step, not to what has already happened.">
        {SYSTEMS.filter((s) => (w.scenario === "early-support" ? ["in-app-channel", "upstream-source"].includes(s.key) : !["in-app-channel", "upstream-source"].includes(s.key))).map((s) => (
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
