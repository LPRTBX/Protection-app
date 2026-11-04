# JALDO Protection-only project acceptance criteria

These criteria define the approved scope for product changes in this Protection-only copy. The original Repl remains untouched. Product changes must stay within the two existing scenarios and the fictional, browser-local simulation.

## Scenarios and review

- Retain the customer-requested break and operator-originated early-support scenarios.
- Do not add risk scoring or a separate high-risk scenario.
- Explain why a human review is warranted, what remains uncertain, and who is authorised to approve a next step.
- Show when events occurred separately from when the information became available to the team.
- Distinguish missing information from information that exists but is not connected to the review.

## Customer agency and accountable operations

- Require explicit customer permission and authorised human approval for each relevant action.
- Preserve read-back and stale-context safeguards.
- Take no action when required context, permission, or a valid recovery route is absent.
- Show accountable owners and fallbacks.
- Keep proposed, approved, executed, and confirmed as distinct states.
- Prevent duplicate events and actions.

## Governed learning

- Use the same fictional sequence for before-and-after replay.
- Require a dry run, explicit approval by an authorised human, versioned simulation activation, and outcome verification.
- Rollback changes future runs only; existing history remains intact.
- Allow inconclusive alerts to be refined or withdrawn without automatic tightening.
- Label learning, replay results, and outcome checks as simulated; make clear that execution verification does not establish benefit or reduced harm.

## Separate views and honest limitations

- Keep customer summaries free of internal learning details.
- Label operator learning as fictional demonstration content, not as a production access-control boundary.
- Use no profiling, diagnosis, real customer data, or live services.
- Do not claim that an executed action helped or reduced harm.

## Usability and code quality

- Preserve the shared orchestration kernel and design packages; do not introduce a second orchestration engine.
- Verify the customer, operator, operations, and learning experiences at mobile and desktop sizes.
- Verify keyboard operation, visible focus, accessibility, and 200% zoom/reflow.
- Run the Protection app tests, typecheck, and build.
- Run browser checks and confirm the browser console has no application errors.
