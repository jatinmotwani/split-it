import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate } from './allocate';
import {
  contributions,
  explainNet,
  explainPair,
  nets,
  pairwise,
  simplify,
  suggestions,
  type LedgerEntry,
  type Nets,
  type Transfer,
} from './ledger';

const A = 'asha';
const R = 'ravi';
const N = 'neel';

// The D4 example: Asha paid ₹900 dinner for all three; Ravi paid ₹600 cab for Ravi and Neel.
const dinner: LedgerEntry = {
  id: 'e-dinner',
  currency: 'INR',
  payers: [{ memberId: A, amount: 90_000 }],
  shares: [A, R, N].map((memberId) => ({ memberId, amount: 30_000 })),
};
const cab: LedgerEntry = {
  id: 'e-cab',
  currency: 'INR',
  payers: [{ memberId: R, amount: 60_000 }],
  shares: [R, N].map((memberId) => ({ memberId, amount: 30_000 })),
};

function apply(n: Nets, transfers: Transfer[]): Nets {
  const out: Nets = structuredClone(n);
  for (const t of transfers) {
    const c = (out[t.currency] ??= {});
    c[t.from] = (c[t.from] ?? 0) + t.amount;
    c[t.to] = (c[t.to] ?? 0) - t.amount;
  }
  return out;
}
const allZero = (n: Nets) => Object.values(n).every((c) => Object.values(c).every((v) => v === 0));

describe('nets', () => {
  it('is paid minus owed per currency', () => {
    expect(nets([dinner, cab])).toEqual({ INR: { [A]: 60_000, [R]: 0, [N]: -60_000 } });
  });

  it('keeps currencies apart', () => {
    const usd: LedgerEntry = {
      id: 'u',
      currency: 'USD',
      payers: [{ memberId: R, amount: 1_000 }],
      shares: [{ memberId: A, amount: 1_000 }],
    };
    expect(nets([dinner, usd])).toEqual({
      INR: { [A]: 60_000, [R]: -30_000, [N]: -30_000 },
      USD: { [R]: 1_000, [A]: -1_000 },
    });
  });

  it('treats a settlement as payer = sender, share = receiver', () => {
    const settle: LedgerEntry = {
      id: 's',
      currency: 'INR',
      payers: [{ memberId: N, amount: 60_000 }],
      shares: [{ memberId: A, amount: 60_000 }],
    };
    expect(nets([dinner, cab, settle]).INR).toEqual({ [A]: 0, [R]: 0, [N]: 0 });
  });
});

describe('pairwise and simplify (the D4 example)', () => {
  it('raw view needs three payments', () => {
    // Ordered by pair (asha–neel, asha–ravi, neel–ravi).
    expect(pairwise([dinner, cab])).toEqual([
      { currency: 'INR', from: N, to: A, amount: 30_000 },
      { currency: 'INR', from: R, to: A, amount: 30_000 },
      { currency: 'INR', from: N, to: R, amount: 30_000 },
    ]);
  });

  it('simplified view needs one', () => {
    expect(simplify(nets([dinner, cab]))).toEqual([
      { currency: 'INR', from: N, to: A, amount: 60_000 },
    ]);
    expect(suggestions([dinner, cab], true)).toEqual(simplify(nets([dinner, cab])));
    expect(suggestions([dinner, cab], false)).toEqual(pairwise([dinner, cab]));
  });

  it('explains the pair and the net', () => {
    expect(explainPair([dinner, cab], A, N)).toEqual([
      { entryId: 'e-dinner', currency: 'INR', amount: 30_000 },
    ]);
    expect(explainPair([dinner, cab], N, A)).toEqual([
      { entryId: 'e-dinner', currency: 'INR', amount: -30_000 },
    ]);
    expect(explainNet([dinner, cab], N)).toEqual([
      { entryId: 'e-dinner', currency: 'INR', paid: 0, owed: 30_000, net: -30_000 },
      { entryId: 'e-cab', currency: 'INR', paid: 0, owed: 30_000, net: -30_000 },
    ]);
  });

  it('breaks ties by member id', () => {
    const n: Nets = { INR: { b: -100, a: -100, d: 100, c: 100 } };
    expect(simplify(n)).toEqual([
      { currency: 'INR', from: 'a', to: 'c', amount: 100 },
      { currency: 'INR', from: 'b', to: 'd', amount: 100 },
    ]);
  });
});

