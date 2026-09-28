import { listEntriesQuery } from '@/lib/contracts/entries';
import { route } from '@/server/http/route';
import { listEntries } from '@/server/services/core/entry-lifecycle';

export const GET = route({
  auth: 'member',
  query: listEntriesQuery,
  handler: async ({ membership, query }) => listEntries(membership.group.id, query),
});
