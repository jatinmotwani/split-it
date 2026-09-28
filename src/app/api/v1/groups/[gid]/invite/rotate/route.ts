import { route } from '@/server/http/route';
import { rotateInvite } from '@/server/services/core/invites';

export const POST = route({
  auth: 'member',
  handler: async ({ membership }) => rotateInvite(membership),
});
