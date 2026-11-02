import type { Executor } from "@workspace/jaldo-orchestration";

/**
 * Scripted SIMULATED systems. These are stand-ins for connectors that do not exist. They never touch a network, an account,
 * a marketing platform or a notification service. They only decide, from a scripted behaviour, what an injected executor
 * returns and what each system's own channel does next. The kernel decides everything else.
 */
export const CONNECTOR_KEYS = ["account-controls", "account-controls-manual", "marketing-suppression", "marketing-suppression-manual", "support-team"] as const;
export type ConnectorKey = (typeof CONNECTOR_KEYS)[number];

export const BEHAVIOURS = ["applies", "refuses", "times-out", "no-acknowledgement"] as const;
export type Behaviour = (typeof BEHAVIOURS)[number];
export const BEHAVIOUR_LABEL: Record<Behaviour, string> = {
  applies: "Receives, accepts and applies it",
  refuses: "Refuses the request (a known failure)",
  "times-out": "Times out (the outcome is unknown)",
  "no-acknowledgement": "Receives it but never accepts it",
};

export const READ_BACKS = ["matches", "does-not-match"] as const;
export type ReadBack = (typeof READ_BACKS)[number];
export const READ_BACK_LABEL: Record<ReadBack, string> = {
  matches: "Simulated read-back matches what was requested",
  "does-not-match": "Simulated read-back does not match",
};

export interface ConnectorScript {
  behaviour: Behaviour;
  /** For `times-out` only: whether the request in fact arrived. The receiving system's own log knows; the caller does not. */
  reachedAnyway: boolean;
  readBack: ReadBack;
}

export const defaultScripts = (): Record<ConnectorKey, ConnectorScript> => ({
  "account-controls": { behaviour: "applies", reachedAnyway: true, readBack: "matches" },
  "account-controls-manual": { behaviour: "applies", reachedAnyway: true, readBack: "matches" },
  "marketing-suppression": { behaviour: "applies", reachedAnyway: true, readBack: "matches" },
  "marketing-suppression-manual": { behaviour: "applies", reachedAnyway: true, readBack: "matches" },
  "support-team": { behaviour: "applies", reachedAnyway: true, readBack: "matches" },
});

export const PRESETS = [
  {
    id: "happy",
    label: "Everything works",
    detail: "Both systems accept and apply it, and the simulated read-backs match.",
    scripts: {},
  },
  {
    id: "one-fails",
    label: "One succeeds, one fails",
    detail: "Account controls applies it. The marketing system refuses every attempt.",
    scripts: { "marketing-suppression": { behaviour: "refuses" } },
  },
  {
    id: "unknown",
    label: "One outcome is unknown",
    detail: "The account system times out. Whether it arrived is only known from its own log.",
    scripts: { "account-controls": { behaviour: "times-out", reachedAnyway: true } },
  },
  {
    id: "unaccepted",
    label: "Approved but never accepted",
    detail: "The account system receives the request and never accepts it.",
    scripts: { "account-controls": { behaviour: "no-acknowledgement" } },
  },
  {
    id: "mismatch",
    label: "Applied, but the read-back does not match",
    detail: "The account system reports the break applied; the simulated read-back does not match. Recovery is a separate, freshly authorised correction.",
    scripts: { "account-controls": { readBack: "does-not-match" } },
  },
  {
    id: "interruption",
    label: "Interrupted after accepting",
    detail: "Everything works until Protection Operations records the account system as unavailable after it accepted.",
    scripts: {},
  },
] as const satisfies readonly { id: string; label: string; detail: string; scripts: Partial<Record<ConnectorKey, Partial<ConnectorScript>>> }[];
export type PresetId = (typeof PRESETS)[number]["id"];

/** The executor port the kernel calls. One idempotency key, one outcome, per the scripted behaviour. */
export function makeExecutor(scripts: Record<ConnectorKey, ConnectorScript>, onUncertain: (key: string, actionId: string, arrived: boolean) => void): Executor {
  return (request) => {
    // A notice addressed to the customer is an in-app message record. Nothing is notified outside this page.
    if (request.recipient === "customer") return { status: "delivered", reference: `APP-${request.key.replace("#", "-")}` };
    const script = scripts[request.recipient as ConnectorKey];
    if (!script) return { status: "failed", reason: "No connector is configured for this recipient (simulated)", retryable: false };
    if (script.behaviour === "refuses") return { status: "failed", reason: "The system refused the request (simulated)", retryable: true };
    if (script.behaviour === "times-out") {
      onUncertain(request.key, request.actionId, script.reachedAnyway);
      return { status: "uncertain", reason: "no response before the time limit (simulated)" };
    }
    return { status: "delivered", reference: `SIM-${request.key.replace("#", "-")}` };
  };
}
