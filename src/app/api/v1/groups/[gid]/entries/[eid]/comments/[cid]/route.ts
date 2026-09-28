import { z } from 'zod';
import { route } from '@/server/http/route';
import { deleteComment } from '@/server/services/core/comments';

const params = z.object({ gid: z.uuid(), eid: z.uuid(), cid: z.uuid() });

/** Soft delete: its author or the group owner. */
export const DELETE = route({
  auth: 'member',
  params,
  handler: async ({ membership, params }) => deleteComment(membership, params.eid, params.cid),
});
