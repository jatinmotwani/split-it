import 'server-only';
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { ActivityPage } from '@/lib/contracts/activity';
import type { EntriesPage, EntryDto, RevisionDto } from '@/lib/contracts/entries';
import { uuidv7 } from '@/lib/ids';
import { getDb, type Executor } from '@/server/db';
import { activity, entries, entryPayers, entryRevisions, entryShares } from '@/server/db/schema';
import { conflict, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import type { Membership } from './authz';
import { assertStoredLegs, loadEntry, snapshotOf, toDto } from './entries';

type Leg = { memberId: string; amount: number };

/** Live (non-deleted) entries, newest date first, paged by (date, id). */
export async function listEntries(
  groupId: string,
  q: { before?: string; limit: number },
): Promise<EntriesPage> {
  const db = getDb();
  const conds = [eq(entries.groupId, groupId), isNull(entries.deletedAt)];
  if (q.before) {
    const [date, id] = q.before.split('_') as [string, string];
    conds.push(or(lt(entries.date, date), and(eq(entries.date, date), lt(entries.id, id)))!);
  }
  const rows = await db
    .select()
    .from(entries)
    .where(and(...conds))
    .orderBy(desc(entries.date), desc(entries.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const ids = page.map((r) => r.id);
  const legs = new Map<string, { payers: Leg[]; shares: Leg[] }>(
    ids.map((id) => [id, { payers: [], shares: [] }]),
  );
  if (ids.length) {
    const [payers, shares] = await Promise.all([
      db.select().from(entryPayers).where(inArray(entryPayers.entryId, ids)),
      db.select().from(entryShares).where(inArray(entryShares.entryId, ids)),
    ]);
    for (const p of payers)
      legs.get(p.entryId)!.payers.push({ memberId: p.memberId, amount: p.amount });
    for (const s of shares)
      legs.get(s.entryId)!.shares.push({ memberId: s.memberId, amount: s.amount });
  }
  const byId = (a: Leg, b: Leg) => (a.memberId < b.memberId ? -1 : 1);
  const last = page.at(-1);
  return {
    entries: page.map((r) => {
      const l = legs.get(r.id)!;
      return toDto(r, l.payers.sort(byId), l.shares.sort(byId));
    }),
    nextCursor: rows.length > q.limit && last ? `${last.date}_${last.id}` : null,
  };
}

async function lockEntry(tx: Executor, groupId: string, entryId: string) {
  const [row] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.groupId, groupId)))
    .for('update');
  if (!row) throw notFound('Expense not found.');
  const [payers, shares] = await Promise.all([
    tx
      .select({ memberId: entryPayers.memberId, amount: entryPayers.amount })
      .from(entryPayers)
      .where(eq(entryPayers.entryId, entryId)),
    tx
      .select({ memberId: entryShares.memberId, amount: entryShares.amount })
      .from(entryShares)
      .where(eq(entryShares.entryId, entryId)),
  ]);
  return { row, legs: { payers, shares } };
}

/** Soft delete; one tap restores it. Deleting twice is a no-op. */
export async function deleteEntry(
  { member, group }: Membership,
  entryId: string,
): Promise<EntryDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const { row, legs } = await lockEntry(tx, group.id, entryId);
    if (row.deletedAt) return;
    await tx.insert(entryRevisions).values({
      id: uuidv7(),
      entryId,
      version: row.version,
      snapshot: snapshotOf(row, legs),
      reason: 'delete',
      actorMemberId: member.id,
    });
    const now = new Date();
    await tx
      .update(entries)
      .set({
        deletedAt: now,
        deletedByMemberId: member.id,
        version: row.version + 1,
        updatedByMemberId: member.id,
        updatedAt: now,
      })
      .where(eq(entries.id, entryId));
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'entry_deleted',
      entryId,
      data: { description: row.description, amount: row.amount, currency: row.currency },
    });
  });
  return loadEntry(db, group.id, entryId);
}

/**
 * Undelete (no version), or bring back an earlier version's content as a new version.
 * Either way the current state is kept as a revision first.
 */
