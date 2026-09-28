import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/db';
import { jsonRequest } from '../../../test/helpers';
import { GET } from '../../app/api/cron/cleanup/route';
import type { Db } from '../db';
import { idempotencyKeys, rateLimitBuckets } from '../db/schema';
import { resetEnvCache } from '../env';

describe('cleanup cron', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    resetEnvCache();
    ({ db, close } = await useTestDb());
  });
  afterAll(async () => {
    delete process.env.CRON_SECRET;
    resetEnvCache();
    await close();
  });

  it('rejects calls without the cron secret', async () => {
    expect((await GET(jsonRequest('/api/cron/cleanup'))).status).toBe(401);
    const wrong = await GET(
      jsonRequest('/api/cron/cleanup', { headers: { authorization: 'Bearer nope' } }),
    );
    expect(wrong.status).toBe(401);
  });

  it('deletes only stale rows', async () => {
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    await db.insert(idempotencyKeys).values([
      { userId: 'u', key: crypto.randomUUID(), requestHash: 'h', createdAt: old },
      { userId: 'u', key: crypto.randomUUID(), requestHash: 'h' },
    ]);
    await db.insert(rateLimitBuckets).values([
      { key: 'a', windowStart: old, count: 1 },
      { key: 'b', windowStart: new Date(), count: 1 },
    ]);
    const res = await GET(
      jsonRequest('/api/cron/cleanup', { headers: { authorization: 'Bearer cron-test-secret' } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ idempotencyKeys: 1, rateLimitBuckets: 1 });
    expect(await db.select().from(idempotencyKeys)).toHaveLength(1);
    expect(await db.select().from(rateLimitBuckets)).toHaveLength(1);
  });
});
