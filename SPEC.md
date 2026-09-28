# SPEC.md — `APP_NAME`: shared-expense splitting that never blocks free users

> Usage: put this file in an empty repo as `SPEC.md`, start Claude Code in plan mode, and say: **"Read SPEC.md and do §13 Kickoff."**
> `APP_NAME` is a placeholder. Keep the product name in one config constant so I can rename later.

---

## 0. Working agreement (read first)

- I'm a solo Node.js/TypeScript developer with ~1 hour/day. Optimize for small reviewable steps, boring tech, managed services, near-zero ops.
- Never start a phase without a written plan I approve. Keep `PROGRESS.md` as a checkbox task list; each task fits one ~45-minute session and has an acceptance check. Update it after every task.
- Maintain a short `CLAUDE.md` (commands, conventions, gotchas you discover). Import this spec from it with `@SPEC.md`.
- Money logic is test-first. Never commit with failing tests, type errors, or lint errors.
- If the spec conflicts with reality (library API changed, a clearly better approach exists), stop and tell me. Don't silently deviate.
- One Conventional Commit per task. After each task, tell me in ≤ 5 lines what changed and what to verify manually.

## 1. Product

Mobile-first PWA for splitting shared expenses among friends, flatmates, couples, and trips. India-first (INR default, `en-IN` formatting with lakh/crore grouping, fast on low-end Android), works in any currency.

Target users: Indian flatmates (recurring bills, monthly settle), trip groups (bursty, many expenses per day), couples.

**Core promise:** the core loop is free and unlimited forever — no daily caps, no cooldown timers, no ads, no "upgrade to add an expense". Moving an entire Splitwise group over takes minutes, with balances verified against Splitwise's own totals. **Money never moves through the app.**

Context: Splitwise now caps free users' daily expenses; users hate the cooldowns, ads, and per-person subscriptions. Many "free Splitwise alternatives" already exist, so we win on (a) the smoothest whole-group migration, (b) speed and trust in daily use, (c) monetization people are happy to pay for.

## 2. Principles (use these to resolve ambiguity)

1. Never meter, slow, or interrupt the core loop: add/edit expense, view balances, record a settlement, invite, view history, import, export.
2. Charge only for (a) features with real marginal cost (AI), (b) power/convenience (insights, reports), (c) cosmetics and identity.
3. One purchase can unlock a whole group. Nobody should need every friend to subscribe.
4. Trust over features: every balance is explainable, every edit is versioned and restorable, export is always free.
5. Speed: the common expense (I paid, split equally, last-used group) takes ≤ 3 taps from app open and works offline.
6. Zero-friction joining: invite link → join as a guest with just a name → upgrade to a real account later. Guests who lose their session recover via a fresh claim link from any member.

## 3. Non-goals (do NOT build)

- Settlement/payment rails of any kind: no UPI intents or deep links, payment links, wallets, bank linking, PayPal. "Settle up" only **records** that a payment happened, with a method label (cash / UPI / bank / other).
- Splitwise API/OAuth integration or scraping. Splitwise's developer terms prohibit using their API to build an app that replicates or competes with Splitwise. Import is CSV-only, from files users export themselves.
- The Splitwise name/logo in our product name, feature names, or branding. Descriptive copy like "works with Splitwise CSV exports" is fine.
- Contact-book upload; phone/SMS OTP (cost + DLT registration overhead); native apps (PWA first); ads; personal budgeting beyond shared expenses.

## 4. Stack (low-ops; propose alternatives only with a strong reason)

