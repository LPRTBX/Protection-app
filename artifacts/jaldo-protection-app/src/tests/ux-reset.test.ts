import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProtectionWorld } from "../sim/session";
import { operatorView } from "../sim/views";
import { CONTACT_CHOICES } from "../sim/scope";
import { NOTE } from "./helpers";

describe("Operator guidance agrees with the queue (audit finding A)", () => {
  it("a submitted break request that no one has taken names the pending step instead of 'nothing needs a person'", () => {
    const w = new ProtectionWorld();
    assert.ok(w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE }).ok);
    const v = operatorView(w);
    assert.equal(v.status, "awaiting_acceptance");
    assert.ok(v.next.length > 0, "queue says it is waiting, so something must need a person");
    assert.match(v.next[0].what, /accept responsibility/i);
    assert.match(v.next[0].who, /addressed contact/i);
  });

  it("an early-support review that no one has taken names the same pending step", () => {
    const w = new ProtectionWorld();
    assert.ok(w.selectScenario("early-support").ok);
    assert.ok(w.admitSignal().ok);
    const v = operatorView(w);
    assert.equal(v.status, "awaiting_acceptance");
    assert.match(v.next[0]?.what ?? "", /accept responsibility/i);
  });

  it("no request at all: nothing waits and nothing needs a person", () => {
    const v = operatorView(new ProtectionWorld());
    assert.equal(v.status, "none");
    assert.deepEqual(v.next, []);
  });

  it("taking responsibility does not approve or send anything, and the pending step then moves on", () => {
    const w = new ProtectionWorld();
    w.submitRequest({ duration: "7 days", contact: CONTACT_CHOICES[0].id as never, note: NOTE });
    w.acceptResponsibility();
    const v = operatorView(w);
    assert.equal(v.status, "owner_accepted");
    assert.equal(w.actions().length, 0);
    assert.ok(!v.next.some((n) => /accept responsibility/i.test(n.what)));
  });
});
