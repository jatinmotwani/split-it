import 'server-only';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: optional,
  DATABASE_URL: optional,
  BETTER_AUTH_SECRET: optional,
  BETTER_AUTH_URL: optional,
  /** Production origin that preview deploys route Google sign-in through. */
  OAUTH_PROXY_PRODUCTION_URL: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  SENTRY_DSN: optional,
  POSTHOG_KEY: optional,
  POSTHOG_HOST: optional,
  CRON_SECRET: optional,
  /** Test-only inbox for email codes. Never set in production. */
  ENABLE_DEV_OUTBOX: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parsed lazily so `next build` doesn't need runtime secrets. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** For tests that change process.env. */
export function resetEnvCache() {
  cached = null;
}

export const isProduction = () => env().NODE_ENV === 'production';