| Concern | Choice |
|---|---|
| App | Next.js (latest stable, App Router), TypeScript `strict`, one deployable app |
| DB | Postgres (Neon) + Drizzle ORM + drizzle-kit migrations |
| Auth | Better Auth: Google OAuth + email OTP + anonymous/guest users linkable to a real account |
| API | Route Handlers (JSON), Zod-validated input/output, shared contracts in `src/lib/contracts` |
| Client data | TanStack Query; IndexedDB (Dexie) outbox for offline mutations |
| PWA | Serwist (service worker, install, offline shell) |
| UI | Tailwind + shadcn/ui + lucide; dark mode; mobile-first |
| Files | Cloudflare R2 (S3 API); receipts compressed client-side to WebP (~200 KB max) |
| Email | Resend |
| Payments | Razorpay (Subscriptions incl. UPI AutoPay; Orders for one-time) behind a `PaymentProvider` interface |
| AI (Plus) | Anthropic API, default model `claude-haiku-4-5-20251001`, behind an `AiProvider` interface; log cost per call |
| FX | Daily ECB reference rates (e.g., Frankfurter API), cached in DB |
| Jobs | Vercel Cron (or GitHub Actions cron) hitting authenticated, idempotent endpoints |
| Observability | Sentry (errors), PostHog (product events, no PII) |
| Tests/CI | Vitest + fast-check (property tests), Playwright (mobile viewport); GitHub Actions: typecheck, lint, unit, e2e, build |
| Hosting | Vercel. Hobby tier is non-commercial — move to Pro before charging. Everything configurable via env vars. |

## 5. Money & ledger rules (CRITICAL — build and test before any UI)

### 5.1 Representation
- Amounts are integer minor units. DB: `bigint`; TS: `number` with `Number.isSafeInteger` assertions at every boundary. Never floats for money.
- Currency: ISO 4217 code; minor-unit exponent from a table (INR 2, USD 2, JPY 0, KWD 3 …).
- Every ledger entry has `payers[]` `{memberId, amount}` and `shares[]` `{memberId, amount}`. Invariant: Σpayers = Σshares = amount; all ≥ 0. Enforce in the domain layer and re-check inside the write transaction.
- Entry kinds: `expense`, `settlement` (payer = sender, share = receiver), `opening_balance` (carry-over / migration). Same payers/shares mechanism for all → one balance query.
- Member net (per group, per currency) = Σpaid − Σowed over non-deleted entries. Invariant: Σnets = 0 per group per currency.
- 1:1 friend expenses live in an auto-created hidden `direct` group with exactly 2 members. Friend balance = sum across all shared groups.

### 5.2 Split types (pure functions in `src/lib/money`, 100% branch coverage)
- `equal`; `exact` (must sum to amount; UI shows remainder); `percentage` (integer basis points, total 10000); `shares` (weights ×100 as integers); `adjustment` (per-person ± then equal split of the rest); `itemized` (items → assignees with weights; tax / service charge / tip / discount distributed proportionally to item subtotals — typical Indian restaurant bill with GST + service charge).
- Rounding: largest-remainder method. Leftover minor units go to members in a deterministic order seeded by the entry id, so the extra paisa rotates across expenses instead of always hitting the same person. Same input ⇒ same output.
- Multiple payers supported with every split type.

### 5.3 Who owes whom
- Raw pairwise view: each member's share of an entry is attributed to that entry's payers proportionally to what they paid (largest-remainder).
- Simplified view (group setting, default ON): per currency, greedily match the largest debtor with the largest creditor; deterministic tie-break by member id; at most n−1 transfers.
- Settle suggestions come from the active view. Applying all suggestions must zero every balance.
- "Explain" query: for a member pair, list contributing entries and amounts — powers "Why do I owe ₹X?" on every balance.

### 5.4 Multi-currency
- Balances are per currency; never silently merged.
- Optional "show in group currency": display-only conversion using the rate stored on each entry (rate, date, source captured at entry time). Explicit "convert this expense" stores both original and converted amounts.

### 5.5 Edits, deletes, members
- Any group member can edit. Each edit bumps `version`, snapshots the previous state to `entry_revisions`, and writes an `activity` row. Deletes are soft with one-tap restore.
- Owner can remove members and rotate the invite link. Removing a member with a non-zero balance requires settling or transferring it first.

