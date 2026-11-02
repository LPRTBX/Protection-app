# @workspace/jaldo-orchestration

The JALDO OS shared orchestration kernel (contract `1.0.0`). It is pure,
deterministic and industry-neutral, and is persisted by existing JALDO Core
services through `artifacts/api-server/src/orchestration/`.

* `src/contracts/`: validated contracts for events and moments, authority, orchestration, evidence and deployment configuration.
* `src/kernel/`: recognition, authority, transitions (including execution through an injected executor port), plan, anticipatory cycle, assurance and projections.
* `src/deployments/`: fictional reference configurations (`sport-integrity`, `enterprise-psychosocial`) and the Sport Stage 5B compatibility adapter. The kernel never imports these.

```sh
pnpm --filter @workspace/jaldo-orchestration run test        # all reference configurations through the same kernel
pnpm --filter @workspace/jaldo-orchestration run mutation    # authority, disclosure and execution mutations; all must be killed
SPORT_REFERENCE_DIR=<unmodified Sports Integrity checkout at 94b8567, deps installed> \
  pnpm --filter @workspace/jaldo-orchestration run sport-differential
```

Architecture, contracts, gaps, migration plan and test report: `docs/architecture/JALDO-OS-*.md`; ADR-0035.
