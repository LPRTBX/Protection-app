/**
 * JALDO OS orchestration kernel — the shared, versioned, industry-neutral
 * coordination logic persisted by JALDO Core. Pure: no database, HTTP,
 * identity provider, UI or deployment-specific module is imported here.
 * Deployment configurations live under `./deployments` and are imported by
 * consumers, never by the kernel. See
 * `docs/architecture/JALDO-OS-ARCHITECTURE-v1.0.md`.
 */
export * from "./version";
export * from "./contracts";
export * from "./kernel";
