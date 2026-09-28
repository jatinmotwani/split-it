import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { EntryDto, SaveEntryResponse, UpsertEntryBody } from '@/lib/contracts/entries';
import { uuidv7 } from '@/lib/ids';
import { MoneyError } from '@/lib/money/currency';
import {
  computeShares,
  nonZero,
  validatePayers,
  type Leg,
  type SplitInput,
} from '@/lib/money/splits';
import { track } from '@/server/analytics/track';
import { getDb, type Executor } from '@/server/db';
import {
  entries,
  entryPayers,
  entryRevisions,
  entryShares,
  groupMembers,
  type EntrySnapshot,
} from '@/server/db/schema';
import { AppError, badRequest, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import type { Membership } from './authz';

type EntryRow = typeof entries.$inferSelect;

function invalidSplit(e: MoneyError): AppError {
  return new AppError(400, e.code, e.message, e.details);
}

export function toDto(row: EntryRow, payers: Leg[], shares: Leg[]): EntryDto {
  return {
    id: row.id,
    groupId: row.groupId,
    kind: row.kind,
    description: row.description,
    category: row.category,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    notes: row.notes,
    split: row.splitInput,
    payers,
    shares,
    settlementMethod: row.settlementMethod,
    version: row.version,
    createdByMemberId: row.createdByMemberId,
    updatedByMemberId: row.updatedByMemberId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function legsOf(db: Executor, entryId: string): Promise<{ payers: Leg[]; shares: Leg[] }> {
  const [payers, shares] = await Promise.all([
    db
      .select({ memberId: entryPayers.memberId, amount: entryPayers.amount })
      .from(entryPayers)
      .where(eq(entryPayers.entryId, entryId)),
    db
      .select({ memberId: entryShares.memberId, amount: entryShares.amount })
      .from(entryShares)
      .where(eq(entryShares.entryId, entryId)),
  ]);
  const byId = (a: Leg, b: Leg) => (a.memberId < b.memberId ? -1 : 1);
  return { payers: payers.sort(byId), shares: shares.sort(byId) };
}

export async function loadEntry(db: Executor, groupId: string, entryId: string): Promise<EntryDto> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.groupId, groupId)));
  if (!row) throw notFound('Expense not found.');
  const { payers, shares } = await legsOf(db, entryId);
  return toDto(row, payers, shares);
}

export function snapshotOf(row: EntryRow, legs: { payers: Leg[]; shares: Leg[] }): EntrySnapshot {
  return {
    kind: row.kind,
    description: row.description,
    category: row.category,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    notes: row.notes,
    splitType: row.splitType,
    splitInput: row.splitInput,
    settlementMethod: row.settlementMethod,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    payers: legs.payers,
    shares: legs.shares,
  };
}

/** Everything that defines an entry's content, in a stable shape for change detection. */
function contentKey(v: {
  kind: string;
  description: string;
  category: string | null;
  amount: number;
  currency: string;
  date: string;
  notes: string | null;
  splitInput: SplitInput;
  settlementMethod: string | null;
  payers: Leg[];
}): string {
  return JSON.stringify([
    v.kind,
    v.description,
    v.category,
    v.amount,
    v.currency,
    v.date,
    v.notes,
    v.splitInput,
    v.settlementMethod,
    v.payers,
  ]);
}

/** SPEC §5.1: re-check the invariant from the stored rows inside the write transaction. */
export async function assertStoredLegs(tx: Executor, entryId: string, amount: number) {
  const [row] = await tx
    .select({
      paid: sql<string>`(select coalesce(sum(amount), 0) from ${entryPayers} where ${entryPayers.entryId} = ${entryId})`,
      owed: sql<string>`(select coalesce(sum(amount), 0) from ${entryShares} where ${entryShares.entryId} = ${entryId})`,
    })
    .from(sql`(select 1) as one`);
  if (Number(row!.paid) !== amount || Number(row!.owed) !== amount) {
    throw new Error(
      `ledger invariant broken for entry ${entryId}: paid=${row!.paid} owed=${row!.owed} amount=${amount}`,
    );
  }
}

function membersIn(input: UpsertEntryBody): string[] {
  const ids = new Set<string>(input.payers.map((p) => p.memberId));
  const s = input.split;
  if (s.type === 'equal' || s.type === 'adjustment') s.participants.forEach((m) => ids.add(m));
  if (s.type === 'adjustment') Object.keys(s.adjustments).forEach((m) => ids.add(m));
  if (s.type === 'exact') Object.keys(s.amounts).forEach((m) => ids.add(m));
  if (s.type === 'percentage') Object.keys(s.bps).forEach((m) => ids.add(m));
  if (s.type === 'shares') Object.keys(s.weights).forEach((m) => ids.add(m));
  if (s.type === 'itemized')
    s.items.forEach((i) => i.assignees.forEach((a) => ids.add(a.memberId)));
  return [...ids];
}

/**
 * Create or update an expense or settlement (ARCHITECTURE §7.3). Last write wins per entry; the
 * replaced version is always kept in entry_revisions.
 */
