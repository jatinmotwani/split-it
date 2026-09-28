# PROGRESS.md

Legend: `[ ]` todo · `[x]` done · `[~]` in progress. Each task is sized for **one ~45-minute session**, ends with **one Conventional Commit**, and has an **Accept** check. After each task, a ≤ 5-line note says what changed and what to verify by hand.

Plan status: **approved 2026-09-28; building Phases 0, 1a and 1b.** Phases 2–5 get their own plans later.

| Phase | Tasks | Rough calendar at 1 task/day |
|---|---|---|
| 0 — Foundations | 16 | ~3–4 weeks |
| 1a — Trip-ready core loop | 27 | ~6 weeks |
| 1b — Friends, comments, polish | 7 | ~1.5 weeks |

---

## Kickoff

- [x] **K.1** Spec saved as `SPEC.md`.
- [x] **K.2** Kickoff questions answered: all defaults accepted (ARCHITECTURE §1).
- [x] **K.3** `ARCHITECTURE.md`, `docs/schema.draft.ts`, `PROGRESS.md`, `CLAUDE.md` written. The schema draft compiles, generates SQL, and applies cleanly to Postgres (PGlite).
- [x] **K.4** *(you)* Review and approve this plan. Approved: "build everything".

---

## Phase 0 — Foundations

**Goal:** a deployed, empty app with sign-in (Google, email code, guest), CI green, previews working.
**Exit e2e:** on a production build, "Continue as guest" leads to "Hi, <name>".

- [ ] **0.0** *(you, ~45 min)* Create accounts and paste the keys into Vercel and `.env.local`: Vercel, Neon (project in **Singapore**, `main` + `dev` branches), Google Cloud OAuth client, Resend (sandbox is fine for now), Sentry, PostHog. The step-by-step list goes in `README.md` during 0.1.
  - Accept: `.env.local` has every key in `.env.example`; Neon `dev` branch reachable.
- [x] **0.1** Scaffold Next.js 16 (App Router, `src/`, pnpm, Node 24 `.nvmrc`, `engines`). Settings: TS `strict` + `noUncheckedIndexedAccess`. Add `src/config/app.ts` (`APP_NAME = 'Split It'`), a README quickstart, and an `.env.example` skeleton.
  - Accept: `pnpm dev` shows a placeholder home with APP_NAME; `pnpm typecheck` passes.
- [x] **0.2** ESLint flat config (next, typescript-eslint, `react/no-danger`, `no-restricted-imports` layer zones from ARCHITECTURE §3) and Prettier. Scripts `lint`, `format`, `format:check`.
  - Accept: `pnpm lint` passes; a deliberate `features → server` import fails lint.
- [x] **0.3** Vitest + fast-check + v8 coverage with a **100% branch threshold on `src/lib/money/**`**. One sample property test.
  - Accept: `pnpm test` is green; lowering coverage in `lib/money` fails the run.
- [x] **0.4** Playwright (Pixel 7 viewport, Chromium) + `@axe-core/playwright`; `e2e/smoke.spec.ts` opens `/` and runs axe.
  - Accept: `pnpm e2e` is green locally.
- [x] **0.5** GitHub Actions CI: pnpm cache → typecheck → lint → unit (coverage) → build → e2e (Postgres 17 service). Playwright report uploaded on failure.
  - Accept: CI is green on a PR.
- [x] **0.6** DB module: Drizzle + `pg` Pool (`attachDatabasePool`), `drizzle.config.ts`, `db:generate` / `db:migrate` scripts, `createTestDb()` on PGlite with migrations applied, shared `Db` type.
  - Accept: an integration test creates a PGlite DB, migrates, writes and reads a row. `pnpm db:migrate` works against the Neon dev branch.
- [~] **0.7** Better Auth core: config, Drizzle adapter, generated auth tables + migration, `/api/auth/[...all]`, Google provider, `/sign-in` page, `getSession()` helper.
  - Accept: sign in with Google locally; the home page shows your name; sign out works.
  - Status: code done and tested against PGlite. Google sign-in itself needs your OAuth client from 0.0; the button only appears once GOOGLE_CLIENT_ID/SECRET are set.
