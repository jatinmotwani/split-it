import { explainQuery } from '@/lib/contracts/balances';
import { route } from '@/server/http/route';
import { assertInGroup, explainNetFor, explainPairFor } from '@/server/services/core/balances';

/** ?a=&b= explains a pair (raw view); ?member= explains one person's net (simplified view). */
export const GET = route({
  auth: 'member',
  query: explainQuery,
  handler: async ({ membership, query }) => {
    if ('member' in query) {
      await assertInGroup(membership.group.id, [query.member]);
      return explainNetFor(membership, query.member);
    }
    await assertInGroup(membership.group.id, [query.a, query.b]);
    return explainPairFor(membership, query.a, query.b);
  },
});
