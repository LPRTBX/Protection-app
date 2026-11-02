import { SCENARIOS } from "../sim/scope";
import { Btn } from "./parts";
import { useWorld } from "./world";

/**
 * The scenario selector. Choosing a scenario writes NO operational record. Once records exist, the other scenario cannot be
 * chosen until an explicit reset, which clears records, permissions, approvals, messages and scripts.
 */
export function ScenarioPicker({ idPrefix = "sc" }: { idPrefix?: string }) {
  const w = useWorld();
  const locked = !!w.state;
  return (
    <fieldset className="choice" data-testid="scenario-picker">
      <legend>Scenario</legend>
      {SCENARIOS.map((sc) => {
        const on = w.scenario === sc.id;
        const disabled = locked && !on;
        return (
          <label key={sc.id} className={`${on ? "on" : ""} ${disabled ? "is-off" : ""}`}>
            <input type="radio" name={`${idPrefix}-scenario`} checked={on} disabled={disabled} onChange={() => w.selectScenario(sc.id)} />
            <span><strong>{sc.label}</strong> <span className="tag">{sc.tag}</span><small>{sc.detail}</small></span>
          </label>
        );
      })}
      {locked ? (
        <div className="note" role="note">
          <p>Records exist in this scenario, so the other cannot be chosen until you reset. A reset clears records, permissions, approvals, messages and scripts.</p>
          <Btn onClick={() => w.reset()}>Reset to choose another scenario</Btn>
        </div>
      ) : (
        <p className="hint">Choosing a scenario creates no record. Nothing exists until the first event is admitted.</p>
      )}
    </fieldset>
  );
}
