import { z } from 'zod';
import { route } from '@/server/http/route';
import { removeMember } from '@/server/services/core/members';

const params = z.object({ gid: z.uuid(), mid: z.uuid() });

/** Owner removes someone, or you remove yourself (leave). Zero balance only. */
export const DELETE = route({
  auth: 'member',
  params,
  handler: async ({ membership, params }) => removeMember(membership, params.mid),
});
