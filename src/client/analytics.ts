import type { EventName, EventProps } from '@/lib/analytics/events';

function anonymousId(): string {
  try {
    let id = localStorage.getItem('aid');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('aid', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Fire-and-forget beacon for client-only events. Never throws. */
export function trackClient<E extends EventName>(event: E, props: EventProps<E>) {
  try {
    const payload = JSON.stringify({ event, props, anonymousId: anonymousId() });
    const blob = new Blob([payload], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/events', blob)) {
      void fetch('/api/events', {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* analytics must never break the app */
  }
}