### 5.6 Required property tests (fast-check)
- Random amount/members/split input ⇒ Σshares = amount, no negatives, deterministic.
- Random ledgers ⇒ Σnets = 0; simplified plan settles exactly; transfers ≤ n−1.
- Generated Splitwise CSV ⇒ imported nets equal the CSV's "Total balance" row exactly.

## 6. Data model (Drizzle; refine names in ARCHITECTURE.md)

`users` · `groups` (type: trip|home|couple|other|direct, default_currency, simplify_debts, invite_code) · `group_members` (user_id nullable = placeholder until claimed, display_name, role, claim_token) · `entries` (id = client-generated UUIDv7, group_id, kind, description, category, amount, currency, fx_rate/fx_date/fx_source, date, notes, split_type, split_input jsonb, created_by_member_id, source: app|splitwise_import|recurring, import_row_hash, version, deleted_at, timestamps) · `entry_payers` · `entry_shares` · `entry_items` + `entry_item_assignees` · `entry_revisions` · `comments` · `activity` · `recurring_rules` (template jsonb, schedule, next_run_at, active) · `receipts` (storage_key, bytes, ocr_status, ocr_json) · `imports` (source, file_hash, status, report jsonb) · `entitlements` (subject_type user|group, subject_id, source: subscription|trip_pass|trial|lifetime|promo, starts_at, ends_at) · `subscriptions` · `payments` (raw webhook jsonb) · `idempotency_keys` · `fx_rates` · `feature_config` (prices, quotas, flags).

Indexes: (group_id, deleted_at, date); member lookups; unique (group_id, import_row_hash); unique (recurring_rule_id, period).

## 7. Phases (each ends deployed, with an e2e test of its main flow)

### Phase 0 — Foundations
Repo, strict TS, lint/format, Vitest, Playwright, CI, Drizzle + Neon, Better Auth (Google, email OTP, guest), Sentry, preview deploys, `CLAUDE.md`, `PROGRESS.md`, `.env.example`.

### Phase 1 — Core loop (MVP)
- Create group (name, type, currency). Invite link + "Share on WhatsApp" (`wa.me` with prefilled text). Join page shows group name and members; join as guest (name only) or signed in; claim a placeholder member.
- Add expense: amount-first keypad with inline math (`450+120`), description, payer(s), split (equal default), date, category (keyword auto-suggest, e.g. swiggy/zomato → Food, uber/ola/rapido → Transport; editable). Remember last payer/split per group.
- Group screen: balances, settle suggestions, expenses grouped by date, activity feed. Record settlement. Friend (1:1) expenses. Home: overall owe/owed across groups, groups sorted by recent activity, global "+" that remembers the last group.
- Edit/delete/restore with history; comments; "Explain" on every balance.
- Acceptance: 3 users (1 guest) run a 20-expense trip on a mobile viewport; balances correct; applying settle suggestions zeroes everyone.

### Phase 2 — Splitwise migration + acquisition tool
- **2a** CSV importer (§8): upload → preview → member mapping → verification → import report.
- **2b** Opening balances: "Carry over a balance" (friend, amount, direction) for friend balances Splitwise group exports don't include.
- **2c** Group migration: after import, generate per-placeholder claim links and a WhatsApp message ("Our group moved — tap to claim your spot, balances match Splitwise").
- **2d** Public "Wrapped" tool at `/tools/wrapped` (no signup): user drops a Splitwise group CSV; parsed 100% client-side (never uploaded — say so prominently); shows total spent, top payer, biggest expense, category split, busiest day, "the group treasurer"; generates a shareable image card; CTA "Continue this group in APP_NAME — balances verified". Fast, fun, SEO-friendly (static page, good meta/OG tags). Reuses the importer's parser.

### Phase 3 — Love & retention
Offline outbox (queued mutations, sync on reconnect; conflicts = last-write-wins per entry with the losing version kept in revisions) · PWA install prompt after the 2nd expense (never on first visit) · recurring entries (rent, cook/maid, WiFi, electricity; daily idempotent job) · manual itemized split · multi-currency + FX display · search & filters (free) · month/trip summary share card for WhatsApp · CSV/JSON export anytime · receipt photo attach · opt-in web push for new expenses in my groups · read-only demo group for empty states.

