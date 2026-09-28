# Split It

Split shared expenses with friends, flatmates, couples and trips. The core is free forever: no daily caps, no ads, and money never moves through the app.

- Product spec: [`SPEC.md`](SPEC.md)
- How it's built: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Task list and status: [`PROGRESS.md`](PROGRESS.md)

## Quickstart

Requires Node 22.12+ (24 LTS recommended) and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL at least
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

Without any keys the app still runs: guest sign-in works, email codes are printed to the terminal, and Sentry and PostHog do nothing.

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm typecheck` | Generate route types, then `tsc --noEmit` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` | Unit and integration tests (Vitest, PGlite; no database needed) |
| `pnpm e2e` | Playwright on a phone-sized viewport (needs `E2E_DATABASE_URL`) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations |

## Accounts to create (task 0.0)

About 45 minutes. Put every value in Vercel (Project → Settings → Environment Variables) and in `.env.local`. The names match `.env.example`.

1. **Neon** (neon.tech): create a project in **AWS Asia Pacific (Singapore)**. Keep the `main` branch for production and add a `dev` branch for local work.
   - `DATABASE_URL`: the **pooled** connection string.
   - `DATABASE_URL_UNPOOLED`: the direct one, used for migrations.
2. **Vercel**: import this GitHub repo. `vercel.json` already sets the region to `sin1`, the build command and the daily cron.
   - Add the **Neon integration** from the Vercel marketplace, so each preview deploy gets its own database branch.
   - `CRON_SECRET`: any long random string.
3. **Google Cloud** → APIs & Services → Credentials → *OAuth client ID* (Web application). Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-production-domain>/api/auth/callback/google`
   - Then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Preview deploys reuse the production callback through Better Auth's OAuth proxy, so they need no extra URIs.
4. **Better Auth**:
   - `BETTER_AUTH_SECRET`: run `openssl rand -base64 32`.
   - `BETTER_AUTH_URL`: the production URL.
5. **Resend** (resend.com): create an API key and set `RESEND_API_KEY`.
   - Until you verify a domain, leave `EMAIL_FROM` as `onboarding@resend.dev`. Codes are then only delivered to your own Resend account email.
6. **Sentry**: create a Next.js project and set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (same value).
7. **PostHog**: create a project and set `POSTHOG_KEY` and `POSTHOG_HOST` (for example `https://eu.i.posthog.com`).

Before you charge money (Phase 4), move Vercel from Hobby to Pro: Hobby is non-commercial.