export async function saveEntry(
  { member, group }: Membership,
  entryId: string,
  input: UpsertEntryBody,
): Promise<SaveEntryResponse> {
  const db = getDb();

  let payers: Leg[];
  let shares: Leg[];
  try {
    payers = validatePayers(input.amount, input.payers);
    shares = nonZero(computeShares(input.amount, input.split, entryId));
  } catch (e) {
    if (e instanceof MoneyError) throw invalidSplit(e);
    throw e;
  }

  if (input.kind === 'settlement') {
    const receivers = shares.map((s) => s.memberId);
    if (payers.length !== 1 || receivers.length !== 1) {
      throw badRequest('A settlement is one person paying one other person.');
    }
    if (payers[0]!.memberId === receivers[0]) throw badRequest('Someone can’t pay themselves.');
    if (!input.settlementMethod)
      throw badRequest('Choose how it was paid: cash, UPI, bank or other.');
  }

  const involved = membersIn(input);
  const known = await db
    .select({ id: groupMembers.id, removedAt: groupMembers.removedAt })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), inArray(groupMembers.id, involved)));
  if (known.length !== involved.length)
    throw badRequest('Everyone in an expense must be in this group.');

  const fields = {
    kind: input.kind,
    description: input.description,
    category: input.category ?? null,
    amount: input.amount,
    currency: input.currency,
    date: input.date,
    notes: input.notes ?? null,
    splitType: input.split.type,
    splitInput: input.split as SplitInput,
    settlementMethod: input.kind === 'settlement' ? (input.settlementMethod ?? null) : null,
  };

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(entries).where(eq(entries.id, entryId)).for('update');
    if (current && current.groupId !== group.id) throw notFound('Expense not found.');

    const removed = known.filter((k) => k.removedAt);
    if (removed.length > 0) {
      const before = current ? await legsOf(tx, entryId) : { payers: [], shares: [] };
      const allowed = new Set([...before.payers, ...before.shares].map((l) => l.memberId));
      if (removed.some((r) => !allowed.has(r.id)))
        throw badRequest('Someone in this expense has left the group.');
    }

    const now = new Date();
    if (!current) {
      const [row] = await tx
        .insert(entries)
        .values({
          id: entryId,
          groupId: group.id,
          ...fields,
          createdByMemberId: member.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(entryPayers).values(payers.map((p) => ({ entryId, ...p })));
      await tx.insert(entryShares).values(shares.map((s) => ({ entryId, ...s })));
      await assertStoredLegs(tx, entryId, input.amount);
      await recordActivity(tx, {
        groupId: group.id,
        actorMemberId: member.id,
        kind: input.kind === 'settlement' ? 'settlement_recorded' : 'entry_created',
        entryId,
        data: { description: input.description, amount: input.amount, currency: input.currency },
      });
      return { row: row!, conflict: false, unchanged: false, created: true };
    }

    const before = await legsOf(tx, entryId);
    if (contentKey({ ...current, payers: before.payers }) === contentKey({ ...fields, payers })) {
      return { row: current, conflict: false, unchanged: true, created: false };
    }
    const conflict = input.baseVersion != null && input.baseVersion < current.version;
    await tx.insert(entryRevisions).values({
      id: uuidv7(),
      entryId,
      version: current.version,
      snapshot: snapshotOf(current, before),
      reason: conflict ? 'conflict' : 'edit',
      actorMemberId: member.id,
    });
    const [row] = await tx
      .update(entries)
      .set({
        ...fields,
        version: current.version + 1,
        updatedByMemberId: member.id,
        updatedAt: now,
      })
      .where(eq(entries.id, entryId))
      .returning();
    await tx.delete(entryPayers).where(eq(entryPayers.entryId, entryId));
    await tx.delete(entryShares).where(eq(entryShares.entryId, entryId));
    await tx.insert(entryPayers).values(payers.map((p) => ({ entryId, ...p })));
    await tx.insert(entryShares).values(shares.map((s) => ({ entryId, ...s })));
    await assertStoredLegs(tx, entryId, input.amount);
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'entry_updated',
      entryId,
      data: {
        description: input.description,
        from: {
          amount: current.amount,
          currency: current.currency,
          description: current.description,
        },
        to: { amount: input.amount, currency: input.currency },
        conflict,
      },
    });
    return { row: row!, conflict, unchanged: false, created: false };
  });

  if (result.created && member.userId) {
    if (input.kind === 'settlement') {
      track('settlement_recorded', { method: input.settlementMethod! }, member.userId);
    } else {
      track(
        'expense_added',
        {
          splitType: input.split.type,
          payerCount: payers.length,
          shareCount: shares.length,
          currency: input.currency,
          isGroupCurrency: input.currency === group.defaultCurrency,
        },
        member.userId,
      );
    }
  }
  const legs = result.unchanged ? await legsOf(db, entryId) : { payers, shares };
  return {
    entry: toDto(result.row, legs.payers, legs.shares),
    conflict: result.conflict,
    unchanged: result.unchanged,
  };
}