- [~] **0.8** Email code sign-in (`emailOTP` + Resend), printed to the console when `RESEND_API_KEY` is empty. Code entry uses a numeric keypad input.
  - Accept: sign in with a console code locally, and with a real email to your own address.
  - Status: code done; tested end to end against PGlite via the dev outbox. Delivery to a real inbox needs your RESEND_API_KEY from 0.0.
- [x] **0.9** Guest sessions (`anonymous` plugin, "Continue as guest" asks for a name) + `onLinkAccount` hook skeleton (a logged no-op until `group_members` exists) + 180-day rolling sessions.
  - Accept: a guest session survives a reload; linking Google afterwards gives one real user, and the anonymous user is deleted.
- [x] **0.10** `route()` wrapper: session, Zod parse, `AppError` → problem JSON, Origin check on mutations, request id, `server-only`. First contract + route: `GET /api/v1/me`. Typed `client/api.ts`.
  - Accept: unit tests cover 400 (bad body), 401 (no session), 403 (bad Origin) and the success shape.
- [x] **0.11** UI base: Tailwind v4, shadcn/ui init, lucide, system dark mode + toggle, mobile app shell (top bar, safe areas), `formatMoney` placeholder text.
  - Accept: home renders in light and dark; axe reports no violations; tap targets ≥ 44 px.
  - Status: done. shadcn's registry isn't reachable from the build sandbox, so the components are hand-written in shadcn's conventions (cva + tailwind-merge, same token names). The bottom sheet uses the native <dialog> element instead of Radix, which keeps dialog JS off core routes. System fonts only: no font download on low-end Android.
- [x] **0.12** PWA: `@serwist/turbopack` (`withSerwist`, `createSerwistRoute`), `src/sw.ts` precaching the shell, `manifest.ts`, placeholder icons, `/offline` fallback. Disabled in dev.
  - Accept: a production build is installable in Chrome; with the network off, reloading shows `/offline`.
- [ ] **0.13** Observability: Sentry (server + minimal browser init, `beforeSend` scrubbing) and PostHog `track()` (server, `after()`, per-event Zod allowlist) + `/api/events` beacon endpoint. All of it does nothing without env vars.
  - Accept: a test error from a preview shows in Sentry without PII; `track()` is unit-tested with a fake client.
- [ ] **0.14** Vercel: project, region `sin1`, env vars, Neon–Vercel integration (branch per preview), build command `pnpm db:migrate && next build`, `oAuthProxy` for previews, `CRON_SECRET`, a daily `cleanup` cron (a stub for now).
  - Accept: a PR preview deploys and Google sign-in works on it; `main` deploys to production.
- [ ] **0.15** Phase 0 exit: `e2e/auth.spec.ts` (guest → "Hi, <name>"; email code via a dev inbox stub). `CLAUDE.md` commands filled in; `.env.example` complete.
  - Accept: CI is green, including the new e2e; the production URL works on your phone.

---

## Phase 1a — Trip-ready core loop

**Goal:** a group of friends can run a real trip on it.
**Exit e2e:** 3 users (1 guest) record 20 mixed expenses on a mobile viewport. Balances match the oracle, and applying the settle suggestions zeroes everyone.

### Money engine (test-first, pure — `src/lib/money`)

- [ ] **1.1** Currency table (ISO 4217 exponents), `assertMinor`, `parseAmount` (`1,20,000.50`), `formatMoney` (`en-IN`, string input, lakh grouping).
  - Accept: tests for INR, JPY and KWD; `₹1,20,000.50` round-trips; unsafe integers throw.
- [ ] **1.2** `evalKeypad`: `450+120`, `1200/3`, `×`, `÷`, `−`, precedence, half-up rounding to the minor unit, typed errors.
  - Accept: table tests pass; property: `eval("a+b") = a + b` for random minor amounts.
- [ ] **1.3** `allocate(total, weights, seed)`: largest remainder, BigInt internally, tie-break by `fmix32(fnv1a(seed:memberId))` (plain FNV-1a is biased; see ARCHITECTURE §6.2).
  - Accept: properties hold (Σ exact, ≥ 0, deterministic); over a fixed set of 3,000 ids each member gets the extra unit within ±3 points of 1/n, including member ids that share a prefix.
