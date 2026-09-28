import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { ClaimLinkResponse, ClaimPreview, ClaimResponse } from '@/lib/contracts/members';
import type { MemberDto } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { track } from '@/server/analytics/track';
import type { SessionUser } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { groupMembers, groups, user } from '@/server/db/schema';
import { AppError, conflict, forbidden, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import type { Membership } from './authz';
import { memberStatus } from './groups';
import { balanceList, memberNets } from './nets';

const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function spotInGroup(groupId: string, memberId: string) {
  const [row] = await getDb()
    .select({ member: groupMembers, isAnonymous: user.isAnonymous })
    .from(groupMembers)
    .leftJoin(user, eq(user.id, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.id, memberId),
        eq(groupMembers.groupId, groupId),
        isNull(groupMembers.removedAt),
      ),
    );
  if (!row) throw notFound('That person isn’t in this group.');
  return row;
}

/** "Add Ravi" before Ravi has joined: a placeholder spot anyone can split with. */
export async function addPlaceholder(
  { member, group }: Membership,
  displayName: string,
): Promise<MemberDto> {
  const id = uuidv7();
  await getDb().transaction(async (tx) => {
    await tx
      .insert(groupMembers)
      .values({ id, groupId: group.id, userId: null, displayName, role: 'member' });
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'member_added',
      data: { name: displayName },
    });
  });
  return { id, displayName, role: 'member', status: 'placeholder', isMe: false, active: true };
}

/**
 * A fresh single-use claim link for a placeholder, or for a guest's spot so they can get back in
 * on a new device (D3). Spots linked to a real account can't be re-claimed. Each new link
 * replaces the previous one.
 */
export async function mintClaimLink(
  { group }: Membership,
  targetId: string,
): Promise<ClaimLinkResponse> {
  const { member: target, isAnonymous } = await spotInGroup(group.id, targetId);
  if (memberStatus(target.userId, isAnonymous) === 'account') {
    throw conflict(
      'claim_not_allowed',
      'This person has an account. They can sign in on any device.',
    );
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
  await getDb()
    .update(groupMembers)
    .set({ claimTokenHash: hashToken(token), claimTokenExpiresAt: expiresAt })
    .where(eq(groupMembers.id, target.id));
  return { token, path: `/c/${token}`, expiresAt: expiresAt.toISOString() };
}

async function spotByToken(token: string) {
  const [row] = await getDb()
    .select({ member: groupMembers, groupName: groups.name, isAnonymous: user.isAnonymous })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .leftJoin(user, eq(user.id, groupMembers.userId))
    .where(and(eq(groupMembers.claimTokenHash, hashToken(token)), isNull(groupMembers.removedAt)));
  if (!row) throw notFound('This claim link has already been used or replaced. Ask for a new one.');
  if (row.member.claimTokenExpiresAt && row.member.claimTokenExpiresAt < new Date()) {
    throw new AppError(410, 'claim_expired', 'This claim link has expired. Ask for a new one.');
  }
  return row;
}

async function isActiveMember(groupId: string, userId: string) {
  const [m] = await getDb()
    .select({ id: groupMembers.id })
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

export async function previewClaim(token: string, me: SessionUser | null): Promise<ClaimPreview> {
  const { member, groupName } = await spotByToken(token);
  return {
    groupId: member.groupId,
    groupName,
    displayName: member.displayName,
    reclaim: member.userId !== null,
    alreadyMember: me ? !!(await isActiveMember(member.groupId, me.id)) : false,
  };
}

/** Binds the caller to the spot. Single use: the token is cleared. */
export async function claimSpot(token: string, me: SessionUser): Promise<ClaimResponse> {
  const { member } = await spotByToken(token);
  const mine = await isActiveMember(member.groupId, me.id);
  if (mine && mine.id !== member.id) {
    throw conflict('already_member', 'You’re already in this group under another name.');
  }
  const reclaim = member.userId !== null && member.userId !== me.id;
  await getDb().transaction(async (tx) => {
    const [done] = await tx
      .update(groupMembers)
      .set({ userId: me.id, joinedAt: new Date(), claimTokenHash: null, claimTokenExpiresAt: null })
      .where(and(eq(groupMembers.id, member.id), eq(groupMembers.claimTokenHash, hashToken(token))))
      .returning({ id: groupMembers.id });
    if (!done) throw notFound('This claim link has already been used. Ask for a new one.');
    await recordActivity(tx, {
      groupId: member.groupId,
      actorMemberId: member.id,
      kind: reclaim ? 'member_reclaimed' : 'member_claimed',
      data: { name: member.displayName },
    });
  });
  track('member_joined', { asGuest: me.isAnonymous, via: 'claim' }, me.id);
  return { groupId: member.groupId, memberId: member.id };
}

/**
 * Owner removes someone, or anyone leaves. Only at zero balance in every currency (SPEC §5.5).
 * An owner who leaves hands ownership to the longest-standing member who has joined.
 */
export async function removeMember(
  { member, group }: Membership,
  targetId: string,
): Promise<{ ok: true }> {
  const leaving = targetId === member.id;
  if (!leaving && member.role !== 'owner')
    throw forbidden('Only the group owner can remove people.');
  const { member: target } = await spotInGroup(group.id, targetId);

  const balances = balanceList((await memberNets([target.id])).get(target.id));
  if (balances.length > 0) {
    throw conflict(
      'member_has_balance',
      leaving
        ? 'Settle up before leaving the group.'
        : `Settle ${target.displayName}’s balance before removing them.`,
      { balances },
    );
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(groupMembers)
      .set({ removedAt: new Date(), claimTokenHash: null, claimTokenExpiresAt: null })
      .where(eq(groupMembers.id, target.id));
    if (target.role === 'owner') {
      const [heir] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, group.id),
            isNull(groupMembers.removedAt),
            isNotNull(groupMembers.userId),
            ne(groupMembers.id, target.id),
          ),
        )
        .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.id))
        .limit(1);
      if (heir)
        await tx.update(groupMembers).set({ role: 'owner' }).where(eq(groupMembers.id, heir.id));
    }
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: leaving ? 'member_left' : 'member_removed',
      data: { name: target.displayName },
    });
  });
  return { ok: true };
}

/** Owner fixes a wrong claim: the spot becomes a placeholder again, keeping its history. */
export async function unlinkMember(
  { member, group }: Membership,
  targetId: string,
): Promise<MemberDto> {
  if (member.role !== 'owner') throw forbidden('Only the group owner can do that.');
  if (targetId === member.id) throw conflict('cannot_unlink_self', 'You can’t unlink yourself.');
  const { member: target } = await spotInGroup(group.id, targetId);
  await getDb().transaction(async (tx) => {
    await tx
      .update(groupMembers)
      .set({ userId: null, joinedAt: null })
      .where(eq(groupMembers.id, target.id));
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'member_unlinked',
      data: { name: target.displayName },
    });
  });
  return {
    id: target.id,
    displayName: target.displayName,
    role: target.role,
    status: 'placeholder',
    isMe: false,
    active: true,
  };
}
