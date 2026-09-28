import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../test/db';
import { rateLimitBuckets } from './schema';
import type { Db } from './types';

describe('database module', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => close());

  it('applies migrations and round-trips a row', async () => {
    const windowStart = new Date('2026-09-28T10:00:00Z');
    await db.insert(rateLimitBuckets).values({ key: 'join:ip:1.2.3.4', windowStart, count: 1 });
    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, 'join:ip:1.2.3.4'));
    expect(rows).toEqual([{ key: 'join:ip:1.2.3.4', windowStart, count: 1 }]);
  });

  it('runs transactions that roll back on error', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(rateLimitBuckets)
          .values({ key: 'tx-test', windowStart: new Date(), count: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const [row] = await db
      .select({ n: count() })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, 'tx-test'));
    const n = row?.n;
    expect(n).toBe(0);
  });
});
