import { z } from 'zod';
import { restoreQuery } from '@/lib/contracts/entries';
import { route } from '@/server/http/route';
import { restoreEntry } from '@/server/services/core/entry-lifecycle';

const params = z.object({ gid: z.uuid(), eid: z.uuid() });

/** Undelete, or with ?version=N bring back that version's content as a new version. */
export const POST = route({
  auth: 'member',
  params,
  query: restoreQuery,
  handler: async ({ membership, params, query }) =>
    restoreEntry(membership, params.eid, query.version),
});
