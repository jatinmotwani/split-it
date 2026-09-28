import { uuidv7 } from '@/lib/ids';
import type { Db } from '@/server/db';
import { groupMembers, groups, user } from '@/server/db/schema';

let n = 0;

export async function makeUser(db: Db, opts: { name?: string; anonymous?: boolean } = {}) {
  n++;
  const id = `test-user-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: opts.name ?? `User ${n}`,
      email: opts.anonymous ? `${id}@guest.split-it.invalid` : `${id}@example.in`,
      isAnonymous: !!opts.anonymous,
    })
    .returning();
  return row!;
}

export async function makeGroup(
  db: Db,
  opts: {
    ownerUserId?: string;
    ownerName?: string;
    name?: string;
    currency?: string;
    simplifyDebts?: boolean;
  } = {},
) {
  const id = uuidv7();
  const [group] = await db
    .insert(groups)
    .values({
      id,
      name: opts.name ?? 'Goa trip',
      type: 'trip',
      defaultCurrency: opts.currency ?? 'INR',
      simplifyDebts: opts.simplifyDebts ?? true,
      inviteCode: `inv-${id}`,
      createdByUserId: opts.ownerUserId ?? null,
    })
    .returning();
  const owner = await makeMember(db, id, {
    userId: opts.ownerUserId ?? null,
    displayName: opts.ownerName ?? 'Owner',
    role: 'owner',
  });
  return { group: group!, owner };
}

export async function makeMember(
  db: Db,
  groupId: string,
  opts: { userId?: string | null; displayName?: string; role?: 'owner' | 'member' } = {},
) {
  const [row] = await db
    .insert(groupMembers)
    .values({
      id: uuidv7(),
      groupId,
      userId: opts.userId ?? null,
      displayName: opts.displayName ?? 'Member',
      role: opts.role ?? 'member',
      joinedAt: opts.userId ? new Date() : null,
    })
    .returning();
  return row!;
}
