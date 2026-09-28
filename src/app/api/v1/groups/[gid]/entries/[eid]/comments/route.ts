import { z } from 'zod';
import { addCommentBody } from '@/lib/contracts/comments';
import { route } from '@/server/http/route';
import { addComment, listComments } from '@/server/services/core/comments';

const params = z.object({ gid: z.uuid(), eid: z.uuid() });

export const GET = route({
  auth: 'member',
  params,
  handler: async ({ membership, params }) => ({
    comments: await listComments(membership, params.eid),
  }),
});

export const POST = route({
  auth: 'member',
  params,
  body: addCommentBody,
  status: 201,
  handler: async ({ membership, params, body }) => addComment(membership, params.eid, body),
});
