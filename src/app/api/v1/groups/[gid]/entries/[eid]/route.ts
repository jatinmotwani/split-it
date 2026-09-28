import { z } from 'zod';
import { upsertEntryBody } from '@/lib/contracts/entries';
import { getDb } from '@/server/db';
import { route } from '@/server/http/route';
import { loadEntry, saveEntry } from '@/server/services/core/entries';
import { deleteEntry } from '@/server/services/core/entry-lifecycle';

const params = z.object({ gid: z.uuid(), eid: z.uuid() });

export const GET = route({
  auth: 'member',
  params,
  handler: async ({ params }) => loadEntry(getDb(), params.gid, params.eid),
});

/** Create or update an expense or settlement. The id is generated on the device. */
export const PUT = route({
  auth: 'member',
  params,
  body: upsertEntryBody,
  idempotent: true,
  handler: async ({ membership, params, body }) => saveEntry(membership, params.eid, body),
});

/** Soft delete. Restore with POST …/restore. */
export const DELETE = route({
  auth: 'member',
  params,
  handler: async ({ membership, params }) => deleteEntry(membership, params.eid),
});
