import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { groupMembers, groups } from '@/server/db/schema';
import { recordActivity } from '@/server/services/core/activity';

/**
 * Runs when a guest signs in with Google or an email code, before Better Auth deletes the
 * anonymous user (ARCHITECTURE §8). Every group spot moves to the real account. If that account
 * already has a spot in the same group, the guest's spot becomes a placeholder instead.
 */
export async function onGuestLinked(anonymousUserId: string, newUserId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const spots = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, anonymousUserId), isNull(groupMembers.removedAt)));
    for (const spot of spots) {
      const [clash] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, spot.groupId),
            eq(groupMembers.userId, newUserId),
            isNull(groupMembers.removedAt),
          ),
        );
      if (clash) {
        await tx
          .update(groupMembers)
          .set({
            userId: null,
            joinedAt: null,
            displayName: `${spot.displayName} (guest)`.slice(0, 40),
          })
          .where(eq(groupMembers.id, spot.id));
        await recordActivity(tx, {
          groupId: spot.groupId,
          actorMemberId: clash.id,
          kind: 'member_unlinked',
          data: { reason: 'account_link_collision' },
        });
      } else {
        await tx
          .update(groupMembers)
          .set({ userId: newUserId })
          .where(eq(groupMembers.id, spot.id));
      }
    }
    await tx
      .update(groups)
      .set({ createdByUserId: newUserId })
      .where(eq(groups.createdByUserId, anonymousUserId));
  });
}