### Phase 4 — Monetization (§9)
Entitlements service, Razorpay, Plus, Trip Pass, trial, AI receipt scan, AI quick-add, insights, reports, cosmetics, upsell rules, funnel analytics.

### Phase 5 — Launch hardening
Landing page with a public "Free Forever Pledge" (the §9.1 list); SEO pages (how to move from Splitwise, split calculators); privacy policy, terms, refund policy; account deletion + data export; India DPDP-aligned consent notice and grievance contact; Neon backups + one restore drill; abuse-only rate limits far above human usage; performance pass on a throttled low-end Android profile.

## 8. Splitwise CSV import

**Source:** Splitwise website → group → settings → export as spreadsheet (CSV). Per group, web only. Must be exported with Splitwise set to English (headers are parsed).

**Format — confirm every detail against the real sample in `fixtures/splitwise/` before coding:**

```csv
Date,Description,Category,Cost,Currency,Asha,Ravi,Neel
2026-01-05,Dinner,Dining out,1200.00,INR,800.00,-400.00,-400.00
2026-01-06,Ravi paid Asha,Payment,400.00,INR,-400.00,400.00,0.00

2026-01-06,Total balance, , ,INR,400.00,0.00,-400.00
```

- Each member column = that member's `paid − owed` for the row.
- Final "Total balance" row(s) = per-member column sums. Verify whether multi-currency groups get one total row per currency.
- Settlements typically appear with Category "Payment" (verify with the sample).

**Parsing:** papaparse; sniff `,` vs `;`; strip BOM; quoted names containing commas; trim cells; tolerate thousands separators; skip blank rows; detect total rows by Description "Total balance" (not by position or blank fields). Chunked parsing for 5k+ rows.

**Row → entry reconstruction (minor units):**
1. Category "Payment" with exactly one positive and one negative member of equal magnitude → `settlement` from the positive member to the negative member.
2. Exactly one positive member P → `payers = [{P, Cost}]`, `share(P) = Cost − net(P)` (must be ≥ 0), `share(i) = −net(i)` for negatives, 0 otherwise. Check Σshares = Cost.
3. Several positive members (multi-payer; the export loses the true split) → balance-preserving fallback: payers = positives with `paid = net`, shares = negatives with `|net|`, amount = Σpositives; keep original Cost in `split_input.import.originalCost`; `split_type = 'imported_net'`; UI badge "Imported (net amounts)".
4. All members zero → zero-impact record (import by default; toggle to skip).
5. |Σnets| > tolerance (1 minor unit × member count) → invalid row: shown in the report, never imported silently.

**Mapping UI:** CSV names → existing member / new placeholder / "This is me". Suggest matches by normalized name.

**Verification:** recompute per-member totals per currency and diff against the total row(s). Show "✓ Matches Splitwise exactly" or a per-member diff. Import only when the diff is zero, or when the user explicitly accepts one auto-generated `opening_balance` "Import adjustment" entry that closes the gap.

**Idempotency:** `import_row_hash = sha256(date|description|category|cost|currency|sorted name:net pairs)`, unique per group; re-imports skip duplicates and report them. One transaction per file.

**Tell users what isn't in the export:** friend balances outside groups (→ opening balances), comments, receipt images.

**Fixtures + golden tests:** single payer; payer not a participant; multi-payer; payment rows; two currencies; zero rows; names with commas; semicolon delimiter; BOM; 5k-row file; the real anonymized sample.

## 9. Monetization

### 9.1 Free forever (the pledge — add a test asserting these code paths never consult entitlements)
Unlimited groups, members, and expenses; every split type incl. manual itemized; multiple payers; simplify debts; recurring; multi-currency + FX display; search; comments; receipt photo attach; history and restore; offline; Splitwise import; CSV/JSON export; dark mode. No ads, ever.