- [ ] **1.4** Splits: `equal`, `exact`, `percentage` (bps), `shares` (×100); payer validation (single or multiple).
  - Accept: property Σshares = amount for each type; typed validation errors.
- [ ] **1.5** Splits: `adjustment`, `itemized` (items + tax/service/tip/discount), `imported_net`; a single `computeShares()` dispatcher.
  - Accept: a GST + service-charge restaurant bill matches a hand-computed result; `lib/money` branch coverage is 100%.
- [ ] **1.6** Ledger: `nets`, `pairwise`, `simplify`, `suggestions`, `explainPair`, `explainNet`.
  - Accept: fast-check random ledgers give Σnets = 0; applying the plan zeroes everyone; transfers ≤ n−1; Σ explainPair = the pair balance.

### Schema and API

- [ ] **1.7** Move the Phase 1 tables from `docs/schema.draft.ts` into `src/server/db/schema/*` and generate the migration. Test fixtures: `makeUser`, `makeGroup`, `makeMember`.
  - Accept: the migration applies to PGlite and Neon dev; constraint tests reject a negative amount, a bad currency, and a duplicate active member.
- [ ] **1.8** Authz foundation: `requireMember`, the `route({ auth: 'member' })` path, the **authz sweep test** (globs group routes; an uncovered route fails).
  - Accept: the sweep test runs; a dummy group route without membership returns 404.
- [ ] **1.9** Groups API: `PUT /groups/:gid` (create with client id → owner member + invite code; update settings), `GET /groups` (my net per currency, sorted by activity), `GET /groups/:gid`.
  - Accept: integration tests pass; replaying a create returns the same group; a non-member gets 404.
- [ ] **1.10** Invites: `GET /invites/:code` (public preview), `POST /invites/:code/join` (new member or pick a placeholder), `POST /groups/:gid/invite/rotate`, Postgres rate limits. `onLinkAccount` now moves memberships, including the collision rule.
  - Accept: tests: a rotated code is dead; the rate limit trips; joining twice is idempotent; linking an account moves memberships.
- [ ] **1.11** Members: add a placeholder, mint a claim link (hashed, single-use, replaces the previous one), `POST /claims/:token`, guest re-claim rule (D3) + activity rows, remove member (owner, zero balance only) / leave.
  - Accept: tests: a claim token works once; a spot bound to a real account can't be re-claimed; removing a member with a balance → 409 with the amount.
- [ ] **1.12** Entry write: `PUT /entries/:eid` for expenses and settlements. Server recomputes the split, re-checks invariants inside the transaction, versions and `baseVersion` last-write-wins, writes revisions, activity, `last_activity_at`, `Idempotency-Key`.
  - Accept: tests: a broken invariant rolls back; a replay returns an identical response; a stale `baseVersion` is applied and writes a `conflict` revision.
- [ ] **1.13** Entry reads and lifecycle: `GET` list (paged by date, id), `GET` one, `DELETE` (soft), `POST restore` (undelete or `?version=`), `GET revisions`, `GET activity`.
  - Accept: tests: a delete drops out of balances; restoring version 1 brings back the old amounts as a new version.
- [ ] **1.14** Balances: `GET /balances` (nets per currency + active-view suggestions), `GET /explain` (pair or member net). Derived "last payer/split/group".
  - Accept: the 3-person fixture matches hand-computed numbers in both views; the explain sums equal the balance.

### UI

- [ ] **1.15** Home v1: my groups (net per currency, sorted by activity), overall owe/owed per currency, empty state, "New group" sheet (name, type, currency). Guests can create (D2).
  - Accept: e2e: a new guest creates "Goa trip" and lands in it.
- [ ] **1.16** Group screen v1: balance rows, suggestion strip, expenses grouped by date, floating "+" button, skeleton loading.
  - Accept: a component test renders a fixture group; axe passes; tap targets ≥ 44 px.
- [ ] **1.17** Invite and join UI: share sheet (copy + WhatsApp `wa.me/?text=`), `/j/[code]` join page (group name + members; guest name form; sign in; "I'm <placeholder>").
  - Accept: e2e: a second browser context joins as a guest and appears in the member list.
