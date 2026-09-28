/** Header names safe to send to Sentry. Everything else (cookies, auth, forwarded IPs) is dropped. */
const SAFE_HEADERS = new Set(['user-agent', 'accept', 'content-type', 'x-request-id']);

type SentryLikeEvent = {
  request?: {
    cookies?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
    query_string?: unknown;
  };
  user?: { id?: string | number; [k: string]: unknown };
  extra?: Record<string, unknown>;
};

/**
 * SPEC §11: no PII in logs or error reports. Keeps only the opaque user id, safe headers and the
 * URL path; drops cookies, bodies, query strings, emails and IPs.
 */
export function scrubEvent<T extends SentryLikeEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase())),
      );
    }
  }
  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }
  return event;
}
