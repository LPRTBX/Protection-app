# JALDO Protection — isolated development copy

A development-only copy of JALDO Protection for fictional simulations and product refinement. It retains the shared orchestration kernel and design package; it does not connect to live services or use real customer data.

## Run & Operate

- `pnpm --filter @workspace/jaldo-protection-app run dev` — run the Protection preview
- `pnpm --filter @workspace/jaldo-protection-app run typecheck` — typecheck the app
- `pnpm --filter @workspace/jaldo-protection-app test` — run the app tests
- `pnpm --filter @workspace/jaldo-protection-app run ui-check` — run UI checks
- No API server, database, secrets, or live service is required for the Protection simulation.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- React + Vite
- Shared JALDO orchestration kernel and design package

## Where things live

- `artifacts/jaldo-protection-app` — Protection app and its browser simulation
- `lib/jaldo-orchestration` — shared orchestration kernel
- `lib/design` — shared design package
- `PRODUCT_ACCEPTANCE_CRITERIA.md` — proposed product and quality acceptance criteria

## Architecture decisions

- The app reuses the shared kernel; it must not introduce a second orchestration engine.
- The preview is limited to fictional simulation data and must not connect to live services.
- Product refinements are gated on review of the acceptance criteria.

## Product

JALDO Protection helps responsible teams notice when available context warrants human review, coordinate only explicitly authorized support, verify what actually happened, and improve future responses through accountable, reversible learning. The product should favor earlier, better-informed review, not increased intervention.

## User preferences

- Keep the original Repl untouched and do not publish this copy.
- Keep changes scoped to this Protection-only project.

## Gotchas

- Preserve the distinction between missing context and unconnected context.
- Verification of execution must not be presented as proof that support helped.

## Pointers

- See `PRODUCT_ACCEPTANCE_CRITERIA.md` before making product changes.
