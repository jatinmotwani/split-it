import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, tstz } from './columns';

/** Stored responses, so a retried write never applies twice (ARCHITECTURE §7.3). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: text('user_id').notNull(),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: smallint('status_code'), // null while in flight
    response: jsonb('response'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index('idempotency_created_idx').on(t.createdAt),
  ],
);

/** Fixed-window counters for abuse-only rate limits (ARCHITECTURE §8). */
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    key: text('key').notNull(),
    windowStart: tstz('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
