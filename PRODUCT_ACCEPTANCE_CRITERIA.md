# JALDO Protection product acceptance criteria

**Status:** Proposed for review. No product behavior changes should begin until these criteria are approved.

## Product outcome and boundaries

JALDO Protection helps responsible teams notice when available context warrants human review, coordinate only explicitly authorized support, verify what actually happened, and improve future responses through accountable, reversible learning.

Acceptance is based on earlier, better-informed human review—not on more interventions, escalations, or activity.

- The product must not profile people, infer harm, diagnose, or make autonomous decisions or interventions.
- All scenarios, people, organizations, evidence, and outcomes remain fictional.
- The Protection preview must not connect to live services, use real customer data, or send external communications.
- Protection must reuse the shared JALDO orchestration kernel and design package; it must not add a duplicate orchestration engine.

## Behavior

### Context and review

- Each review shows what information is available, its source, when it was observed, and whether it is current enough for the displayed use.
- Missing evidence, an unconnected source, stale evidence, and an explicitly observed absence are represented as distinct states with plain-language explanations.
- A lack of data is never presented as evidence that a person is safe, harmed, or otherwise in a particular condition.
- The interface explains why the available context warrants review, identifies uncertainty, and leaves the decision with a responsible human.
- Review priority is not optimized or reported as an intervention-volume target.

### Permission and communication

- Before support is coordinated, the interface shows the customer’s permission, its scope, and any relevant limits.
- Support outside the recorded permission is blocked.
- Customer-facing communication states what may be shared, with whom, and why, in language understandable without operator knowledge.
- A customer can see their permission state and any support coordination relevant to them; the operator view can show the authorized scope needed to act.
- If permission is absent, unclear, expired, or withdrawn, coordination pauses and the responsible human is told what needs attention.

### Human accountability and fallback

- Every proposed support action identifies the approving role, the action, its scope, and the information it relies on.
- A human approval is required before any simulated execution. The record identifies who approved, when, and what exact proposal they approved.
- Rejection, unavailable approvers, and timeouts lead to a visible pause and a human fallback; none triggers an automatic intervention or escalation.
- The system preserves a record of the decision and its rationale without implying that the decision was correct or beneficial.

### Execution and verification

- A proposed action, an approved action, an attempted action, and a verified execution are shown as separate states.
- Verification identifies the evidence used to confirm execution and distinguishes confirmed, not confirmed, and failed outcomes.
- The interface never treats execution as proof that the support helped; claims of benefit require separate evidence and must remain qualified.
- A failed or unverified execution remains visible and offers a human next step without silently retrying or expanding the action.

### Learning and reversibility

- Learning workflows use fictional data and explicitly identified versions.
- A candidate change can be dry-run without activating it; the dry-run shows the candidate version, inputs, and differences from the current version.
- Activation requires an explicit human approval of the exact version to activate.
- Rollback restores a selected earlier version while retaining the complete history of dry-runs, approvals, activations, and rollbacks.
- Each lifecycle event records the actor, time, version, and reason; history is not overwritten by a rollback.

## UX and UI

- Customer and operator views are clearly distinct and expose only the information needed for their respective roles.
- Each decision point presents the current state, relevant evidence and timing, uncertainty, permission scope, and available human choices together.
- Status labels use plain language and do not depend on color, jargon, or unexplained scores.
- The customer view communicates permission and support activity directly; it does not expose operator-only controls.
- The operator view makes approval responsibility, fallback state, and execution verification easy to find without presenting them as automated recommendations.
- Empty, delayed, unavailable, disconnected, rejected, failed, and completed states provide an explanation and an appropriate next step.
- The primary path is understandable without training: a user can tell what is known, what is not known, what requires human review, and what will happen next.

## Accessibility

- Target WCAG 2.2 AA for the changed experience.
- All controls work with a keyboard, have visible focus, and use native semantics or equivalent accessible roles and names.
- Form inputs have persistent labels; validation errors and meaningful state updates are announced to assistive technology.
- Color is never the only way to communicate status, permission, uncertainty, or completion.
- Text and controls meet applicable contrast requirements; text remains usable at 200% zoom.
- Motion respects `prefers-reduced-motion`; no essential information is conveyed only through animation.
- Interactive targets are comfortably usable by touch, with 44-by-44 CSS pixels as the preferred target size where layout permits.

## Responsive layout

- Core review, permission, approval, verification, and learning flows remain usable at 320 CSS pixels wide and at common tablet and desktop widths.
- At narrow widths, content reflows in reading order without clipped controls or page-level horizontal scrolling.
- At 200% zoom, page-level horizontal overflow is avoided; intentionally wide data regions may scroll within a clearly identified, keyboard-accessible container.
- Navigation, dialogs, forms, and status summaries remain usable with touch, keyboard, and screen readers at each supported width.

## Code quality and verification

- Domain decisions continue to use the shared orchestration kernel; the UI must not reimplement kernel rules.
- State transitions and input shapes are explicit and validated; invalid or incomplete states fail visibly rather than silently falling back.
- Tests cover permission allowed/blocked, missing versus unconnected versus stale context, approval and fallback, execution verification, and versioned dry-run/approval/activation/rollback behavior.
- Tests use fictional fixtures and demonstrate that the preview does not make live-service calls or send external communications.
- UI checks cover role separation, keyboard access, responsive behavior, and accessible names/status announcements.
- Changes pass the Protection app typecheck and relevant tests before they are considered complete.
