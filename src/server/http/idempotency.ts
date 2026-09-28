import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { idempotencyKeys } from '@/server/db/schema';
import { AppError, conflict, unprocessable } from './errors';

const ABANDONED_AFTER_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestHash(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method} ${path}\n${body}`).digest('hex');
}

export type Stored = { status: number; body: unknown };

/**
 * Runs `fn` at most once per (user, key). A replay with the same request gets the stored
 * response; the same key with a different request is rejected; a concurrent duplicate gets 409.
 * Only successful responses are stored, so a failed request can be retried with the same key.
 */
export async function withIdempotency(
  userId: string,
  key: string,
  hash: string,
  fn: () => Promise<Stored>,
): Promise<Stored & { replayed: boolean }> {
  if (!UUID.test(key))
    throw new AppError(400, 'bad_idempotency_key', 'Idempotency-Key must be a UUID.');
  const db = getDb();
  const where = and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key));

  const [existing] = await db.select().from(idempotencyKeys).where(where);
  if (existing) {
    if (existing.requestHash !== hash) {
      throw unprocessable(
        'idempotency_mismatch',
        'This Idempotency-Key was used for a different request.',
      );
    }
    if (existing.statusCode !== null) {
      return { status: existing.statusCode, body: existing.response, replayed: true };
    }
    if (Date.now() - existing.createdAt.getTime() < ABANDONED_AFTER_MS) {
      throw conflict(
        'request_in_progress',
        'The same request is still being processed. Retry shortly.',
      );
    }
    await db.delete(idempotencyKeys).where(where);
  }

  const inserted = await db
    .insert(idempotencyKeys)
    .values({ userId, key, requestHash: hash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (inserted.length === 0) {
    throw conflict(
      'request_in_progress',
      'The same request is still being processed. Retry shortly.',
    );
  }

  try {
    const result = await fn();
    if (result.status >= 200 && result.status < 300) {
      await db
        .update(idempotencyKeys)
        .set({ statusCode: result.status, response: result.body ?? null })
        .where(where);
    } else {
      await db.delete(idempotencyKeys).where(where);
    }
    return { ...result, replayed: false };
  } catch (err) {
    await db.delete(idempotencyKeys).where(where);
    throw err;
  }
}
