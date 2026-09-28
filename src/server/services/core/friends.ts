import 'server-only';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type {
  AddFriendBody,
  AddFriendResponse,
  FriendCandidate,
  FriendGroupBalance,
  FriendsResponse,
  FriendSummary,
} from '@/lib/contracts/friends';
import { uuidv7 } from '@/lib/ids';
import { friendBalance, pairNet, suggestions, type PairView } from '@/lib/money/ledger';
import type { SessionUser } from '@/server/auth/session';
import { getDb, type Executor } from '@/server/db';
import { groupMembers, groups, user } from '@/server/db/schema';
import { conflict, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import { requireMember } from './authz';
import { loadLedger } from './balances';
import { memberStatus, newInviteCode } from './groups';

/** "userA:userB", sorted, for the one 1:1 group between two real users. */
export const directKeyOf = (a: string, b: string) => [a, b].sort().join(':');

/**
 * Sets a 1:1 group's direct key from its two members, or clears it while one is a placeholder.
 * If another 1:1 group already holds the key, this one keeps none: duplicates made before a
 * claim are allowed, and friend balances sum over every shared group, so no number is wrong.
 */
export async function refreshDirectKey(tx: Executor, groupId: string): Promise<void> {
  const [g] = await tx.select({ type: groups.type }).from(groups).where(eq(groups.id, groupId));
  if (g?.type !== 'direct') return;
  const members = await tx
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)));
  const ids = members.map((m) => m.userId);
  let key: string | null = null;
  if (ids.length === 2 && ids[0] && ids[1] && ids[0] !== ids[1]) {
    const candidate = directKeyOf(ids[0], ids[1]);
    const [taken] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.directKey, candidate), ne(groups.id, groupId)));
    if (!taken) key = candidate;
  }
  await tx.update(groups).set({ directKey: key }).where(eq(groups.id, groupId));
}

async function existingDirect(myUserId: string, friendUserId: string) {
  const [g] = await getDb()
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.directKey, directKeyOf(myUserId, friendUserId)));
  if (!g) return null;
  const members = await getDb()
    .select({ id: groupMembers.id, userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, g.id), isNull(groupMembers.removedAt)));
  const friend = members.find((m) => m.userId === friendUserId);
  if (!friend || !members.some((m) => m.userId === myUserId)) return null;
  return { groupId: g.id, friendMemberId: friend.id };
}

/**
 * Adds a friend: finds or creates the hidden 1:1 group with them. A co-member who has joined is
 * matched by account, so adding them twice returns the same group. Idempotent on the client id.
 */
export async function addFriend(me: SessionUser, input: AddFriendBody): Promise<AddFriendResponse> {
  const db = getDb();
  const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, input.id));
  if (existing) {
    // A retry: return the 1:1 group this id already made.
    const mine = await requireMember(me.id, input.id);
    const [friend] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.id),
          ne(groupMembers.id, mine.member.id),
          isNull(groupMembers.removedAt),
        ),
      );
    if (mine.group.type !== 'direct' || !friend) {
      throw conflict('id_taken', 'That id is already in use.');
    }
    return { groupId: input.id, friendMemberId: friend.id };
  }

  let friendName: string;
  let friendUserId: string | null = null;
  if ('memberId' in input) {
    const [co] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, input.memberId), isNull(groupMembers.removedAt)));
    if (!co) throw notFound('That person isn’t in any of your groups.');
    await requireMember(me.id, co.groupId); // 404 unless we share that group
    if (co.userId === me.id) throw conflict('self', 'That’s you.');
    friendName = co.displayName;
    friendUserId = co.userId;
    if (friendUserId) {
      const found = await existingDirect(me.id, friendUserId);
      if (found) return found;
    }
  } else {
    friendName = input.name;
  }

  const myName = me.name.trim().slice(0, 40) || 'Me';
  const friendMemberId = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: input.id,
      name: `${myName} & ${friendName}`.slice(0, 60),
      type: 'direct',
      defaultCurrency: input.currency,
      inviteCode: newInviteCode(),
      createdByUserId: me.id,
    });
    const myMemberId = uuidv7();
    await tx.insert(groupMembers).values([
      {
        id: myMemberId,
        groupId: input.id,
        userId: me.id,
        displayName: myName,
        role: 'owner',
        joinedAt: new Date(),
      },
      {
        id: friendMemberId,
        groupId: input.id,
        userId: friendUserId,
        displayName: friendName,
        role: 'member',
        joinedAt: friendUserId ? new Date() : null,
      },
    ]);
    await refreshDirectKey(tx, input.id);
    await recordActivity(tx, {
      groupId: input.id,
      actorMemberId: myMemberId,
      kind: 'group_created',
    });
  });
  return { groupId: input.id, friendMemberId };
}

