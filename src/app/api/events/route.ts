import { z } from 'zod';
import { CLIENT_EVENTS, type EventName } from '@/lib/analytics/events';
import { track } from '@/server/analytics/track';
import { badRequest } from '@/server/http/errors';
import { route } from '@/server/http/route';

const body = z.object({
  event: z.string().max(40),
  props: z.record(z.string(), z.unknown()).default({}),
  anonymousId: z.uuid().optional(),
});

/** Browser beacon for the few client-only events (D7). Signed-in users are tracked by id. */
export const POST = route({
  auth: 'optional',
  body,
  status: 202,
  handler: async ({ body, user }) => {
    if (!CLIENT_EVENTS.has(body.event as EventName)) throw badRequest('Unknown event.');
    const distinctId = user?.id ?? body.anonymousId;
    if (!distinctId) throw badRequest('anonymousId is required when signed out.');
    track(body.event as EventName, body.props as never, distinctId);
    return { ok: true };
  },
});
