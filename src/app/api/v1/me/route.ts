import type { MeResponse } from '@/lib/contracts/me';
import { route } from '@/server/http/route';

export const GET = route({
  auth: 'user',
  handler: async ({ user }): Promise<MeResponse> => ({
    id: user.id,
    name: user.name,
    email: user.isAnonymous ? null : user.email,
    isGuest: user.isAnonymous,
  }),
});
