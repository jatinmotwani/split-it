import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type {
  CreateGroupBody,
  GroupDetail,
  GroupsResponse,
  MemberDto,
  MemberStatus,
  UpdateGroupBody,
} from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { track } from '@/server/analytics/track';
import type { SessionUser } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { entries, groupMembers, groups, user } from '@/server/db/schema';
import { conflict } from '@/server/http/errors';
import { recordActivity } from './activity';
import { requireMember, type Membership } from './authz';
import { balanceList, memberNets } from './nets';

/** 128-bit random, URL-safe (SPEC §11). */
export function newInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

export function memberStatus(userId: string | null, isAnonymous: boolean | null): MemberStatus {
  if (!userId) return 'placeholder';
  return isAnonymous ? 'guest' : 'account';
}

/**
 * Creates a group with the caller as owner. Idempotent on the client-generated id: repeating the
 * call returns the same group; an id someone else already used is a conflict.
 */
export async function createGroup(me: SessionUser, input: CreateGroupBody): Promise<GroupDetail> {
  const db = getDb();
  const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, input.id));
  if (existing) {
    const mine = await requireMember(me.id, input.id).catch(() => null);
    if (!mine) throw conflict('id_taken', 'That group id is already in use.');
    return getGroupDetail(mine, me.id);
  }

  const memberId = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: input.id,
      name: input.name,
      type: input.type,
      defaultCurrency: input.defaultCurrency,
      inviteCode: newInviteCode(),
      createdByUserId: me.id,
    });
    await tx.insert(groupMembers).values({
      id: memberId,
      groupId: input.id,
      userId: me.id,
      displayName: input.displayName ?? (me.name.trim().slice(0, 40) || 'Me'),
      role: 'owner',
      joinedAt: new Date(),
    });
    await recordActivity(tx, { groupId: input.id, actorMemberId: memberId, kind: 'group_created' });
  });
  track('group_created', { groupType: input.type, currency: input.defaultCurrency }, me.id);
  return getGroupDetail(await requireMember(me.id, input.id), me.id);
}

export async function listMembers(groupId: string, myUserId: string): Promise<MemberDto[]> {
  const rows = await getDb()
    .select({
      id: groupMembers.id,
      displayName: groupMembers.displayName,
      role: groupMembers.role,
      userId: groupMembers.userId,
      isAnonymous: user.isAnonymous,
      removedAt: groupMembers.removedAt,
    })
    .from(groupMembers)
    .leftJoin(user, eq(user.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt), asc(groupMembers.id));
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    role: r.role,
    status: memberStatus(r.userId, r.isAnonymous),
    isMe: r.userId === myUserId && r.removedAt === null,
    active: r.removedAt === null,
  }));
}

export async function getGroupDetail(
  { member, group }: Membership,
  myUserId: string,
): Promise<GroupDetail> {
  return {
    id: group.id,
    name: group.name,
    type: group.type,
    defaultCurrency: group.defaultCurrency,
    simplifyDebts: group.simplifyDebts,
    inviteCode: group.inviteCode,
    myMemberId: member.id,
    myRole: member.role,
    members: await listMembers(group.id, myUserId),
  };
}

/** Home: my groups (not 1:1 ones), most recent activity first, with my balance in each. */
export async function listMyGroups(userId: string): Promise<GroupsResponse> {
  const db = getDb();
  const mine = await db
    .select({ group: groups, memberId: groupMembers.id })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        isNull(groupMembers.removedAt),
        ne(groups.type, 'direct'),
      ),
    )
    .orderBy(desc(groups.lastActivityAt), desc(groups.id));
  if (mine.length === 0) return { groups: [], totals: [], lastUsedGroupId: null };

  const groupIds = mine.map((m) => m.group.id);
  const [counts, nets, last] = await Promise.all([
    db
      .select({ groupId: groupMembers.groupId, n: count() })
      .from(groupMembers)
      .where(and(inArray(groupMembers.groupId, groupIds), isNull(groupMembers.removedAt)))
      .groupBy(groupMembers.groupId),
    memberNets(mine.map((m) => m.memberId)),
    db
      .select({ groupId: entries.groupId })
      .from(entries)
      .where(
        and(
          inArray(
            entries.createdByMemberId,
            mine.map((m) => m.memberId),
          ),
          isNull(entries.deletedAt),
        ),
      )
      .orderBy(desc(entries.createdAt))
      .limit(1),
  ]);
  const countOf = new Map(counts.map((c) => [c.groupId, c.n]));

  const totals = new Map<string, number>();
  const list = mine.map(({ group, memberId }) => {
    const balances = balanceList(nets.get(memberId));
    for (const b of balances) totals.set(b.currency, (totals.get(b.currency) ?? 0) + b.net);
    return {
      id: group.id,
      name: group.name,
      type: group.type,
      defaultCurrency: group.defaultCurrency,
      lastActivityAt: group.lastActivityAt.toISOString(),
      memberCount: countOf.get(group.id) ?? 0,
      myMemberId: memberId,
      balances,
    };
  });
  const lastUsedGroupId = last[0]?.groupId ?? list[0]?.id ?? null;
  return { groups: list, totals: balanceList(totals), lastUsedGroupId };
}

export async function updateGroup(
  membership: Membership,
  patch: UpdateGroupBody,
  myUserId: string,
): Promise<GroupDetail> {
  const { group, member } = membership;
  const changed = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => group[k as keyof typeof group] !== v),
  ) as UpdateGroupBody;
  if (Object.keys(changed).length > 0) {
    await getDb().transaction(async (tx) => {
      await tx
        .update(groups)
        .set({ ...changed, updatedAt: new Date() })
        .where(eq(groups.id, group.id));
      await recordActivity(tx, {
        groupId: group.id,
        actorMemberId: member.id,
        kind: 'group_updated',
        data: { changed },
      });
    });
  }
  return getGroupDetail(await requireMember(myUserId, group.id), myUserId);
}
