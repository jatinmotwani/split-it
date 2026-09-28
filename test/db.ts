import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { schema, setDbForTesting, type Db } from '@/server/db';

/** A fresh in-process Postgres with every migration applied. */
export async function createTestDb(): Promise<{
  db: Db;
  client: PGlite;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: 'snake_case' }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: './drizzle' });
  return { db, client, close: () => client.close() };
}

/** createTestDb() and make it the app's database for the duration of the test file. */
export async function useTestDb(): Promise<{ db: Db; client: PGlite; close: () => Promise<void> }> {
  const t = await createTestDb();
  setDbForTesting(t.db);
  return {
    ...t,
    close: async () => {
      setDbForTesting(null);
      await t.close();
    },
  };
}
