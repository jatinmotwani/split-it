import { z } from 'zod';
import { route } from '@/server/http/route';
import { listRevisions } from '@/server/services/core/entry-lifecycle';

const params = z.object({ gid: z.uuid(), eid: z.uuid() });

export const GET = route({
  auth: 'member',
  params,
  handler: async ({ params }) => ({ revisions: await listRevisions(params.gid, params.eid) }),
});
