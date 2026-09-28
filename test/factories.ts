import { uuidv7 } from '@/lib/ids';
import type { Db } from '@/server/db';
import { entries, entryPayers, entryShares, groupMembers, groups, user } from '@/server/db/schema';

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

/** Inserts an entry with explicit legs (bypasses the service; for setting up balances). */
export async function addEntry(
  db: Db,
  opts: {
    groupId: string;
    createdBy: string;
    payers: { memberId: string; amount: number }[];
    shares: { memberId: string; amount: number }[];
    currency?: string;
    kind?: 'expense' | 'settlement' | 'opening_balance';
    description?: string;
    date?: string;
  },
) {
  const id = uuidv7();
  const amount = opts.payers.reduce((s, p) => s + p.amount, 0);
  await db.insert(entries).values({
    id,
    groupId: opts.groupId,
    kind: opts.kind ?? 'expense',
    description: opts.description ?? 'Expense',
    amount,
    currency: opts.currency ?? 'INR',
    date: opts.date ?? '2026-09-28',
    splitType: 'exact',
    splitInput: {
      type: 'exact',
      amounts: Object.fromEntries(opts.shares.map((s) => [s.memberId, s.amount])),
    },
    settlementMethod: opts.kind === 'settlement' ? 'upi' : null,
    createdByMemberId: opts.createdBy,
  });
  if (opts.payers.length)
    await db.insert(entryPayers).values(opts.payers.map((p) => ({ entryId: id, ...p })));
  if (opts.shares.length)
    await db.insert(entryShares).values(opts.shares.map((s) => ({ entryId: id, ...s })));
  return id;
}
