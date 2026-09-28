import { z } from 'zod';
import { route } from '@/server/http/route';
import { mintClaimLink } from '@/server/services/core/members';

const params = z.object({ gid: z.uuid(), mid: z.uuid() });

export const POST = route({
  auth: 'member',
  params,
  status: 201,
  handler: async ({ membership, params }) => mintClaimLink(membership, params.mid),
});