- [ ] **1.18** Add expense v1: amount-first keypad with inline math, description, defaults (last payer/split, today), Save. The common case is ≤ 3 taps from app open.
  - Accept: e2e: Home → "+" → `450+120` → "Dinner" → Save shows ₹570 split 3 ways, in 3 taps.
- [ ] **1.19** Split editor: participant toggles (equal), exact / percentage / shares with a live remainder; multi-payer with a remainder; date; manual category.
  - Accept: component tests for the remainder states; e2e: an exact split saves the right shares.
- [ ] **1.20** Currency per expense (defaults to the group currency); per-currency balance rows everywhere.
  - Accept: e2e: a USD expense in an INR group shows two balance lines and never merges them.
- [ ] **1.21** Entry detail: view, edit (same form), delete with an undo toast, restore, history with before/after, restore a version.
  - Accept: e2e: edit → history shows v1 → restore v1 works.
- [ ] **1.22** Settle up: suggestions from the active view → record a settlement (amount, method cash/UPI/bank/other, date); custom settlement; simplify toggle in settings.
  - Accept: e2e: recording every suggestion makes everyone "Settled up".
- [ ] **1.23** Explain sheet on every balance: raw view (pairwise entries) or simplified view (my net + routing line, D4).
  - Accept: a component test shows the rows sum to the balance; the routing line appears only in simplified view.
- [ ] **1.24** Placeholders and claiming: "Ravi — not joined yet · Send claim link" (WhatsApp/copy), `/c/[token]` claim page, "Save your account" card after the first expense (D2).
  - Accept: e2e: a claim link binds a fresh guest to the spot; the card can be dismissed and never blocks.
- [ ] **1.25** Group settings: rename, type, default currency, rotate invite (owner), remove member (blocked with its balance), leave group.
  - Accept: e2e: removing a member with a balance is blocked and shows how much they owe or are owed.
- [ ] **1.26** Global "+" remembers the last group; Home totals update after writes; optimistic updates everywhere through `sendMutation()`.
  - Accept: e2e: from Home, "+" opens the last group's add form; a new expense shows at once, before the server responds.
- [ ] **1.27** Phase 1a exit: an e2e with 3 users (1 guest), 20 expenses mixing split types, payers and a second currency, balances checked against `lib/money` as the oracle, then settle all. Deploy to production.
  - Accept: CI is green; you use it on a real outing and note the rough edges in this file.

---

## Phase 1b — Friends, comments, polish

**Exit e2e:** add a friend, record a 1:1 expense, and see the friend balance summed across a shared group and the direct group.

- [ ] **1.28** Category auto-suggest from keywords (swiggy/zomato → Food, uber/ola/rapido → Transport, blinkit/zepto/bigbasket → Groceries, …); editable, suggestion only.
  - Accept: unit tests for the keyword table; e2e: typing "Uber to airport" pre-selects Transport.
- [ ] **1.29** Adjustment split in the split editor (± per person, then equal).
  - Accept: component test: the remainder and a negative-share error show correctly.
- [ ] **1.30** Comments: API (member-only, length limits, soft delete) + UI on the entry detail page; an activity row.
  - Accept: the authz sweep covers comments; e2e: post and see a comment.
- [ ] **1.31** Activity feed screen in the group (paged, human sentences, links to entries).
  - Accept: e2e: an edit shows "Asha changed Dinner: ₹1,200 → ₹1,500".
- [ ] **1.32** Friends 1: hidden `direct` groups, "Add friend" (pick a co-member or add by name → placeholder + claim link), 1:1 add-expense reusing the same form.
  - Accept: e2e: add a friend by name, record ₹300, send a claim link.
- [ ] **1.33** Friends 2: friends list with cross-group balances per currency (Σ of active views, D4) and friend detail (per-group breakdown + explain).
  - Accept: property test: friend balance = Σ per-group active-view pairs.
- [ ] **1.34** Phase 1 exit e2e (friends flow) + docs pass (`CLAUDE.md` gotchas, `ARCHITECTURE.md` updates).
  - Accept: CI is green; deployed.
