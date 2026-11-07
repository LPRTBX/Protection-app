import { CONTACT_CHOICES, FICTIONAL_NOTES } from "../../sim/scope";
import type { Outcome, ProtectionWorld } from "../../sim/session";

/**
 * "Load fictional example" for the role preview. This is demonstration setup, not part of the reviewer's work: it calls the
 * existing world commands that the customer app and the simulated upstream source already use, with the same fixed, fictional
 * inputs, and nothing else. It creates no record the app could not already create, and it never acts as the reviewer.
 */
export type ExampleId = "customer-break" | "early-support";

export const EXAMPLES: readonly { id: ExampleId; label: string; summary: string; setup: string }[] = [
  {
    id: "customer-break",
    label: "Customer-requested break",
    summary: "A fictional customer has asked for a 7-day break. This is where the role preview starts.",
    setup: "Demonstration setup sends the fictional customer's request through the customer channel, as the customer app would.",
  },
  {
    id: "early-support",
    label: "Early-support review",
    summary: "A fictional upstream source has asked for a human early-support review. A separate scenario with its own steps.",
    setup: "Demonstration setup admits the simulated upstream source's fixed review event, as Simulation controls would. No customer request is involved.",
  },
];

export function loadExample(w: ProtectionWorld, id: ExampleId): Outcome {
  if (w.state) return { ok: false, code: "already_loaded", message: "A fictional session is already loaded. Reset it from the presenter panel to load another example." };
  if (id === "customer-break") {
    const picked = w.selectScenario("customer-break");
    if (!picked.ok) return picked;
    return w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id, note: FICTIONAL_NOTES[1].text });
  }
  const picked = w.selectScenario("early-support");
  if (!picked.ok) return picked;
  const preset = w.applyP2Preset("p2-current");
  if (!preset.ok) return preset;
  return w.admitSignal();
}
