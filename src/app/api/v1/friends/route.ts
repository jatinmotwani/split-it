import { addFriendBody } from '@/lib/contracts/friends';
import { route } from '@/server/http/route';
import { addFriend, listFriends } from '@/server/services/core/friends';

export const GET = route({
  auth: 'user',
  handler: async ({ user }) => listFriends(user.id),
});

/** Find or create the 1:1 group with a friend (idempotent on the client id). */
export const POST = route({
  auth: 'user',
  body: addFriendBody,
  idempotent: true,
  status: 201,
  handler: async ({ user, body }) => addFriend(user, body),
});
