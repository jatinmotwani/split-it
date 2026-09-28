# CLAUDE.md

@SPEC.md
@ARCHITECTURE.md

Status and next task: see `PROGRESS.md`. Never start a phase without an approved plan.

## Commands

| Command | Notes |
|---|---|
| `pnpm dev` | Dev server on :3000. Service worker is off in dev. |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (route types must be generated first). |
| `pnpm lint` / `pnpm format` / `pnpm format:check` | ESLint flat config with layer rules; Prettier (Markdown is not formatted). |
| `pnpm test` | Vitest with coverage. Integration tests use PGlite; no database needed. 100% gate on `src/lib/money`. |
| `pnpm e2e` | Builds, migrates and starts on :3200. Needs `E2E_DATABASE_URL`. `E2E_SKIP_BUILD=1` reuses the last build; `E2E_REUSE=1` reuses a running server. |
| `pnpm db:generate --name <x>` / `pnpm db:migrate` | drizzle-kit; reads `.env.local`. |
| `node scripts/make-icons.mjs` | Re-render PWA icons from `public/icons/*.svg`. |

Local e2e in a cloud sandbox: `service postgresql start`, then
`E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/splitit_e2e PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e`.

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
- TypeScript is pinned to 5.9: typescript-eslint doesn't support 6.1+ or 7 yet. ESLint is pinned to 9 because Next's config pulls in plugins that don't support 10.
- Vitest 5 needs `vite` installed as a peer. Vite 8 transforms with Oxc (`oxc:` option, not `esbuild:`).
- pnpm is strict: import only direct dependencies (`@next/env` had to be added explicitly).
- System fonts only: `next/font/google` would need network at build time, and fonts cost bytes on low-end phones.
- `server-only` is aliased to an empty module in Vitest; server code is tested directly.
- Better Auth: `getAuth()` is memoised per database so tests can swap in PGlite (`useTestDb()`).
- Sentry 11 has no `sendDefaultPii`; use `dataCollection` (configured in `src/instrumentation*.ts`).
- Playwright `waitForFunction` does not await an async predicate; use `expect.poll(() => page.evaluate(...))`.
- Serwist precache keys carry a revision query: match cached URLs by pathname.
- Kill stray servers with `pgrep -f '^next-server'`; `pkill -f next-server` matches (and kills) its own shell.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
