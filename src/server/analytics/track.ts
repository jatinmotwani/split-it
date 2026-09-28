import 'server-only';
import { waitUntil } from '@vercel/functions';
import { after } from 'next/server';
import { PostHog } from 'posthog-node';
import { EVENT_SCHEMAS, type EventName, type EventProps } from '@/lib/analytics/events';

export type AnalyticsClient = Pick<PostHog, 'capture' | 'flush'>;

let client: AnalyticsClient | null | undefined;

function getClient(): AnalyticsClient | null {
  if (client !== undefined) return client;
  const key = process.env.POSTHOG_KEY;
  client = key
    ? new PostHog(key, {
        host: process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        flushAt: 1,
        flushInterval: 0,
        disableGeoip: true,
      })
    : null;
  return client;
}

export function setAnalyticsClientForTesting(fake: AnalyticsClient | null | undefined) {
  client = fake;
}

function flushLater(c: AnalyticsClient) {
  const flush = () => c.flush().catch(() => {});
  try {
    after(flush);
  } catch {
    // Outside a request (tests, scripts): let the platform keep it alive if it can.
    waitUntil(flush());
  }
}

/**
 * Server-side product analytics (ARCHITECTURE §12). Invalid events are dropped with a warning,
 * and analytics never throws into the caller.
 */
export function track<E extends EventName>(
  event: E,
  props: EventProps<E>,
  distinctId: string,
): boolean {
  const schema = EVENT_SCHEMAS[event] as unknown as {
    safeParse: (v: unknown) => { success: boolean };
  };
  if (!schema || !schema.safeParse(props).success) {
    console.warn(`[analytics] dropped invalid event ${String(event)}`);
    return false;
  }
  const c = getClient();
  if (!c) return false;
  try {
    c.capture({ distinctId, event, properties: { ...props, $process_person_profile: false } });
    flushLater(c);
    return true;
  } catch {
    return false;
  }
}
