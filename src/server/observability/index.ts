import 'server-only';

/** Reports an unexpected server error to Sentry when configured. Never throws. */
export async function captureException(err: unknown, context?: Record<string, string>) {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, context ? { tags: context } : undefined);
  } catch {
    /* reporting must never break a request */
  }
}
