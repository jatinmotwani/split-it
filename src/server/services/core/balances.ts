import 'server-only';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  BalancesResponse,
  EntryDefaults,
  ExplainNetResponse,
  ExplainPairResponse,
} from '@/lib/contracts/balances';
import { explainNet, explainPair, nets, suggestions, type LedgerEntry } from '@/lib/money/ledger';
import { getDb } from '@/server/db';
import { entries, entryPayers, entryShares, groupMembers } from '@/server/db/schema';
import { notFound } from '@/server/http/errors';
import type { Membership } from './authz';

type Meta = { description: string; date: string; kind: string };

/** All live entries of a group with their legs, oldest first. */
export async function loadLedger(
  groupId: string,
): Promise<{ ledger: LedgerEntry[]; meta: Map<string, Meta> }> {
  const db = getDb();
  const rows = await db
    .select({
      id: entries.id,
      currency: entries.currency,
      description: entries.description,
      date: entries.date,
      kind: entries.kind,
    })
    .from(entries)
    .where(and(eq(entries.groupId, groupId), isNull(entries.deletedAt)))
    .orderBy(entries.date, entries.id);
  const ids = rows.map((r) => r.id);
  const payers = new Map<string, { memberId: string; amount: number }[]>();
  const shares = new Map<string, { memberId: string; amount: number }[]>();
  if (ids.length) {
    const [p, s] = await Promise.all([
      db.select().from(entryPayers).where(inArray(entryPayers.entryId, ids)),
      db.select().from(entryShares).where(inArray(entryShares.entryId, ids)),
    ]);
    for (const x of p)
      payers.set(x.entryId, [
        ...(payers.get(x.entryId) ?? []),
        { memberId: x.memberId, amount: x.amount },
      ]);
    for (const x of s)
      shares.set(x.entryId, [
        ...(shares.get(x.entryId) ?? []),
        { memberId: x.memberId, amount: x.amount },
      ]);
  }
  return {
    ledger: rows.map((r) => ({
      id: r.id,
      currency: r.currency,
      payers: payers.get(r.id) ?? [],
      shares: shares.get(r.id) ?? [],
    })),
    meta: new Map(
      rows.map((r) => [r.id, { description: r.description, date: r.date, kind: r.kind }]),
    ),
  };
}

export async function getBalances({ group }: Membership): Promise<BalancesResponse> {
  const { ledger } = await loadLedger(group.id);
  const n = nets(ledger);
  const memberIds = (
    await getDb()
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), isNull(groupMembers.removedAt)))
  ).map((m) => m.id);
  const withLedger = new Set(Object.values(n).flatMap((c) => Object.keys(c)));
  const all = [...new Set([...memberIds, ...withLedger])];
  return {
    simplifyDebts: group.simplifyDebts,
    members: all.map((memberId) => ({
      memberId,
      balances: Object.keys(n)
        .sort()
        .map((currency) => ({ currency, net: n[currency]![memberId] ?? 0 }))
        .filter((b) => b.net !== 0),
    })),
    suggestions: suggestions(ledger, group.simplifyDebts),
  };
}

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m].sort(([a], [b]) => (a < b ? -1 : 1));
}

export async function explainPairFor(
  { group }: Membership,
  a: string,
  b: string,
): Promise<ExplainPairResponse> {
  const { ledger, meta } = await loadLedger(group.id);
  const rows = explainPair(ledger, a, b).map((r) => ({
    ...r,
    ...meta.get(r.entryId)!,
    entryId: r.entryId,
  }));
  return {
    view: 'pair',
    a,
    b,
    rows,
    totals: sumBy(
      rows,
      (r) => r.currency,
      (r) => r.amount,
    )
      .filter(([, v]) => v !== 0)
      .map(([currency, amount]) => ({ currency, amount })),
  };
}

export async function explainNetFor(
  { group }: Membership,
  member: string,
): Promise<ExplainNetResponse> {
  const { ledger, meta } = await loadLedger(group.id);
  const rows = explainNet(ledger, member).map((r) => ({
    ...r,
    ...meta.get(r.entryId)!,
    entryId: r.entryId,
  }));
  return {
    view: 'net',
    member,
    rows,
    totals: sumBy(
      rows,
      (r) => r.currency,
      (r) => r.net,
    )
      .filter(([, v]) => v !== 0)
      .map(([currency, net]) => ({ currency, net })),
  };
}

export async function assertInGroup(groupId: string, memberIds: string[]) {
  const found = await getDb()
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.id, memberIds)));
  if (found.length !== new Set(memberIds).size) throw notFound('That person isn’t in this group.');
}

/** Derived, not stored: the payer and split of my most recent entry here (ARCHITECTURE §5). */
export async function entryDefaults({ group, member }: Membership): Promise<EntryDefaults> {
  const db = getDb();
  const [last] = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.groupId, group.id),
        eq(entries.createdByMemberId, member.id),
        eq(entries.kind, 'expense'),
      ),
    )
    .orderBy(desc(entries.createdAt))
    .limit(1);
  if (!last) return null;
  const payers = await db
    .select({ memberId: entryPayers.memberId })
    .from(entryPayers)
    .where(eq(entryPayers.entryId, last.id));
  const s = last.splitInput;
  const participantIds =
    s.type === 'equal' || s.type === 'adjustment'
      ? s.participants
      : s.type === 'exact' || s.type === 'imported_net'
        ? Object.keys(s.amounts)
        : s.type === 'percentage'
          ? Object.keys(s.bps)
          : s.type === 'shares'
            ? Object.keys(s.weights)
            : [...new Set(s.items.flatMap((i) => i.assignees.map((a) => a.memberId)))];
  return {
    payerIds: payers.map((p) => p.memberId),
    splitType: s.type,
    participantIds,
    currency: last.currency,
    category: last.category,
  };
}
