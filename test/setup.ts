import fc from 'fast-check';

// Deterministic property runs locally and in CI; bump numRuns per test where it matters.
// FC_SEED=<n> explores other inputs locally, e.g. `FC_SEED=7 pnpm test`.
fc.configureGlobal({ seed: Number(process.env.FC_SEED ?? 42), numRuns: 200 });

// Integration tests read email codes from the in-memory dev outbox.
process.env.ENABLE_DEV_OUTBOX = '1';
