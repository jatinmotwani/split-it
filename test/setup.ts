import fc from 'fast-check';

// Deterministic property runs locally and in CI; bump numRuns per test where it matters.
fc.configureGlobal({ seed: 42, numRuns: 200 });

// Integration tests read email codes from the in-memory dev outbox.
process.env.ENABLE_DEV_OUTBOX = '1';
