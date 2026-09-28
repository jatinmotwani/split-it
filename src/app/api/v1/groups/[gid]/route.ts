import { updateGroupBody } from '@/lib/contracts/groups';
import { route } from '@/server/http/route';
import { getGroupDetail, updateGroup } from '@/server/services/core/groups';

export const GET = route({
  auth: 'member',
  handler: async ({ membership, user }) => getGroupDetail(membership, user.id),
});

/** Rename, change type or currency, toggle simplify debts. Any member can. */
export const PATCH = route({
  auth: 'member',
  body: updateGroupBody,
  handler: async ({ membership, body, user }) => updateGroup(membership, body, user.id),
});