describe('contributions', () => {
  it('keeps every payer’s total exact with several payers and sharers', () => {
    // The shrunk counterexample that broke independent per-share rounding.
    const e: LedgerEntry = {
      id: '00000000-0000-1000-8000-000000000000',
      currency: 'INR',
      payers: [
        { memberId: 'm1', amount: 668_580 },
        { memberId: 'm3', amount: 780_011 },
      ],
      shares: [
        { memberId: 'm1', amount: 80_477 },
        { memberId: 'm4', amount: 563_341 },
        { memberId: 'm2', amount: 804_773 },
      ],
    };
    const n = nets([e]).INR!;
    const settled = apply({ INR: n }, pairwise([e]));
    expect(allZero(settled)).toBe(true);
  });

  it('splits a share across several payers in proportion to what they paid', () => {
    const e: LedgerEntry = {
      id: 'multi',
      currency: 'INR',
      payers: [
        { memberId: A, amount: 600 },
        { memberId: R, amount: 300 },
        { memberId: N, amount: 0 },
      ],
      shares: [
        { memberId: N, amount: 900 },
        { memberId: A, amount: 0 },
      ],
    };
    expect(contributions(e)).toEqual([
      { entryId: 'multi', currency: 'INR', from: N, to: A, amount: 600 },
      { entryId: 'multi', currency: 'INR', from: N, to: R, amount: 300 },
    ]);
  });

  it('ignores entries nobody paid for', () => {
    expect(contributions({ id: 'z', currency: 'INR', payers: [], shares: [] })).toEqual([]);
  });
});

// ---- properties -------------------------------------------------------------------------

const MEMBERS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

const entryArb: fc.Arbitrary<LedgerEntry> = fc
  .record({
    id: fc.uuid(),
    currency: fc.constantFrom('INR', 'USD'),
    amount: fc.integer({ min: 0, max: 5_000_000 }),
    payers: fc.uniqueArray(fc.constantFrom(...MEMBERS), { minLength: 1, maxLength: 3 }),
    payerWeights: fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 3, maxLength: 3 }),
    sharers: fc.uniqueArray(fc.constantFrom(...MEMBERS), { minLength: 1, maxLength: 6 }),
    shareWeights: fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 6, maxLength: 6 }),
  })
  .map(({ id, currency, amount, payers, payerWeights, sharers, shareWeights }) => {
    const pw = payers.map((key, i) => ({ key, weight: payerWeights[i]! }));
    const sw = sharers.map((key, i) => ({ key, weight: shareWeights[i]! || 1 }));
    const paid = allocate(amount, pw, id);
    const owed = allocate(amount, sw, id);
    return {
      id,
      currency,
      payers: payers.map((memberId, i) => ({ memberId, amount: paid[i]! })),
      shares: sharers.map((memberId, i) => ({ memberId, amount: owed[i]! })),
    };
  });

const ledgerArb = fc.array(entryArb, { maxLength: 25 });

describe('ledger properties', () => {
  it('nets sum to zero in every currency', () => {
    fc.assert(
      fc.property(ledgerArb, (entries) =>
        Object.values(nets(entries)).every(
          (c) => Object.values(c).reduce((a, b) => a + b, 0) === 0,
        ),
      ),
    );
  });

  it('the simplified plan settles everyone exactly in at most n − 1 transfers', () => {
    fc.assert(
      fc.property(ledgerArb, (entries) => {
        const n = nets(entries);
        const plan = simplify(n);
        const perCurrencyOk = Object.entries(n).every(([currency, c]) => {
          const nonZero = Object.values(c).filter((v) => v !== 0).length;
          const count = plan.filter((t) => t.currency === currency).length;
          return count <= Math.max(0, nonZero - 1);
        });
        return allZero(apply(n, plan)) && perCurrencyOk && plan.every((t) => t.amount > 0);
      }),
    );
  });

  it('applying the raw pairwise plan also settles everyone', () => {
    fc.assert(
      fc.property(ledgerArb, (entries) => allZero(apply(nets(entries), pairwise(entries)))),
    );
  });

  it('explainPair rows add up to the pairwise balance, explainNet rows to the net', () => {
    fc.assert(
      fc.property(
        ledgerArb,
        fc.constantFrom(...MEMBERS),
        fc.constantFrom(...MEMBERS),
        (entries, a, b) => {
          if (a === b) return true;
          const pw = pairwise(entries);
          for (const currency of ['INR', 'USD']) {
            const owedToA =
              pw
                .filter((t) => t.currency === currency && t.from === b && t.to === a)
                .reduce((s, t) => s + t.amount, 0) -
              pw
                .filter((t) => t.currency === currency && t.from === a && t.to === b)
                .reduce((s, t) => s + t.amount, 0);
            const rows = explainPair(entries, a, b).filter((r) => r.currency === currency);
            if (rows.reduce((s, r) => s + r.amount, 0) !== owedToA) return false;
            const netRows = explainNet(entries, a).filter((r) => r.currency === currency);
            if (netRows.reduce((s, r) => s + r.net, 0) !== (nets(entries)[currency]?.[a] ?? 0))
              return false;
          }
          return true;
        },
      ),
    );
  });
});
