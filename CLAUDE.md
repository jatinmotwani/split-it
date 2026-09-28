# CLAUDE.md

@SPEC.md
@ARCHITECTURE.md

Status and next task: see `PROGRESS.md`. Never start a phase without an approved plan.

## Commands

Filled in during Phase 0 (0.1–0.15). Expected: `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm e2e`, `pnpm db:generate`, `pnpm db:migrate`.

## Working rules

- One task from `PROGRESS.md` per session. One Conventional Commit per task, with `PROGRESS.md` updated in the same commit. Afterwards, report in ≤ 5 lines what changed and what to check by hand.
- Never commit with failing tests, type errors or lint errors.
- Money logic is test-first.
- If the spec conflicts with reality, stop and ask. Record the resolution in ARCHITECTURE §1.

## Conventions

- Money: integer minor units. `number` plus `assertMinor()` at every boundary; BigInt inside `allocate()`. Never floats. Format with `formatMoney()` (en-IN).
- Writes: client-generated UUIDv7 ids, PUT upserts, `Idempotency-Key`, `baseVersion`. All client writes go through `client/mutations.ts → sendMutation()`.
- The server recomputes every split from `split_input`. Client-side shares are only a preview.
- Every group route uses `route({ auth: 'member' })`. Non-members get 404. The authz sweep test must cover every new route.
- Layers: `lib/money` is pure; `server/*` is `server-only`; `features/*` never imports `server/*`; `server/services/core` never imports `server/entitlements`.
- No `dangerouslySetInnerHTML`. Text limits live in the Zod contracts.
- No PII in logs or analytics: ids, counts and enums only.

## Upsell rules (hard rules, SPEC §9.5)

- Never block, delay or interrupt §9.1 flows. No countdowns, interstitials or full-screen upsells on open.
- Upsell only when a user taps a Plus feature: a bottom sheet where "Not now" is as prominent as "Upgrade". At most one upsell impression per user per day (server-tracked).
- Show the renewal date; cancel in ≤ 2 taps; email 3 days before an annual renewal.

## Gotchas

- Next.js 16 builds with Turbopack: use `@serwist/turbopack`, not the webpack plugin.
- Neon has no Mumbai region: DB in Singapore, Vercel functions in `sin1`.
- Resend's sandbox sender only emails the account owner until a domain is verified.
- Rounding tie-break: use `fmix32(fnv1a(...))`. Plain FNV-1a is measurably unfair when member ids share a prefix (50% vs 33%).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
