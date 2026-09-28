import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const [Sentry, { scrubEvent }] = await Promise.all([
      import('@sentry/nextjs'),
      import('./server/observability/scrub'),
    ]);
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: {
          request: { allow: ['user-agent', 'accept', 'content-type'] },
          response: false,
        },
        httpBodies: [],
        urlQueryParams: false,
      },
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