/**
 * My friends (the other person in each 1:1 group) with our balance summed over every group we
 * share, each group in its active view (D4), plus people from my groups I could add.
 */
export async function listFriends(userId: string): Promise<FriendsResponse> {
  const db = getDb();
  const mine = await db
    .select({
      groupId: groupMembers.groupId,
      memberId: groupMembers.id,
      type: groups.type,
      name: groups.name,
      simplifyDebts: groups.simplifyDebts,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), isNull(groupMembers.removedAt)));
  if (mine.length === 0) return { friends: [], candidates: [] };

  // Everyone in my groups, including people who left (old debts can still be between us).
  const people = await db
    .select({
      id: groupMembers.id,
      groupId: groupMembers.groupId,
      userId: groupMembers.userId,
      displayName: groupMembers.displayName,
      removedAt: groupMembers.removedAt,
      isAnonymous: user.isAnonymous,
      groupName: groups.name,
      type: groups.type,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .leftJoin(user, eq(user.id, groupMembers.userId))
    .where(
      inArray(
        groupMembers.groupId,
        mine.map((m) => m.groupId),
      ),
    )
    .orderBy(asc(groupMembers.displayName), asc(groupMembers.id));
  const notMe = people.filter((o) => o.userId !== userId);

  // Each group's active view, loaded once.
  const views = new Map(
    await Promise.all(
      mine.map(
        async (g) =>
          [g.groupId, suggestions((await loadLedger(g.groupId)).ledger, g.simplifyDebts)] as const,
      ),
    ),
  );

  const friends: FriendSummary[] = [];
  for (const d of mine.filter((m) => m.type === 'direct')) {
    const friend = notMe.find((o) => o.groupId === d.groupId && !o.removedAt);
    if (!friend) continue;
    // The same person in other groups: by account once they have one; a placeholder is only here.
    const spots = friend.userId ? notMe.filter((o) => o.userId === friend.userId) : [friend];
    const perGroup: FriendGroupBalance[] = [];
    const pairs: PairView[] = [];
    for (const spot of spots) {
      const g = mine.find((m) => m.groupId === spot.groupId);
      if (!g) continue;
      const pair = { transfers: views.get(g.groupId) ?? [], me: g.memberId, other: spot.id };
      pairs.push(pair);
      const balances = Object.entries(pairNet(pair.transfers, pair.me, pair.other))
        .map(([currency, net]) => ({ currency, net }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
      if (balances.length > 0 || g.type === 'direct') {
        perGroup.push({
          groupId: g.groupId,
          name: g.type === 'direct' ? null : g.name,
          friendMemberId: spot.id,
          balances,
        });
      }
    }
    perGroup.sort((a, b) =>
      a.name === null ? -1 : b.name === null ? 1 : a.name.localeCompare(b.name),
    );
    friends.push({
      groupId: d.groupId,
      friendMemberId: friend.id,
      name: friend.displayName,
      status: memberStatus(friend.userId, friend.isAnonymous),
      balances: Object.entries(friendBalance(pairs))
        .map(([currency, net]) => ({ currency, net }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      groups: perGroup,
    });
  }

  // Candidates: people from my shared groups who aren't already a friend. Joined people once
  // (by account); placeholders per group, since they can't be told apart yet.
  const friendUsers = new Set(
    friends.map((f) => notMe.find((o) => o.id === f.friendMemberId)?.userId).filter(Boolean),
  );
  const seen = new Set<string>();
  const candidates: FriendCandidate[] = [];
  for (const o of notMe) {
    if (o.type === 'direct' || o.removedAt) continue;
    if (o.userId) {
      if (friendUsers.has(o.userId) || seen.has(o.userId)) continue;
      seen.add(o.userId);
    }
    candidates.push({
      memberId: o.id,
      displayName: o.displayName,
      groupName: o.groupName,
      status: memberStatus(o.userId, o.isAnonymous),
    });
  }
  return { friends, candidates };
}