export async function restoreEntry(
  { member, group }: Membership,
  entryId: string,
  version?: number,
): Promise<EntryDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const { row, legs } = await lockEntry(tx, group.id, entryId);
    const now = new Date();
    if (version === undefined) {
      if (!row.deletedAt) return;
      await tx.insert(entryRevisions).values({
        id: uuidv7(),
        entryId,
        version: row.version,
        snapshot: snapshotOf(row, legs),
        reason: 'restore',
        actorMemberId: member.id,
      });
      await tx
        .update(entries)
        .set({
          deletedAt: null,
          deletedByMemberId: null,
          version: row.version + 1,
          updatedByMemberId: member.id,
          updatedAt: now,
        })
        .where(eq(entries.id, entryId));
      await recordActivity(tx, {
        groupId: group.id,
        actorMemberId: member.id,
        kind: 'entry_restored',
        entryId,
        data: { description: row.description },
      });
      return;
    }

    if (version >= row.version)
      throw conflict('not_an_old_version', 'That is the current version.');
    const [rev] = await tx
      .select()
      .from(entryRevisions)
      .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.version, version)));
    if (!rev) throw notFound('That version doesn’t exist.');
    const snap = rev.snapshot;
    await tx.insert(entryRevisions).values({
      id: uuidv7(),
      entryId,
      version: row.version,
      snapshot: snapshotOf(row, legs),
      reason: 'restore',
      actorMemberId: member.id,
    });
    await tx
      .update(entries)
      .set({
        kind: snap.kind as typeof row.kind,
        description: snap.description,
        category: snap.category,
        amount: snap.amount,
        currency: snap.currency,
        date: snap.date,
        notes: snap.notes,
        splitType: snap.splitType as typeof row.splitType,
        splitInput: snap.splitInput,
        settlementMethod: snap.settlementMethod as typeof row.settlementMethod,
        deletedAt: null,
        deletedByMemberId: null,
        version: row.version + 1,
        updatedByMemberId: member.id,
        updatedAt: now,
      })
      .where(eq(entries.id, entryId));
    await tx.delete(entryPayers).where(eq(entryPayers.entryId, entryId));
    await tx.delete(entryShares).where(eq(entryShares.entryId, entryId));
    if (snap.payers.length)
      await tx.insert(entryPayers).values(snap.payers.map((p) => ({ entryId, ...p })));
    if (snap.shares.length)
      await tx.insert(entryShares).values(snap.shares.map((s) => ({ entryId, ...s })));
    await assertStoredLegs(tx, entryId, snap.amount);
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'entry_updated',
      entryId,
      data: {
        description: snap.description,
        restoredFrom: version,
        from: { amount: row.amount, currency: row.currency },
        to: { amount: snap.amount, currency: snap.currency },
      },
    });
  });
  return loadEntry(db, group.id, entryId);
}

export async function listRevisions(groupId: string, entryId: string): Promise<RevisionDto[]> {
  const db = getDb();
  await loadEntry(db, groupId, entryId); // 404 unless it belongs to this group
  const rows = await db
    .select()
    .from(entryRevisions)
    .where(eq(entryRevisions.entryId, entryId))
    .orderBy(desc(entryRevisions.version));
  return rows.map((r) => ({
    version: r.version,
    reason: r.reason,
    actorMemberId: r.actorMemberId,
    createdAt: r.createdAt.toISOString(),
    snapshot: {
      kind: r.snapshot.kind,
      description: r.snapshot.description,
      category: r.snapshot.category,
      amount: r.snapshot.amount,
      currency: r.snapshot.currency,
      date: r.snapshot.date,
      notes: r.snapshot.notes,
      split: r.snapshot.splitInput,
      settlementMethod: r.snapshot.settlementMethod,
      deleted: r.snapshot.deletedAt !== null,
      payers: r.snapshot.payers,
      shares: r.snapshot.shares,
    },
  }));
}

export async function listActivity(
  groupId: string,
  q: { before?: string; limit: number },
): Promise<ActivityPage> {
  const conds = [eq(activity.groupId, groupId)];
  if (q.before) conds.push(lt(activity.id, q.before));
  const rows = await getDb()
    .select()
    .from(activity)
    .where(and(...conds))
    .orderBy(desc(activity.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((a) => ({
      id: a.id,
      kind: a.kind,
      actorMemberId: a.actorMemberId,
      entryId: a.entryId,
      data: a.data,
      createdAt: a.createdAt.toISOString(),
    })),
    nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
