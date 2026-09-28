import 'server-only';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import type { Db } from './types';

export type { Db, Executor, Tx } from './types';
export { schema };

let db: Db | null = null;
let override: Db | null = null;

/** The app's database. One pool per server instance, attached for Vercel Fluid compute. */
export function getDb(): Db {
  if (override) return override;
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set. See .env.example.');
    const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
    attachDatabasePool(pool);
    db = drizzle({ client: pool, schema, casing: 'snake_case' }) as unknown as Db;
  }
  return db;
}

/** Tests swap in a PGlite database. Pass null to restore. */
export function setDbForTesting(testDb: Db | null) {
  override = testDb;
}
