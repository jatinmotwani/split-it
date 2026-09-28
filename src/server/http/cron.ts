import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/server/env';
import { AppError, unauthorized } from './errors';

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function assertCron(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) throw new AppError(503, 'cron_not_configured', 'CRON_SECRET is not set.');
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw unauthorized('Bad cron secret.');
}
