import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

export type Schema = typeof schema;

/** The app uses node-postgres; tests use PGlite. Services only depend on this shared base. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything a query can run on: the database or an open transaction. */
export type Executor = Db | Tx;
