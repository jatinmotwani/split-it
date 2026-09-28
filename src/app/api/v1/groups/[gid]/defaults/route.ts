import { route } from '@/server/http/route';
import { entryDefaults } from '@/server/services/core/balances';

export const GET = route({
  auth: 'member',
  handler: async ({ membership }) => ({ defaults: await entryDefaults(membership) }),
});
