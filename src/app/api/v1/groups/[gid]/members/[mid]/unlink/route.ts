import { z } from 'zod';
import { route } from '@/server/http/route';
import { unlinkMember } from '@/server/services/core/members';

const params = z.object({ gid: z.uuid(), mid: z.uuid() });

export const POST = route({
  auth: 'member',
  params,
  handler: async ({ membership, params }) => unlinkMember(membership, params.mid),
});
