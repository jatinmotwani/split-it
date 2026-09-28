import 'server-only';
import { lt } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { idempotencyKeys, rateLimitBuckets, verification } from '@/server/db/schema';

const DAY = 24 * 60 * 60 * 1000;

/** Daily housekeeping. Safe to run any number of times. */
export async function runCleanup(now = new Date()) {
  const db = getDb();
  const idem = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - 7 * DAY)))
    .returning({ k: idempotencyKeys.key });
  const buckets = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 2 * DAY)))
    .returning({ k: rateLimitBuckets.key });
  const codes = await db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id });
  return {
    idempotencyKeys: idem.length,
    rateLimitBuckets: buckets.length,
    expiredCodes: codes.length,
  };
}