### 9.2 Plus (per user) — launch prices are hypotheses; store in `feature_config`
₹49/month · ₹399/year · ₹999 lifetime (one-time).
- AI receipt scan → merchant, date, items, taxes, service charge, total → tap to assign items → itemized split. If Σparts ≠ total, highlight for correction. Never save without user confirmation.
- AI quick-add: "cab 450 paid by me split with Ravi and Anu" → prefilled form to confirm. A deterministic local parser handles simple patterns for everyone for free; AI runs only when local parsing fails.
- Insights: spend by category / month / member, per-group budgets, trip report.
- PDF and XLSX reports (trip summary + settle plan).
- Cosmetics: themes, app icons, group covers, supporter badge. Early-access flag.

### 9.3 Trip Pass (per group) — ₹99 one-time, 30 days, never auto-renews
Any member can buy it; every member gets Plus features inside that group for 30 days.

### 9.4 Taste and trial (no bait-and-switch)
- 3 free AI receipt scans per user per month (configurable).
- First group created gets a 14-day Plus trial: no payment details, ends quietly back to free, nothing breaks, no data lost.

### 9.5 Upsell rules (hard rules — copy into CLAUDE.md)
- Never block, delay, or interrupt §9.1 flows. No countdowns, interstitials, or full-screen upsells on open.
- Upsell only when a user taps a Plus feature: a bottom sheet where "Not now" is as prominent as "Upgrade". At most one upsell impression per user per day (server-tracked).
- Show the renewal date; cancel in ≤ 2 taps; email 3 days before an annual renewal.

### 9.6 Implementation
- `entitlements.can(userId, feature, groupId?)`: single source of truth; resolves Plus subscription OR lifetime OR group Trip Pass OR trial; per-request cache.
- Razorpay Subscriptions (monthly/annual) and Orders (Trip Pass, lifetime). Webhooks: verify signature, idempotent handlers, write `payments` then `entitlements`; daily reconciliation job.
- AI cost guard: log cost per call; abuse-only per-user daily cap; alert when monthly AI spend exceeds a configured share of revenue.
- Funnel events: `upsell_shown`, `upsell_clicked`, `checkout_started`, `purchase_completed`, `scan_used`.

## 10. UX requirements
- Common add-expense in ≤ 3 taps; keypad supports inline math.
- Every balance is tappable → explanation list.
- Placeholder members are first-class ("Ravi — not joined yet · Send claim link").
- Accessibility: WCAG AA contrast, 44 px tap targets, labelled controls.
- Performance: lean JS on core routes; lazy-load charts/reports; test on a throttled low-end Android profile.
- Copy: friendly, short, Indian English; ₹ via `Intl.NumberFormat('en-IN')`.

## 11. Security & privacy
- Authorization on every read/write: requester must be a member of the group (guests included). Tests prove cross-group access fails for every route.
- Invite and claim tokens: ≥ 128-bit random, rotatable, optional expiry; claim tokens single-use; rate-limit joins.
- Zod on all inputs; length limits; never render user text as raw HTML.
- Minimal PII (name; email optional for guests); no contacts upload; no PII in logs or analytics.
- Account deletion removes PII and keeps other members' ledgers intact by renaming the member "Deleted user"; `/account/export` returns all of a user's data as JSON.

## 12. Analytics (activation-focused)
`group_created`, `member_joined` (guest vs account), `expense_added`, `settlement_recorded`, `import_completed` (rows, verified?), `claim_link_opened`, `wrapped_viewed`, `wrapped_shared`, plus §9.6 funnel events. North star: weekly active groups with ≥ 2 active members.

## 13. Kickoff (do this now)
1. Read the whole spec. Don't write code yet.
2. Interview me: up to 8 numbered questions where the spec is ambiguous or where you'd recommend something different — include your default answer for each so I can reply "ok" quickly.
3. After my answers: write `ARCHITECTURE.md` (modules, folder structure, data flow, offline sync, entitlement resolution), the Drizzle schema draft, and `PROGRESS.md` for Phases 0–1.
4. Wait for my approval, then implement Phase 0 task by task.
