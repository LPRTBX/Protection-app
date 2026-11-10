# Protection coordination-loop audit

This records the standalone browser preview, not a production Core deployment. All events, people, destinations and evidence are fictional and held in browser memory. The app has no live AI, source integrations, customer data or external action services.

| Coordination stage | What the preview does | Status and boundary |
| --- | --- | --- |
| Signals | The front door can start one synthetic upstream-source event directly into the shared orchestration kernel; the separate P1 route still requires a customer to send their own break request. Duplicate admission in the same session is refused. | System-event initiation is scripted; no live source feed, durable event store or authenticated provenance exists. |
| Interpretation and recommendation | Versioned Protection configurations use deterministic kernel rules. P2 recommends asking the source for context; the source reason is shown as unexplained and unverified. P1's configured plan is prepared after the reviewer accepts responsibility. | Configured rules only, not live AI, diagnosis, risk scoring or a predictive profile. |
| Eligibility and rules | The kernel evaluates configured action policy, required checks, actor grants, provenance and available context. P2 has no P1 account-control plan. | Optional-contact freshness/permission is still checked by the browser adapter, not enforced by shared Core at approval and execution. No production authorization boundary is demonstrated. |
| Authorized human decision | A reviewer accepts responsibility, considers each proposal, submits it and gives any required approval. Core-created P1 proposals and P2 recommendations cannot approve or send themselves. | Human gates are demonstrated in the prototype; identities and decisions are not authenticated or durable. |
| Coordinated action and evidence | After an authorized send, the configured fictional in-app receiver emits its own receipt, acceptance and execution commands through the shared kernel. The upstream clarification route times out and stays unresolved. | Destination responses are scripted browser events, not live delivery. Read-back remains a separate Operations action and confirmation remains a separate reviewer action. Execution is not described as helpful or confirmed. |
| Reviewed improvement | The separate learning view retains its fictional, versioned before/after replay, dry run, approval, activation and rollback history. | Replay inputs are fixed synthetic data; session outcomes are not persisted to Core learning records. No autonomous learning or demonstrated outcome measurement exists. |

## What the roles can see

- The customer projection remains separate from reviewer and Operations projections; a system-originated review does not invent a customer request or show internal learning details to the customer.
- Reviewer and Operations panels remain navigable independently, with mobile panel switching.
- Operator-learning labels describe a demonstration, not a production access-control boundary. UI role separation is not security.
- No time-savings claim is made. The replay does not compare measured service delays or handovers from an external system.

## Core capabilities still needed for production

1. Authenticated, permission-scoped source integrations and durable event/provenance records.
2. Core-enforced, current consent and context checks at both approval and execution.
3. A supported way for refreshed source context to update or reopen the same coordination without replacing history.
4. Durable receiving-system acknowledgements, retries/reconciliation and independent verification.
5. A Core-supported path from verified outcomes into reviewed, versioned learning records.
6. Cross-system status-conflict recognition (see below).

The preview intentionally does not substitute local services for these missing capabilities.

### Gap: cross-system status-conflict recognition

**What is missing.** Every recognition rule the kernel has today (`capacity-lost-after-acceptance`, `unavailable-before-acceptance`, `expectation-passed`, `deadline-passed`, `request-awaiting`) reasons about **one action's own lifecycle**: whether its recipient accepted it, stayed available, or answered in time. None of them compares a *fact already recorded for one action* against a *fact recorded for a different, independently-scheduled piece of work on the same subject*. There is no contract for a second system's own schedule (for example, a marketing platform's own send calendar) as a permitted fact the kernel can read at all, so a rule such as "a promotion is still scheduled after its suppression was approved" has nothing to recognise against. This preview deliberately does not fake that comparison with a local rule, per the standing instruction not to build a second orchestration engine.

**Proposed acceptance case**, for Core to accept or reject on its own roadmap:

> Given a `marketing-suppression` action that has reached `confirmed` for a subject, and a separately recorded fact that a promotional send is scheduled for that same subject with a `scheduled-for` instant after the suppression's `confirmed` instant, when the kernel runs its anticipatory cycle, then it recognises a `conflicting-schedule` moment naming both records, recommends asking the scheduling system to cancel or reschedule the send, and takes no action on either record itself. Recognising the moment requires no new write authority: Core would need (a) a contract for a destination's own schedule as a permitted, timestamped fact, and (b) a comparison rule, versioned like the existing ones in `recognition.wording`, that only reads already-recorded facts. The reviewer still decides what happens next.

Until Core carries this contract, Protection cannot demonstrate this specific pattern without inventing a second source of truth, so it is left undemonstrated here and recorded as a gap instead.
