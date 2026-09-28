import { createGroupBody } from '@/lib/contracts/groups';
import { route } from '@/server/http/route';
import { createGroup, listMyGroups } from '@/server/services/core/groups';

export const GET = route({
  auth: 'user',
  handler: async ({ user }) => listMyGroups(user.id),
});

/** Create a group (idempotent on the client-generated id). Guests can create too (D2). */
export const POST = route({
  auth: 'user',
  body: createGroupBody,
  idempotent: true,
  status: 201,
  handler: async ({ user, body }) => createGroup(user, body),
});
