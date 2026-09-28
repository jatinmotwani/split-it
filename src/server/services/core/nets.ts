import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { assertSafeInt } from '@/lib/money/currency';
import { getDb, type Executor } from '@/server/db';
import { entries, entryPayers, entryShares } from '@/server/db/schema';

/** memberId → currency → net (paid − owed) over non-deleted entries. */
export type MemberNets = Map<string, Map<string, number>>;

function toInt(v: string | number | null): number {
  const n = Number(v ?? 0);
  assertSafeInt(n, 'balance');
  return n;
}

export async function memberNets(memberIds: string[], db: Executor = getDb()): Promise<MemberNets> {
  const out: MemberNets = new Map();
  if (memberIds.length === 0) return out;
  const add = (memberId: string, currency: string, delta: number) => {
    const m = out.get(memberId) ?? new Map<string, number>();
    out.set(memberId, m);
    m.set(currency, (m.get(currency) ?? 0) + delta);
  };
  const [paid, owed] = await Promise.all([
    db
      .select({
        memberId: entryPayers.memberId,
        currency: entries.currency,
        total: sql<string>`sum(${entryPayers.amount})`,
      })
      .from(entryPayers)
      .innerJoin(entries, eq(entries.id, entryPayers.entryId))
      .where(and(inArray(entryPayers.memberId, memberIds), isNull(entries.deletedAt)))
      .groupBy(entryPayers.memberId, entries.currency),
    db
      .select({
        memberId: entryShares.memberId,
        currency: entries.currency,
        total: sql<string>`sum(${entryShares.amount})`,
      })
      .from(entryShares)
      .innerJoin(entries, eq(entries.id, entryShares.entryId))
      .where(and(inArray(entryShares.memberId, memberIds), isNull(entries.deletedAt)))
      .groupBy(entryShares.memberId, entries.currency),
  ]);
  for (const r of paid) add(r.memberId, r.currency, toInt(r.total));
  for (const r of owed) add(r.memberId, r.currency, -toInt(r.total));
  return out;
}

/** Non-zero balances as a sorted list. */
export function balanceList(
  nets: Map<string, number> | undefined,
): { currency: string; net: number }[] {
  return [...(nets ?? new Map<string, number>())]
    .filter(([, net]) => net !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([currency, net]) => ({ currency, net }));
}
