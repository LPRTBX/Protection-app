import { z } from "zod";

/**
 * Events and moments.
 *
 * An *event* is something an authorised source reports (a request arrived, a
 * service's capacity changed). It carries tenant and deployment scope, an
 * idempotency key, provenance, a declared purpose and a data classification,
 * and only the context keys its configured event type permits — anything
 * else is refused, not silently dropped (deny by default).
 *
 * A *moment* is what the kernel recognises from permitted facts using a
 * configured, versioned rule. Moments have a lifecycle and are deduplicated:
 * an open moment is never raised twice, and a moment that resolves and
 * occurs again is counted as a repeat rather than a new person-level signal.
 * Recognising a moment never approves, sends or decides anything.
 */

export const CLASSIFICATIONS = ["public", "internal", "personal", "sensitive"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export const classificationRank = (c: Classification) => CLASSIFICATIONS.indexOf(c);

const Ref = z.string().min(1).max(128);

export const EventEnvelopeSchema = z
  .object({
    schema: z.literal("jaldo.event"),
    id: Ref,
    /** Same key ⇒ same event. A repeated delivery is acknowledged and has no second effect. */
    idempotencyKey: Ref,
    type: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/),
    occurredAt: z.string().datetime(),
    scope: z.object({ organisationId: Ref, deploymentId: Ref }).strict(),
    source: z.object({ system: z.string().min(1).max(64), reference: Ref.optional() }).strict(),
    provenance: z
      .object({ method: z.enum(["party-channel", "member-recorded", "system", "integration"]), recordedBy: Ref.optional() })
      .strict(),
    purpose: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    classification: z.enum(CLASSIFICATIONS),
    /** Permitted factual context only. Values are short strings; no nested records. */
    context: z.record(z.string(), z.string().max(2_000)),
  })
  .strict();

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const MOMENT_STATUSES = ["recognised", "adopted", "dismissed", "resolved"] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

export interface MomentRecord {
  /** Deterministic: `<rule>` or `<rule>:<actionId>`, so the same moment is never raised twice. */
  id: string;
  ruleId: string;
  /** The configuration version whose rule recognised it. */
  ruleVersion: string;
  actionId: string | null;
  status: MomentStatus;
  firstRecognisedAt: string;
  /** How many times this moment has (re)occurred after resolving. Never anything about a person. */
  occurrences: number;
}
