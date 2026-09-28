// Browser error reporting. Loaded lazily and only when a DSN is configured, so the Sentry SDK
// never lands in the core bundle otherwise (SPEC §10: lean JS on core routes).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
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
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.query_string;
        }
        if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
        return event;
      },
    });
  });
}
