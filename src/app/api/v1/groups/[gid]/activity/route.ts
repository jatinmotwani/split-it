import { activityQuery } from '@/lib/contracts/activity';
import { route } from '@/server/http/route';
import { listActivity } from '@/server/services/core/entry-lifecycle';

export const GET = route({
  auth: 'member',
  query: activityQuery,
  handler: async ({ membership, query }) => listActivity(membership.group.id, query),
});
