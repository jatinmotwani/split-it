import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, type Executor } from '@/server/db';
import { groupMembers, groups } from '@/server/db/schema';
import { notFound } from '@/server/http/errors';

export type MemberRow = typeof groupMembers.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type Membership = { member: MemberRow; group: GroupRow };

/**
 * The caller's active spot in a group, or 404. Non-members get "not found" rather than
 * "forbidden" so group ids can't be probed (ARCHITECTURE §7.1).
 */
export async function requireMember(
  userId: string,
  groupId: string,
  db: Executor = getDb(),
): Promise<Membership> {
  const [row] = await db
    .select({ member: groupMembers, group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        isNull(groupMembers.removedAt),
      ),
    );
  if (!row) throw notFound('Group not found.');
  return row;
}
