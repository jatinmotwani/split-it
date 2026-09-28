import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '@/lib/ids';
import { createTestDb } from '../../../test/db';
import { makeGroup, makeMember, makeUser } from '../../../test/factories';
import { entries, entryShares, groupMembers } from './schema';
import type { Db } from './types';

describe('Phase 1 schema constraints', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => close());

  async function expense(overrides: Partial<typeof entries.$inferInsert> = {}) {
    const u = await makeUser(db);
    const { group, owner } = await makeGroup(db, { ownerUserId: u.id });
    return db.insert(entries).values({
      id: uuidv7(),
      groupId: group.id,
      kind: 'expense',
      description: 'Dinner',
      amount: 1000,
      currency: 'INR',
      date: '2026-09-28',
      splitType: 'equal',
      splitInput: { type: 'equal', participants: [owner.id] },
      createdByMemberId: owner.id,
      ...overrides,
    });
  }

  it('accepts a valid expense', async () => {
    await expect(expense()).resolves.toBeDefined();
  });

  it('rejects a negative amount, a bad currency and a settlement method on an expense', async () => {
    await expect(expense({ amount: -1 })).rejects.toThrow();
    await expect(expense({ currency: 'inr' })).rejects.toThrow();
    await expect(expense({ settlementMethod: 'upi' })).rejects.toThrow();
    await expect(expense({ kind: 'settlement', settlementMethod: 'upi' })).resolves.toBeDefined();
  });

  it('rejects negative legs', async () => {
    const u = await makeUser(db);
    const { group, owner } = await makeGroup(db, { ownerUserId: u.id });
    const id = uuidv7();
    await db.insert(entries).values({
      id,
      groupId: group.id,
      kind: 'expense',
      description: 'Chai',
      amount: 0,
      currency: 'INR',
      date: '2026-09-28',
      splitType: 'exact',
      splitInput: { type: 'exact', amounts: {} },
      createdByMemberId: owner.id,
    });
    await expect(
      db.insert(entryShares).values({ entryId: id, memberId: owner.id, amount: -5 }),
    ).rejects.toThrow();
  });

  it('allows one active spot per user per group, many placeholders, and rejoining after removal', async () => {
    const u = await makeUser(db);
    const { group, owner } = await makeGroup(db, { ownerUserId: u.id });
    await expect(makeMember(db, group.id, { userId: u.id })).rejects.toThrow();
    await makeMember(db, group.id, { displayName: 'Ravi' });
    await makeMember(db, group.id, { displayName: 'Neel' });
    await db
      .update(groupMembers)
      .set({ removedAt: new Date() })
      .where(eq(groupMembers.id, owner.id));
    await expect(makeMember(db, group.id, { userId: u.id })).resolves.toBeDefined();
  });
});
