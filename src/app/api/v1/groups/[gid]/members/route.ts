import { addMemberBody } from '@/lib/contracts/members';
import { route } from '@/server/http/route';
import { addPlaceholder } from '@/server/services/core/members';

export const POST = route({
  auth: 'member',
  body: addMemberBody,
  status: 201,
  handler: async ({ membership, body }) => addPlaceholder(membership, body.displayName),
});
