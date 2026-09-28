import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { anonymous } from 'better-auth/plugins/anonymous';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { oAuthProxy } from 'better-auth/plugins/oauth-proxy';
import { APP_NAME } from '@/config/app';
import { getDb, type Db } from '@/server/db';
import { account, session, user, verification } from '@/server/db/schema';
import { sendEmail, signInCodeEmail } from '@/server/email';
import { onGuestLinked } from './link';
import { env, isProduction } from '@/server/env';

const DAY = 60 * 60 * 24;
const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret-change-me';

function buildAuth(db: Db) {
  const e = env();
  const secret = e.BETTER_AUTH_SECRET ?? (isProduction() ? undefined : DEV_SECRET);
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required in production.');
  const googleEnabled = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  // Previews have no fixed URL: Google calls back to production, which forwards to the preview.
  const productionURL = e.OAUTH_PROXY_PRODUCTION_URL ?? e.BETTER_AUTH_URL;
  const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter(Boolean)
    .map((host) => `https://${host}`);

  return betterAuth({
    appName: APP_NAME,
    baseURL: e.BETTER_AUTH_URL ?? e.APP_URL ?? vercelOrigins[0],
    trustedOrigins: [...vercelOrigins, ...(productionURL ? [productionURL] : [])],
    secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    rateLimit: {
      // Abuse-only limits. Better Auth's default (3 sign-ins per 10 s per IP) would lock out
      // friends behind one mobile carrier IP (Indian networks use carrier-grade NAT heavily).
      window: 60,
      max: 600,
      customRules: {
        '/sign-in/anonymous': { window: 60, max: 60 },
        '/sign-in/email-otp': { window: 60, max: 30 },
        '/sign-in/social': { window: 60, max: 30 },
        '/email-otp/send-verification-otp': { window: 60, max: 10 },
      },
    },
    session: {
      // ARCHITECTURE §8: 180-day rolling sessions, refreshed at most daily.
      expiresIn: 180 * DAY,
      updateAge: DAY,
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: e.GOOGLE_CLIENT_ID!,
            clientSecret: e.GOOGLE_CLIENT_SECRET!,
            prompt: 'select_account',
            ...(productionURL ? { redirectURI: `${productionURL}/api/auth/callback/google` } : {}),
          },
        }
      : {},
    plugins: [
      anonymous({
        emailDomainName: 'guest.split-it.invalid',
        async onLinkAccount({ anonymousUser, newUser }) {
          await onGuestLinked(anonymousUser.user.id, newUser.user.id);
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }) {
          sendEmail(signInCodeEmail(email, otp));
        },
      }),
      ...(googleEnabled ? [oAuthProxy({ productionURL })] : []),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

let cache: { db: Db; auth: Auth } | null = null;

/** One Better Auth instance per database (tests swap the database). */
export function getAuth(): Auth {
  const db = getDb();
  if (!cache || cache.db !== db) cache = { db, auth: buildAuth(db) };
  return cache.auth;
}

export function isGoogleEnabled(): boolean {
  const e = env();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}
