import { z } from 'zod';
import { clientIp, LIMITS, rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { claimSpot, previewClaim } from '@/server/services/core/members';

const params = z.object({ token: z.string().min(20).max(100) });

async function limit(req: Request) {
  await rateLimit(`claim:ip:${clientIp(req)}`, LIMITS.claimPerIp.limit, LIMITS.claimPerIp.window);
}

export const GET = route({
  auth: 'optional',
  params,
  handler: async ({ req, params, user }) => {
    await limit(req);
    return previewClaim(params.token, user);
  },
});

export const POST = route({
  auth: 'user',
  params,
  handler: async ({ req, params, user }) => {
    await limit(req);
    return claimSpot(params.token, user);
  },
});
