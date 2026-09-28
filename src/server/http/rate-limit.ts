import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { rateLimitBuckets } from '@/server/db/schema';
import { tooManyRequests } from './errors';

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Fixed-window counter in Postgres. Limits are set far above human use (SPEC Phase 5: abuse-only).
 * Throws 429 once `limit` is exceeded within the window.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await getDb()
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  if ((row?.count ?? 0) > limit) throw tooManyRequests();
}

export const LIMITS = {
  invitePreviewPerIp: { limit: 60, window: 60 },
  joinPerIp: { limit: 10, window: 60 },
  joinPerCode: { limit: 30, window: 60 * 60 },
  claimPerIp: { limit: 10, window: 60 },
} as const;
