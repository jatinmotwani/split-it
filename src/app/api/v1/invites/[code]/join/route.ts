import { z } from 'zod';
import { joinBody } from '@/lib/contracts/invites';
import { clientIp, LIMITS, rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { joinViaInvite } from '@/server/services/core/invites';

const params = z.object({ code: z.string().min(10).max(64) });

export const POST = route({
  auth: 'user',
  params,
  body: joinBody,
  handler: async ({ req, params, body, user }) => {
    await rateLimit(`join:ip:${clientIp(req)}`, LIMITS.joinPerIp.limit, LIMITS.joinPerIp.window);
    await rateLimit(
      `join:code:${params.code}`,
      LIMITS.joinPerCode.limit,
      LIMITS.joinPerCode.window,
    );
    return joinViaInvite(params.code, user, body);
  },
});
