import fc from 'fast-check';

// Deterministic property runs locally and in CI; bump numRuns per test where it matters.
fc.configureGlobal({ seed: 42, numRuns: 200 });
