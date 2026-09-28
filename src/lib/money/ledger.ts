/**
 * Who owes whom (SPEC §5.3). Every entry kind (expense, settlement, opening balance) is just
 * payers and shares, so one set of functions covers them all. Balances are per currency and never
 * merged.
 */
import { allocate } from './allocate';
import type { Leg, MemberId } from './splits';

export type LedgerEntry = {
  id: string;
  currency: string;
  payers: readonly Leg[];
  shares: readonly Leg[];
};

/** currency → member → net (paid − owed). Positive: gets money back. Negative: owes. */
export type Nets = Record<string, Record<MemberId, number>>;

export type Transfer = { currency: string; from: MemberId; to: MemberId; amount: number };

/** One entry's contribution to a person-to-person debt: `from` owes `to`. */
export type Contribution = {
  entryId: string;
  currency: string;
  from: MemberId;
  to: MemberId;
  amount: number;
};

export function nets(entries: readonly LedgerEntry[]): Nets {
  const out: Nets = {};
  for (const e of entries) {
    const c = (out[e.currency] ??= {});
    for (const p of e.payers) c[p.memberId] = (c[p.memberId] ?? 0) + p.amount;
    for (const s of e.shares) c[s.memberId] = (c[s.memberId] ?? 0) - s.amount;
  }
  return out;
}

/**
 * Raw view: each member's share of an entry is owed to that entry's payers in proportion to what
 * they paid. Shares are attributed in member order against each payer's *remaining* amount, so
 * both every share and every payer's total come out exact (rounding a share at a time
 * independently would let a payer's column drift by a paisa per sharer).
 */
export function contributions(e: LedgerEntry): Contribution[] {
  const payers = e.payers
    .filter((p) => p.amount > 0)
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
  if (payers.length === 0) return [];
  const remaining = payers.map((p) => p.amount);
  const sharers = e.shares
    .filter((s) => s.amount > 0)
    .sort((a, b) => (a.memberId < b.memberId ? -1 : 1));
  const out: Contribution[] = [];
  for (const s of sharers) {
    const parts = payers.map((p, i) => ({ key: p.memberId, weight: remaining[i]! }));
    const portions = allocate(s.amount, parts, `${e.id}:${s.memberId}`);
    payers.forEach((p, i) => {
      const amount = portions[i]!;
      remaining[i]! -= amount;
      if (p.memberId !== s.memberId && amount > 0) {
        out.push({ entryId: e.id, currency: e.currency, from: s.memberId, to: p.memberId, amount });
      }
    });
  }
  return out;
}

const pairKey = (a: MemberId, b: MemberId) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Raw person-to-person balances, netted per pair: one transfer per pair that owes anything. */
export function pairwise(entries: readonly LedgerEntry[]): Transfer[] {
  // currency → pair → amount owed by the smaller id to the larger id (negative: the reverse)
  const acc = new Map<string, Map<string, number>>();
  for (const e of entries) {
    for (const c of contributions(e)) {
      const m = acc.get(c.currency) ?? new Map<string, number>();
      acc.set(c.currency, m);
      const k = pairKey(c.from, c.to);
      m.set(k, (m.get(k) ?? 0) + (c.from < c.to ? c.amount : -c.amount));
    }
  }
  const out: Transfer[] = [];
  for (const [currency, m] of [...acc].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const [k, v] of [...m].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (v === 0) continue;
      const [lo, hi] = k.split('\u0000') as [MemberId, MemberId];
      out.push(
        v > 0
          ? { currency, from: lo, to: hi, amount: v }
          : { currency, from: hi, to: lo, amount: -v },
      );
    }
  }
  return out;
}

/**
 * Simplified view: repeatedly match the largest debtor with the largest creditor. Ties go to the
 * smaller member id. Settles everyone in at most n − 1 transfers per currency.
 */
export function simplify(allNets: Nets): Transfer[] {
  const out: Transfer[] = [];
  for (const currency of Object.keys(allNets).sort()) {
    const bal = new Map(Object.entries(allNets[currency]!).filter(([, v]) => v !== 0));
    const pick = (sign: 1 | -1) => {
      let best: [MemberId, number] | null = null;
      for (const [id, v] of bal) {
        if (Math.sign(v) !== sign) continue;
        if (
          !best ||
          Math.abs(v) > Math.abs(best[1]) ||
          (Math.abs(v) === Math.abs(best[1]) && id < best[0])
        ) {
          best = [id, v];
        }
      }
      return best;
    };
    for (;;) {
      const debtor = pick(-1);
      const creditor = pick(1);
      if (!debtor || !creditor) break;
      const amount = Math.min(-debtor[1], creditor[1]);
      out.push({ currency, from: debtor[0], to: creditor[0], amount });
      bal.set(debtor[0], debtor[1] + amount);
      bal.set(creditor[0], creditor[1] - amount);
      if (bal.get(debtor[0]) === 0) bal.delete(debtor[0]);
      if (bal.get(creditor[0]) === 0) bal.delete(creditor[0]);
    }
  }
  return out;
}

/** Settle-up suggestions from the group's active view. Applying all of them zeroes every net. */
export function suggestions(entries: readonly LedgerEntry[], simplifyDebts: boolean): Transfer[] {
  return simplifyDebts ? simplify(nets(entries)) : pairwise(entries);
}

export type PairRow = { entryId: string; currency: string; amount: number };

/**
 * "Why does b owe a?" (raw view). Rows are per entry; positive means b owes a from that entry.
 * Per currency, the rows add up to the pairwise balance between them.
 */
export function explainPair(entries: readonly LedgerEntry[], a: MemberId, b: MemberId): PairRow[] {
  const rows: PairRow[] = [];
  for (const e of entries) {
    let amount = 0;
    for (const c of contributions(e)) {
      if (c.from === b && c.to === a) amount += c.amount;
      else if (c.from === a && c.to === b) amount -= c.amount;
    }
    if (amount !== 0) rows.push({ entryId: e.id, currency: e.currency, amount });
  }
  return rows;
}

export type NetRow = { entryId: string; currency: string; paid: number; owed: number; net: number };

/** "Why is my balance what it is?" (simplified view). Per currency, `net` adds up to the member's net. */
export function explainNet(entries: readonly LedgerEntry[], member: MemberId): NetRow[] {
  const rows: NetRow[] = [];
  for (const e of entries) {
    const paid = e.payers.filter((p) => p.memberId === member).reduce((s, p) => s + p.amount, 0);
    const owed = e.shares.filter((s) => s.memberId === member).reduce((t, s) => t + s.amount, 0);
    if (paid !== 0 || owed !== 0)
      rows.push({ entryId: e.id, currency: e.currency, paid, owed, net: paid - owed });
  }
  return rows;
}
