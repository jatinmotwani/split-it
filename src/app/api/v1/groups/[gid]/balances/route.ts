import { route } from '@/server/http/route';
import { getBalances } from '@/server/services/core/balances';

export const GET = route({
  auth: 'member',
  handler: async ({ membership }) => getBalances(membership),
});
