import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { InvitePreview, JoinBody, JoinResponse } from '@/lib/contracts/invites';
import { uuidv7 } from '@/lib/ids';
import { track } from '@/server/analytics/track';
import type { SessionUser } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { groupMembers, groups } from '@/server/db/schema';
import { AppError, conflict, forbidden, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import type { Membership } from './authz';
import { newInviteCode } from './groups';

async function groupByCode(code: string) {
  const [g] = await getDb().select().from(groups).where(eq(groups.inviteCode, code));
  // 1:1 groups have no invite: the friend gets a claim link instead.
  if (!g || g.type === 'direct')
    throw notFound('This invite link doesn’t work any more. Ask for a new one.');
  if (g.inviteExpiresAt && g.inviteExpiresAt < new Date()) {
    throw new AppError(410, 'invite_expired', 'This invite link has expired. Ask for a new one.');
  }
  return g;
}

async function activeSpot(groupId: string, userId: string) {
  const [m] = await getDb()
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        isNull(groupMembers.removedAt),
      ),
    );
  return m ?? null;
}

/** What the join page shows: group name and who's in it (names only). */
export async function previewInvite(code: string, me: SessionUser | null): Promise<InvitePreview> {
  const g = await groupByCode(code);
  const members = await getDb()
    .select({
      id: groupMembers.id,
      displayName: groupMembers.displayName,
      userId: groupMembers.userId,
    })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, g.id), isNull(groupMembers.removedAt)))
    .orderBy(asc(groupMembers.createdAt), asc(groupMembers.id));
  return {
    groupId: g.id,
    name: g.name,
    type: g.type,
    members: members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      joined: m.userId !== null,
    })),
    alreadyMember: me ? members.some((m) => m.userId === me.id) : false,
  };
}

/**
 * Join through an invite: as a new member with a name, or by picking an unclaimed placeholder
 * ("I'm Ravi"). Joining a group you're already in is a no-op.
 */
export async function joinViaInvite(
  code: string,
  me: SessionUser,
  body: JoinBody,
): Promise<JoinResponse> {
  const g = await groupByCode(code);
  const existing = await activeSpot(g.id, me.id);
  if (existing) return { groupId: g.id, memberId: existing.id };

  const db = getDb();
  let memberId: string;
  if ('claimMemberId' in body) {
    memberId = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(groupMembers)
        .set({
          userId: me.id,
          joinedAt: new Date(),
          claimTokenHash: null,
          claimTokenExpiresAt: null,
        })
        .where(
          and(
            eq(groupMembers.id, body.claimMemberId),
            eq(groupMembers.groupId, g.id),
            isNull(groupMembers.userId),
            isNull(groupMembers.removedAt),
          ),
        )
        .returning({ id: groupMembers.id, displayName: groupMembers.displayName });
      if (!claimed) throw conflict('already_claimed', 'Someone has already joined as that person.');
      await recordActivity(tx, {
        groupId: g.id,
        actorMemberId: claimed.id,
        kind: 'member_claimed',
        data: { name: claimed.displayName },
      });
      return claimed.id;
    });
  } else {
    memberId = uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(groupMembers).values({
        id: memberId,
        groupId: g.id,
        userId: me.id,
        displayName: body.displayName,
        role: 'member',
        joinedAt: new Date(),
      });
      await recordActivity(tx, {
        groupId: g.id,
        actorMemberId: memberId,
        kind: 'member_joined',
        data: { name: body.displayName },
      });
    });
  }
  track('member_joined', { asGuest: me.isAnonymous, via: 'invite' }, me.id);
  return { groupId: g.id, memberId };
}

/** Owner only: the old link stops working immediately. */
export async function rotateInvite({ member, group }: Membership): Promise<{ inviteCode: string }> {
  if (member.role !== 'owner') throw forbidden('Only the group owner can reset the invite link.');
  const inviteCode = newInviteCode();
  await getDb().transaction(async (tx) => {
    await tx
      .update(groups)
      .set({ inviteCode, updatedAt: new Date() })
      .where(eq(groups.id, group.id));
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'invite_rotated',
    });
  });
  return { inviteCode };
}
