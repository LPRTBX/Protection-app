import { ProtectionWorld } from "../sim/session";
import { CONTACT_CHOICES, FICTIONAL_NOTES } from "../sim/scope";

export const OK = CONTACT_CHOICES[0].id;
export const NOTE = FICTIONAL_NOTES[1].text;

export function opened(contact: string = OK) {
  const w = new ProtectionWorld();
  w.submitRequest({ duration: "7 days", contact: contact as never, note: NOTE });
  w.acceptResponsibility();
  w.preparePlan();
  return w;
}
export function approveAndSend(w: ProtectionWorld, id: string) {
  const a = w.approve(id);
  const d = w.dispatch(id);
  return [a, d] as const;
}
/** Drive one system's own channel to the end of its script. */
export function stepAll(w: ProtectionWorld, id: string) {
  for (let i = 0; i < 4; i++) if (!w.connectorStep(id).ok) break;
}
export function confirmed(w: ProtectionWorld, id: string) {
  stepAll(w, id);
  w.readBack(id);
  return w.confirm(id);
}
export function fullJourney() {
  const w = opened();
  for (const id of ["ACB-1", "MKT-1"]) {
    approveAndSend(w, id);
    confirmed(w, id);
  }
  for (const id of ["CAN-1", "CMN-1"]) approveAndSend(w, id);
  return w;
}
