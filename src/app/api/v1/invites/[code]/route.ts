import { z } from 'zod';
import { clientIp, LIMITS, rateLimit } from '@/server/http/rate-limit';
import { route } from '@/server/http/route';
import { previewInvite } from '@/server/services/core/invites';

const params = z.object({ code: z.string().min(10).max(64) });

/** Public: the join page's group preview. */
export const GET = route({
  auth: 'optional',
  params,
  handler: async ({ req, params, user }) => {
    const { limit, window } = LIMITS.invitePreviewPerIp;
    await rateLimit(`invite:ip:${clientIp(req)}`, limit, window);
    return previewInvite(params.code, user);
  },
});
