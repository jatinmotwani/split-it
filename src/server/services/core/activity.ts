import 'server-only';
import { eq } from 'drizzle-orm';
import { uuidv7 } from '@/lib/ids';
import type { Executor } from '@/server/db';
import { activity, groups, type ActivityKind } from '@/server/db/schema';

/** Records an activity row and bumps the group's last-activity time, inside the caller's transaction. */
export async function recordActivity(
  tx: Executor,
  a: {
    groupId: string;
    actorMemberId: string | null;
    kind: ActivityKind;
    entryId?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const now = new Date();
  await tx.insert(activity).values({
    id: uuidv7(now.getTime()),
    groupId: a.groupId,
    actorMemberId: a.actorMemberId,
    kind: a.kind,
    entryId: a.entryId ?? null,
    data: a.data ?? {},
    createdAt: now,
  });
  await tx.update(groups).set({ lastActivityAt: now }).where(eq(groups.id, a.groupId));
}
