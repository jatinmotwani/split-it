# ARCHITECTURE.md

How `APP_NAME` (working name **Split It**) is put together. `SPEC.md` says *what* to build; this file says *how*. The schema draft lives in [`docs/schema.draft.ts`](docs/schema.draft.ts); the task plan lives in [`PROGRESS.md`](PROGRESS.md).

Status: draft for review (kickoff, 2026-09-28). Nothing here is implemented yet.

---

## 1. Decisions from kickoff

All eight kickoff questions were answered "use your defaults". These are binding unless changed here.

| # | Decision |
|---|---|
| D1 | Working name "Split It" in `src/config/app.ts` (`APP_NAME`). No domain yet: run on `*.vercel.app`; everything configured via env. Preview deploys sign in with Google through Better Auth's `oAuthProxy` plugin. Email OTP only reaches the Resend account owner until a domain is verified; in dev the code is printed to the console. |
| D2 | Guests can **create** groups, not only join. A guest session starts on the first write. After the first expense, a dismissible "Save your account" card offers Google/email and states that a lone guest who clears their browser can't be recovered. It never blocks. |
| D3 | Guest recovery: any member can send a fresh claim link for a spot that is a placeholder **or** bound to a never-linked guest. A spot bound to a real account can't be re-claimed. Every re-claim writes an activity row ("Ravi's spot was claimed on a new device"). Recovery is per group. |
| D4 | Simplify debts vs Explain: on a simplified transfer, Explain shows *my net in this group* with the entries behind it, plus "Simplify debts routes this to Neel so the group needs fewer payments." The raw view shows the pairwise entry list. Friend balance = Σ over shared groups of each group's **active** view, per currency. Home owe/owed = Σ my nets (unaffected by simplification). |
| D5 | Phase 1 is split into **1a (trip-ready)** and **1b**. See `PROGRESS.md`. |
| D6 | No Splitwise sample yet. Phases 0–1 use the §8 format; the importer (Phase 2) waits for real anonymised exports in `fixtures/splitwise/`. |
| D7 | Analytics are server-side (`posthog-node`, flushed with Next's `after()`); browser-only events go through `sendBeacon` to our own `/api/events`. No autocapture, no session replay. Sentry on the server plus a minimal browser init (no replay, no browser tracing). |
| D8 | FX (Phase 3): ECB via Frankfurter as primary; a second free daily source for currencies ECB doesn't publish (AED, VND, LKR, NPR, MVR, SAR, KWD…), candidate `open.er-api.com`; `source` stored per rate; manual rate entry always allowed. |

Assumptions confirmed at the same time:

| # | Assumption |
|---|---|
| A1 | Next.js 16.3 (Turbopack by default) → PWA via **`@serwist/turbopack`** (`withSerwist` + `createSerwistRoute`, worker bundled by esbuild), not the webpack plugin. |
| A2 | Better Auth 1.7 with `anonymous`, `emailOTP`, `oAuthProxy` plugins + Google. Drizzle **0.45** stable (1.0 is still RC; upgrade once GA). |
| A3 | Neon has no Mumbai region → DB in **Singapore** (`aws-ap-southeast-1`), Vercel functions pinned to **`sin1`**. |
| A4 | pnpm, Node 24 LTS, ESLint (flat config) + Prettier, Vitest + fast-check, Playwright + axe. |
| A5 | No Docker: dev on a Neon `dev` branch; tests on **PGlite** (in-process Postgres); CI e2e on a Postgres service container; a Neon branch per Vercel preview. |
| A6 | Offline-ready API from day one: client-generated UUIDv7 ids, PUT upserts, `Idempotency-Key`, `baseVersion`. The Dexie outbox itself ships in Phase 3. |
| A7 | Currency picker per expense in Phase 1 (balances are already per currency). Conversion and "show in group currency" wait for Phase 3. |
| A8 | Better Auth owns `user`, `session`, `account`, `verification`; the spec's `users` table **is** Better Auth's `user`. |
| A9 | (Build) Group creation is `POST /groups` rather than `PUT /groups/:gid`, so every route under `:gid` stays members-only and the authorization sweep enforces it without exceptions. |

---

## 2. System overview

```
 Browser (PWA)                                   Vercel (sin1)                         Neon (Singapore)
┌──────────────────────────────┐   JSON/HTTPS   ┌───────────────────────────────┐   TCP  ┌───────────────┐
│ React Server Components      │ ─────────────▶ │ Route Handlers  /api/v1/*     │ ─────▶ │ Postgres      │
│ + client islands (features/) │                │   route() wrapper: session,   │  pool  │  (Drizzle)    │
│ TanStack Query cache         │ ◀───────────── │   Zod, authz, idempotency     │        └───────────────┘
│ lib/money (same code as srv) │                │ Services (core/, plus/)       │
│ Serwist SW: shell + offline  │                │ lib/money (pure)              │ ─▶ Resend, R2, Anthropic,
│ Dexie outbox (Phase 3)       │                │ Better Auth /api/auth/*       │    Razorpay, PostHog, Sentry
└──────────────────────────────┘                │ Cron /api/cron/* (daily)      │
                                                └───────────────────────────────┘
```

One deployable Next.js app. The server is the source of truth: the client computes splits for **preview only**. The server recomputes every split from `split_input` using the same pure `lib/money` code and rejects anything that breaks an invariant.

---

## 3. Modules and layering rules

| Module | Runs on | May import | Purpose |
|---|---|---|---|
| `src/lib/money` | both | nothing outside itself | Currency table, parse/format, keypad math, allocation, splits, nets, pairwise, simplify, explain. Pure and deterministic. 100% branch coverage. |
| `src/lib/contracts` | both | `zod`, `lib/money` types | Zod request/response schemas for every route. The typed API client and route handlers both use them. |
| `src/lib/*` (other) | both | `lib/money`, `lib/contracts` | `ids` (UUIDv7), `categories`, `tokens` (formatting), small pure helpers. |
| `src/server/db` | server | `drizzle-orm`, schema | Pool, Drizzle instance, schema, test DB factory. |
| `src/server/auth` | server | `better-auth`, db | Better Auth config, `getSession()`, `onLinkAccount` membership migration. |
| `src/server/http` | server | auth, contracts | `route()` wrapper, `AppError` → problem JSON, Origin check, idempotency, rate limit. |
| `src/server/services/core` | server | db, lib/* | Free-forever flows (groups, members, entries, balances, activity, invites, export). **Must not import `server/entitlements`** (ESLint rule + the §9.1 pledge test). |
| `src/server/services/plus` | server | core, entitlements | Phase 4: AI scan, insights, reports, cosmetics. |
| `src/server/entitlements` | server | db | Phase 4: `can()`, quotas, feature config. |
| `src/server/analytics`, `observability` | server | — | `track()` with an event allowlist; Sentry helpers; PII-scrubbing logger. |
| `src/features/*` | client | `lib/*`, `client/*`, `components/*` | Feature UI (home, group, add-expense, settle, join, explain…). Never imports `server/*`. |
| `src/client` | client | `lib/contracts` | Typed `api` client, TanStack Query keys/hooks, `sendMutation()` (the seam the Phase 3 outbox plugs into). |
| `src/components/ui` | client | — | shadcn/ui primitives. |
| `src/app` | both | everything above | Routes only: thin pages and handlers that call features/services. |

Enforced with ESLint `no-restricted-imports` zones plus `import 'server-only'` in every `server/*` entry point.

---

## 4. Folder structure

```
.
├── SPEC.md  ARCHITECTURE.md  PROGRESS.md  CLAUDE.md  README.md  .env.example
├── docs/schema.draft.ts                 # this review's schema draft; becomes src/server/db/schema/*
├── drizzle/                             # generated SQL migrations (drizzle-kit)
├── fixtures/splitwise/                  # real anonymised CSV exports (Phase 2)
├── e2e/                                 # Playwright specs (mobile viewport) + helpers
├── public/                              # icons, manifest assets
└── src/
    ├── config/app.ts                    # APP_NAME, support email, feature defaults
    ├── app/
    │   ├── layout.tsx  manifest.ts  offline/page.tsx
    │   ├── (app)/page.tsx               # Home
    │   ├── (app)/g/[groupId]/page.tsx   # Group
    │   ├── (app)/g/[groupId]/add/page.tsx
    │   ├── (app)/g/[groupId]/e/[entryId]/page.tsx   # detail, history, comments
    │   ├── (app)/g/[groupId]/settings/page.tsx
    │   ├── (app)/friends/…              # Phase 1b
    │   ├── j/[inviteCode]/page.tsx      # public join page
    │   ├── c/[claimToken]/page.tsx      # claim a spot
    │   ├── sign-in/page.tsx
    │   ├── serwist/[path]/route.ts      # service worker served by createSerwistRoute
    │   └── api/
    │       ├── auth/[...all]/route.ts   # Better Auth
    │       ├── v1/…                     # JSON API (see §7)
    │       ├── events/route.ts          # browser analytics beacon
    │       └── cron/…/route.ts          # daily jobs (Phase 3+)
    ├── sw.ts                            # service worker source
    ├── lib/{money,contracts,ids.ts,categories.ts}
    ├── server/{db,auth,http,services/{core,plus},entitlements,analytics,observability}
    ├── client/{api.ts,query-keys.ts,mutations.ts,outbox/}
    ├── features/{home,group,add-expense,entry,settle,explain,join,members,friends}/
    └── components/ui/
```

---

## 5. Data model

Full draft: [`docs/schema.draft.ts`](docs/schema.draft.ts). Tables are grouped by the phase that first needs them; each phase's migration adds only its own tables.

**Phase 0–1 tables:** Better Auth (`user`, `session`, `account`, `verification`) · `groups` · `group_members` · `entries` · `entry_payers` · `entry_shares` · `entry_revisions` · `comments` · `activity` · `idempotency_keys` · `rate_limit_buckets`.
**Later:** `imports` (P2) · `entry_items`, `entry_item_assignees`, `recurring_rules`, `receipts`, `fx_rates`, `push_subscriptions` (P3) · `entitlements`, `subscriptions`, `payments`, `usage_counters`, `upsell_impressions`, `feature_config` (P4).

Key choices:

- **Money columns** are `bigint` with Drizzle `mode: 'number'`, and `CHECK (amount >= 0)` on legs. `currency` is `char(3)` with `CHECK (currency ~ '^[A-Z]{3}$')`.
- **`split_input` jsonb is the canonical, versioned input** for every split type, typed by the Zod contract. `entry_payers` / `entry_shares` are the computed legs the balance queries read. Phase 3's `entry_items` tables are a normalised projection of `split_input` for search and insights, written in the same transaction.
- **Settlement method** (`cash|upi|bank|other`) is a column on `entries`, used only when `kind = 'settlement'`.
- **Conversions** (Phase 3): `amount`/`currency` always hold the ledger value; `original_amount`/`original_currency` are set only when a user explicitly converts an expense. `fx_rate`/`fx_date`/`fx_source` are captured at entry time.
- **Members are never hard-deleted.** Removal sets `removed_at` (only allowed at zero balance), so ledger references stay valid. Account deletion (Phase 5) nulls `user_id` and renames the member "Deleted user".
- **One active membership per user per group:** partial unique index on `(group_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL`.
- **Claim tokens are stored hashed** (`sha256`) and are single-use. "Send claim link" mints a new one each time and invalidates the previous. Invite codes are stored raw because members must be able to re-share them; owners can rotate them.
- **Direct (1:1) groups:** `groups.type = 'direct'` with `direct_key` = the sorted pair of user ids once both are real users (unique when not null). Duplicates can exist before a claim; friend balances sum across all shared groups, so a duplicate never makes a number wrong.
- **"Remember last payer/split/group" is derived, not stored:** it comes from my most recent entry (`created_by_member_id = me`), indexed on `(group_id, created_by_member_id, created_at)`. It works across devices, needs no extra columns, and is always consistent.
- `groups.last_activity_at` is bumped in every write transaction, for Home sorting.

---

## 6. Money engine (`src/lib/money`)

### 6.1 Types and boundaries

```ts
type Minor = number;             // integer minor units; assertMinor() at every boundary
type MemberId = string;          // uuid
type Leg = { memberId: MemberId; amount: Minor };
type SplitInput =
  | { type: 'equal';      participants: MemberId[] }
  | { type: 'exact';      amounts: Record<MemberId, Minor> }
  | { type: 'percentage'; bps: Record<MemberId, number> }          // Σ = 10000
  | { type: 'shares';     weights: Record<MemberId, number> }      // integers, ×100
  | { type: 'adjustment'; participants: MemberId[]; adjustments: Record<MemberId, Minor> } // ± per person
  | { type: 'itemized';   items: Item[]; extras: Extra[] }         // tax/service/tip/discount
  | { type: 'imported_net'; shares: Record<MemberId, Minor>; import: { originalCost: Minor } };
```

- `assertMinor(n)` = `Number.isSafeInteger(n) && n >= 0`. It runs in contract parsing, before DB writes, and after DB reads.
- **Products use BigInt internally.** `amount × weight` can exceed 2⁵³ (for example ₹10¹³ × 10000 bps), so `allocate()` computes in `bigint` and converts back with a safe-integer assertion.

### 6.2 Allocation and rounding

`allocate(total, weights, seed)` uses the largest-remainder method:

1. Each member gets `floor(total × wᵢ / Σw)`.
2. The leftover units go to the members with the largest remainders.
3. **Ties** (for example every remainder is equal in an equal split) are ordered by `fmix32(fnv1a(seed + ':' + memberId))`: FNV-1a followed by MurmurHash3's 32-bit finalizer. The seed is the entry id, so the extra paisa moves between people across expenses, and the same input always gives the same output. It's fast, synchronous and identical in the browser and Node, and it isn't used for security.
   - **Why the finalizer:** at kickoff, plain FNV-1a measured as unfair over 30,000 random entry ids. With member ids that differ only in the last character, the first member got the extra unit 50% of the time instead of 33%; with UUID member ids it was still 31.4 / 33.8 / 34.9%. With `fmix32` added, every case came out at 33.3 ± 0.2%.

Split functions are built on `allocate()`:

- **equal**: equal weights over the participants.
- **exact**: validates Σ = amount; the UI shows the remainder.
- **percentage**: weights are basis points; Σ must be 10000.
- **shares**: weights are integers ×100.
- **adjustment**: the rest (amount − Σadjustments) is split equally, then each adjustment is added. Any negative share is rejected.
- **itemized**: each item is allocated to its assignees by weight to give per-member subtotals. Then extras (tax + service + tip − discount) are allocated in proportion to those subtotals. Amount must equal Σitems + Σextras.
- **imported_net**: explicit legs, used by the importer and opening balances.

**Payers:** one payer (the default, who paid the full amount) or several with exact amounts that sum to the total. This works with every split type.

### 6.3 Ledger math

| Function | Definition |
|---|---|
| `nets(entries)` | per currency, per member: Σpaid − Σowed over non-deleted entries. Invariant Σ = 0. |
| `pairwise(entries)` | raw view: each member's share of an entry is attributed to that entry's payers in proportion to what they paid (`allocate`, seeded by entry id). Then each pair is netted. |
| `simplify(nets)` | per currency: repeatedly match the largest debtor with the largest creditor; ties broken by member id; ≤ n−1 transfers. |
| `suggestions(group)` | `simplify(nets)` if `simplify_debts`, else the non-zero `pairwise` edges. Applying all of them zeroes every net. |
| `explainPair(entries, a, b)` | raw view: the entries contributing to a↔b, with signed amounts that sum to the pairwise balance. |
| `explainNet(entries, m)` | simplified view (D4): the entries contributing to m's net, which sum to the net, plus the routing sentence. |
| `evalKeypad(expr, currency)` | `450+120`, `1200/3`, `×`, `−`, with normal precedence and no parentheses. Evaluated in scaled BigInt and rounded half-up to the minor unit. Invalid input returns a typed error, never `NaN`. |
| `parseAmount` / `formatMoney` | Tolerate thousands separators (`1,20,000.50`). Formatting uses `Intl.NumberFormat('en-IN', {style:'currency'})`, given a decimal *string* so no float is ever involved. |

Currency exponents come from our own ISO 4217 table (INR 2, USD 2, JPY 0, KWD 3, …), never from `Intl`, whose data varies by engine.

### 6.4 Property tests (fast-check)

- Any split input gives Σshares = amount, all shares ≥ 0, and the same result when repeated.
- Fairness: over a fixed set of 3,000 entry ids, each of n members gets the extra unit within ±3 percentage points of 1/n of the time. This covers both member ids that share a prefix and UUID member ids. The ids are fixed so the test is deterministic.
- Random ledgers give Σnets = 0 per currency; applying `simplify` zeroes all nets; transfers ≤ n−1; Σ`explainPair` equals the pairwise balance.
- Friend balance (1b) equals the Σ of the per-group active views.

---

## 7. API and the write path

### 7.1 Conventions

- Routes live under `/api/v1`. JSON only. Every handler is `route({ auth, params, body, query, handler })`, which does the following:
  1. Loads the Better Auth session. Guests count as authenticated.
  2. Parses params, query and body with Zod contracts.
  3. For `auth: 'member'`, runs `requireMember(userId, groupId)`, which returns the caller's `group_members` row or **404**. Non-members get 404 so they can't tell whether a group exists.
  4. On mutations, checks the `Origin` header and applies the `Idempotency-Key`.
  5. Maps `AppError` to `{ error: { code, message, details } }` with the right status.
  6. Adds a request id.
- **Authz sweep test:** it globs every `src/app/api/v1/groups/[groupId]/**/route.ts`, calls each exported method as a signed-in non-member, and asserts 404. A new route that isn't covered fails CI.
- Text limits: description ≤ 120, notes ≤ 1000, comment ≤ 1000, display name ≤ 40, group name ≤ 60. React escapes output; `react/no-danger` is an ESLint error.

### 7.2 Routes (Phase 1)

```
GET    /api/v1/me
GET    /api/v1/groups                              my groups + my net per currency
POST   /api/v1/groups                              create (idempotent on the client id)
GET    /api/v1/groups/:gid                         group + members
PATCH  /api/v1/groups/:gid                         settings (name, type, currency, simplify)
GET    /api/v1/groups/:gid/balances                nets, suggestions (active view)
GET    /api/v1/groups/:gid/explain?a=&b= | ?member= explain pair / explain net
GET    /api/v1/groups/:gid/entries?before=&limit=  paged by (date, id)
GET    /api/v1/groups/:gid/entries/:eid            entry + legs
PUT    /api/v1/groups/:gid/entries/:eid            create/update expense | settlement
DELETE /api/v1/groups/:gid/entries/:eid            soft delete
POST   /api/v1/groups/:gid/entries/:eid/restore    undelete, or restore ?version=
GET    /api/v1/groups/:gid/entries/:eid/revisions
GET    /api/v1/groups/:gid/activity?before=
POST   /api/v1/groups/:gid/members                 add placeholder by name
POST   /api/v1/groups/:gid/members/:mid/claim-link mint single-use claim link
DELETE /api/v1/groups/:gid/members/:mid            remove (owner; zero balance only) / leave
POST   /api/v1/groups/:gid/invite/rotate           owner
GET    /api/v1/invites/:code                       public preview (rate-limited)
POST   /api/v1/invites/:code/join                  { displayName } | { claimMemberId }
POST   /api/v1/claims/:token                       bind current user to the spot
…/comments (1b), /friends (1b)
```

### 7.3 Saving an entry (PUT `/entries/:eid`)

```
client                                     server (one transaction)
──────                                     ───────────────────────
id = uuidv7() (new) or existing id
preview = computeShares(...)  ──PUT──▶     route(): session → Zod → requireMember → Idempotency-Key lookup
{ baseVersion, kind, amount,                legs = computeShares(amount, split_input, seed = id)   // server recompute
  currency, payers, split_input, … }        assert Σpayers = Σshares = amount, all ≥ 0
                                            SELECT … FROM entries WHERE id = $1 FOR UPDATE
                                            ├─ none      → INSERT entry v1
                                            └─ exists    → INSERT entry_revisions(snapshot of current,
                                                             reason = baseVersion < version ? 'conflict' : 'edit')
                                                           UPDATE entry, version + 1; replace legs
                                            re-check sums from the DB rows (spec §5.1); mismatch → rollback
                                            INSERT activity; UPDATE groups.last_activity_at
                                            INSERT idempotency_keys(response)
                           ◀── 200 ──       { entry, version }
optimistic cache update → invalidate balances/activity
```

- **Conflicts are last-write-wins per entry**, in the order the server receives them. The overwritten state is always kept in `entry_revisions`. When the client's `baseVersion` is older than the server's version, the revision is marked `conflict` and the activity row says so ("Your edit replaced Ravi's; theirs is in history").
- An edit to a deleted entry is applied, but the entry stays deleted; the UI offers "Restore".
- **Idempotency:** a replay with the same `Idempotency-Key` returns the stored response. A replay while the first request is still running hits the unique key and gets 409 "retry". Keys expire after 7 days (daily cleanup).
- **Settlements** use the same PUT with `kind: 'settlement'`, one payer (the sender), one share (the receiver) and a method label.

### 7.4 Read path

- **Balances** are computed on read. Nets come from one SQL aggregate over `entry_payers ∪ entry_shares` joined to non-deleted `entries`, grouped by member and currency. Pairwise and explain load the group's legs and run `lib/money`. Groups are small (typically under 5k entries), so this is fast. If it ever isn't, add a `member_balances` table maintained in the write transaction.
- **Home:** my memberships, then per-group nets for me, then totals per currency, sorted by `last_activity_at`.
- TanStack Query keys: `['groups']`, `['group', gid]`, `['balances', gid]`, `['entries', gid]`, `['entry', gid, eid]`, `['activity', gid]`. A write invalidates its group's balances, entries and activity, plus `['groups']`.

---

## 8. Identity: users, guests, placeholders

```
            invite link /j/:code                            claim link /c/:token
visitor ────────────────────────▶ join page ──▶ "Join as <name>" ──▶ anonymous session + new member row
                                   │                                      │
                                   └─▶ "I'm Ravi" (unclaimed placeholder) ─┘   member.user_id = me
guest ──(Google / email OTP)──▶ onLinkAccount({anonymousUser, newUser}): move memberships, then the anon user is deleted
```

- **Three kinds of member row:**
  - A **placeholder** has `user_id = null` ("Ravi — not joined yet · Send claim link").
  - A **guest** has `user_id` pointing to an anonymous Better Auth user (`isAnonymous = true`).
  - A **real account** has `user_id` pointing to a linked user.
- **Guest creation (D2):** "Start a group" with no session calls `signIn.anonymous()` first. The display name is asked once.
- **Link account:** `onLinkAccount` repoints every `group_members.user_id` from the anonymous user to the new user in one transaction.
  - Collision (the real user is already an active member of the same group): the guest row becomes a placeholder named "<name> (guest)" and the user sees a notice. A "merge members" tool can come later if people need it.
- **Guest recovery (D3):** a member can mint a claim link when `user_id` is null **or** points to an anonymous user. Claiming rebinds `user_id` and writes a `member_reclaimed` activity row. The claimer can't already be an active member of that group.
- **Sessions:** 180-day rolling expiry (`expiresIn` 180d, `updateAge` 1d). A guest who stays away longer recovers through a claim link.
- **Placeholder claim through the invite link:** anyone holding the invite link can pick an unclaimed placeholder. Owners can unlink a wrong claim, which turns it back into a placeholder.
- Rate limits (Postgres fixed-window buckets, set only against abuse): invite preview 60/min/IP, join 10/min/IP and 30/hour/code, claim 10/min/IP.

---

## 9. Offline and sync

**Phase 1 (preparation):**
- Every write goes through `client/mutations.ts → sendMutation({ id, kind, groupId, entityId, payload, baseVersion })`, which sets `Idempotency-Key = id`.
- All created entities (groups, entries) get client-generated UUIDv7 ids.
- The Serwist service worker precaches the app shell and serves `/offline` when a navigation fails.

**Phase 3 (the outbox):**

```
UI action ─▶ sendMutation() ─▶ Dexie `outbox` (FIFO per group) ─▶ optimistic update of the Query cache
                                   │
     flush triggers: enqueue, `online`, app focus, Background Sync (Chrome Android)
                                   ▼
                     PUT/POST with Idempotency-Key ──▶ 2xx: drop the row, reconcile the cache with the server response
                                                   ├─ 409 in-flight / 5xx / network: exponential backoff
                                                   └─ 4xx validation: mark failed → "Couldn't save: …" [Edit] [Discard]
```

- The Query cache is persisted to IndexedDB (`persistQueryClient`), so the last-seen groups, balances and entries render offline.
- The service worker does **not** cache API responses: the persisted Query cache is the only data cache, which avoids two caches drifting apart.
- Balances shown offline = the last server balances plus pending outbox entries applied locally with `lib/money`, marked "pending sync".
- Conflicts follow §7.3: the server resolves them with LWW and the revision trail. Offline joining and claiming aren't supported; they need the server.

---

## 10. Entitlement resolution (Phase 4 design)

```
can(ctx, feature, groupId?)
  1. feature ∈ FREE_FOREVER               → true, no DB access (the §9.1 pledge test asserts this path)
  2. load active rows once per request (memoised):
       entitlements WHERE revoked_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
         AND ((subject_type='user'  AND subject_id = ctx.userId)
           OR (subject_type='group' AND subject_id = groupId AND ctx is an active member))
  3. any user row (subscription | lifetime | promo)            → Plus everywhere
     any group row (trip_pass | trial) for this group          → Plus inside this group
  4. otherwise quota features (AI scans: 3/user/month, from feature_config)
       → usage_counters(user_id, feature, period) < quota
```

- **Sources:**
  - `subscription` rows mirror Razorpay (`ends_at` = current period end + 3 days grace).
  - `lifetime` has `ends_at = null`.
  - `trip_pass` = purchase + 30 days, group subject.
  - `trial` = 14 days on the user's first created group, group subject, no payment details.
- **Webhooks:** verify the signature, then upsert `payments` (raw jsonb, unique on the provider event id), then `subscriptions`, then `entitlements`, all in one transaction. The whole thing is idempotent. A daily reconciliation job re-pulls Razorpay state.
- **Pledge enforcement:**
  1. An ESLint zone stops `server/services/core/**` from importing `server/entitlements`.
  2. A Vitest test walks the import graph of every core route and fails if it reaches `server/entitlements`.
  3. A unit test checks that `can()` answers FREE_FOREVER features with a DB that throws on any query.
- **Upsell:** at most one impression per user per day, enforced by a `upsell_impressions(user_id, day)` primary key. It's only shown when a user taps a Plus feature.

---

## 11. Jobs

- Vercel Cron calls `GET /api/cron/<job>`; the handler checks `Authorization: Bearer $CRON_SECRET`. The Hobby plan allows daily schedules, which is all we need.
- Every job is idempotent and safe to re-run.

| Job | Phase | Idempotency |
|---|---|---|
| `cleanup` | 1 | Deletes idempotency keys older than 7 days and stale rate-limit buckets. |
| `fx` | 3 | Upsert on `(date, base, quote, source)`. |
| `recurring` | 3 | `unique(recurring_rule_id, recurring_period)` on entries. |
| `reconcile-payments` | 4 | Upserts keyed by the provider id. |
| `renewal-reminders` | 4 | Keyed by (subscription, period). |

---

## 12. Observability and analytics (D7)

- **Sentry:** `@sentry/nextjs` on the server with a `beforeSend` that strips request bodies, cookies and emails. The browser init is minimal: errors only, no replay, no browser tracing. With no DSN it does nothing.
- **PostHog:** `track(event, props, { distinctId: userId })` from services. It uses `posthog-node` and is flushed in `after()`, so it never delays a response.
  - Props are validated against a per-event Zod allowlist: ids, counts and enums only, never free text.
  - Events: §12 and §9.6 of the spec.
  - Browser-only events (`wrapped_viewed`, `wrapped_shared`, install prompt) are sent with `navigator.sendBeacon('/api/events')`. That endpoint accepts only allowlisted names and uses a random anonymous id from `localStorage`.
- **Logs:** a structured `log.info/warn/error` with a request id and a redaction list (email, name, description, notes, tokens).

---

## 13. Environments, deploy, migrations

| Env | App | Database | Auth |
|---|---|---|---|
| local | `pnpm dev` | Neon `dev` branch (`DATABASE_URL`) | Google (localhost redirect); email OTP printed to the console if `RESEND_API_KEY` is empty |
| test (unit/integration) | Vitest | PGlite, fresh per test file, migrations applied | fake sessions |
| CI e2e | `next build && next start` | Postgres 17 service container | guest + email OTP via a test inbox stub |
| preview | Vercel preview | Neon branch per preview (Neon–Vercel integration) | Google via `oAuthProxy` → production callback |
| production | Vercel, `sin1` | Neon `main`, Singapore | Google + Resend |

- **DB driver:** `pg` (node-postgres) `Pool` on Neon's pooled URL, registered with `attachDatabasePool()` from `@vercel/functions` for Fluid compute. Interactive transactions and `FOR UPDATE` work normally. Tests use `drizzle-orm/pglite`. Services receive a `Db` typed as the shared `PgDatabase` base, so either works.
- **Migrations:** `drizzle-kit generate` locally and commit the SQL. The Vercel build command is `pnpm db:migrate && next build` (unpooled URL), so every preview branch and production is migrated by its own deploy.
  - Rule: **migrations must be backward-compatible** with the code already deployed. Add first, backfill, remove in a later deploy.
- **Required env** (full list in `.env.example`): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST`, `CRON_SECRET`, `APP_URL`.

---

## 14. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `lib/money` | Vitest + fast-check | Unit and property tests; **100% branch coverage** gate on this folder. Written test-first. |
| contracts | Vitest | Zod round-trips; rejects oversize text and unsafe integers. |
| services + routes | Vitest + PGlite | Integration per route: happy path, validation, invariants, idempotent replay, conflict revision, **authz sweep**. |
| UI components | Vitest + Testing Library | Keypad, split editor remainder, explain sheet sums. |
| e2e | Playwright (Pixel 7 viewport, Chromium) + `@axe-core/playwright` | The main flow of each phase, plus an axe check on every screen visited. |

CI (GitHub Actions) runs typecheck → lint → unit/integration (with coverage) → build → e2e on every PR. Nothing merges red.

---

## 15. Performance budget

- Core routes (`/`, `/g/[id]`, `/g/[id]/add`) are Server Components first. Client islands are limited to the keypad, split editor and sheets.
- No chart, date or UI-kit libraries on core routes; charts and reports are lazy-loaded (Phase 4).
- Dependency rule: every new client dependency gets a line in the PR description saying what it costs and why it's needed.
- Phase 5 adds a Lighthouse CI check on a throttled low-end Android profile to preview deploys.

---

## 16. Risks and open items

| Item | Impact | Plan |
|---|---|---|
| No real Splitwise export yet (D6) | Importer details (multi-currency totals, Payment rows) are unverified | Blocks Phase 2 only. Drop anonymised exports in `fixtures/splitwise/`. |
| Resend without a domain | Email OTP only reaches you | Google + guest work for everyone; verify a domain before inviting non-Google users. |
| Vercel Hobby is non-commercial | Can't charge on Hobby | Move to Pro before Phase 4 goes live. |
| Razorpay KYC / business entity | Needed for live payments | Start KYC during Phase 3 so it doesn't block Phase 4. |
| Lone-guest data loss (D2) | A guest alone in a group who clears storage loses it | "Save your account" card after the first expense; export is always available. |
| Singapore round trip (~60–80 ms from India) | Slower writes than a Mumbai region | Optimistic UI now; the outbox in Phase 3 hides it fully. Revisit if Neon adds Mumbai. |
| Secondary FX source (D8) | Free APIs change terms | Hidden behind an `FxProvider` interface; manual rate entry always works. |
