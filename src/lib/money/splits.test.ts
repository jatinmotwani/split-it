import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT, MoneyError } from './currency';
import { computeShares, nonZero, validatePayers, type Leg, type SplitInput } from './splits';

const A = 'asha';
const R = 'ravi';
const N = 'neel';
const total = (legs: Leg[]) => legs.reduce((s, l) => s + l.amount, 0);

function moneyError(fn: () => unknown): MoneyError {
  try {
    fn();
  } catch (e) {
    if (e instanceof MoneyError) return e;
    throw e;
  }
  throw new Error('expected a MoneyError');
}

describe('equal', () => {
  it('splits between participants, sorted by member, ignoring duplicates', () => {
    expect(computeShares(90_000, { type: 'equal', participants: [R, A, N, A] }, 'e1')).toEqual([
      { memberId: A, amount: 30_000 },
      { memberId: N, amount: 30_000 },
      { memberId: R, amount: 30_000 },
    ]);
  });

  it('needs at least one participant', () => {
    expect(
      moneyError(() => computeShares(100, { type: 'equal', participants: [] }, 'e')).code,
    ).toBe('no_participants');
  });
});

describe('exact', () => {
  it('uses the given amounts when they add up', () => {
    expect(computeShares(1_000, { type: 'exact', amounts: { [R]: 400, [A]: 600 } }, 'e')).toEqual([
      { memberId: A, amount: 600 },
      { memberId: R, amount: 400 },
    ]);
  });

  it('reports the remainder when they do not', () => {
    const e = moneyError(() =>
      computeShares(1_000, { type: 'exact', amounts: { [A]: 600, [R]: 300 } }, 'e'),
    );
    expect(e.code).toBe('exact_mismatch');
    expect(e.details).toEqual({ remainder: 100 });
    const over = moneyError(() =>
      computeShares(1_000, { type: 'exact', amounts: { [A]: 1_100 } }, 'e'),
    );
    expect(over.details).toEqual({ remainder: -100 });
  });

  it('rejects negative or fractional shares and an empty split', () => {
    expect(() => computeShares(0, { type: 'exact', amounts: { [A]: -1 } }, 'e')).toThrow(
      MoneyError,
    );
    expect(() => computeShares(1, { type: 'exact', amounts: { [A]: 0.5 } }, 'e')).toThrow(
      MoneyError,
    );
    expect(moneyError(() => computeShares(1, { type: 'exact', amounts: {} }, 'e')).code).toBe(
      'no_participants',
    );
  });
});

describe('percentage', () => {
  it('splits by basis points', () => {
    expect(
      computeShares(
        100_000,
        { type: 'percentage', bps: { [A]: 5_000, [R]: 3_000, [N]: 2_000 } },
        'e',
      ),
    ).toEqual([
      { memberId: A, amount: 50_000 },
      { memberId: N, amount: 20_000 },
      { memberId: R, amount: 30_000 },
    ]);
  });

  it('requires exactly 100%', () => {
    const e = moneyError(() =>
      computeShares(100, { type: 'percentage', bps: { [A]: 5_000, [R]: 4_000 } }, 'e'),
    );
    expect(e.code).toBe('percent_total');
    expect(e.details).toEqual({ remainingBps: 1_000 });
  });
});

describe('shares', () => {
  it('splits by weight (1.5 shares = 150)', () => {
    expect(
      computeShares(35_000, { type: 'shares', weights: { [A]: 150, [R]: 100, [N]: 100 } }, 'e'),
    ).toEqual([
      { memberId: A, amount: 15_000 },
      { memberId: N, amount: 10_000 },
      { memberId: R, amount: 10_000 },
    ]);
  });

  it('needs someone with a weight', () => {
    expect(moneyError(() => computeShares(100, { type: 'shares', weights: {} }, 'e')).code).toBe(
      'no_participants',
    );
    expect(
      moneyError(() => computeShares(100, { type: 'shares', weights: { [A]: 0 } }, 'e')).code,
    ).toBe('zero_weights');
  });
});

describe('validatePayers', () => {
  it('accepts one or many payers that add up, sorted, zeros dropped', () => {
    expect(validatePayers(1_000, [{ memberId: A, amount: 1_000 }])).toEqual([
      { memberId: A, amount: 1_000 },
    ]);
    expect(
      validatePayers(1_000, [
        { memberId: R, amount: 700 },
        { memberId: N, amount: 0 },
        { memberId: A, amount: 300 },
      ]),
    ).toEqual([
      { memberId: A, amount: 300 },
      { memberId: R, amount: 700 },
    ]);
    expect(validatePayers(0, [])).toEqual([]);
  });

  it('rejects mismatches, duplicates, negatives and nobody paying', () => {
    const e = moneyError(() => validatePayers(1_000, [{ memberId: A, amount: 900 }]));
    expect(e.code).toBe('payers_mismatch');
    expect(e.details).toEqual({ remainder: 100 });
    expect(
      moneyError(() =>
        validatePayers(2, [
          { memberId: A, amount: 1 },
          { memberId: A, amount: 1 },
        ]),
      ).code,
    ).toBe('duplicate_payer');
    expect(() => validatePayers(0, [{ memberId: A, amount: -1 }])).toThrow(MoneyError);
    expect(moneyError(() => validatePayers(5, [])).code).toBe('payers_mismatch');
  });
});

describe('nonZero', () => {
  it('keeps already-sorted legs in order', () => {
    const sorted = [
      { memberId: A, amount: 1 },
      { memberId: N, amount: 2 },
      { memberId: R, amount: 3 },
    ];
    expect(nonZero(sorted)).toEqual(sorted);
  });

  it('drops zero legs and sorts', () => {
    expect(
      nonZero([
        { memberId: R, amount: 5 },
        { memberId: A, amount: 0 },
        { memberId: N, amount: 1 },
      ]),
    ).toEqual([
      { memberId: N, amount: 1 },
      { memberId: R, amount: 5 },
    ]);
  });
});

// ---- properties -------------------------------------------------------------------------

const member = fc.constantFrom('m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8');
const amount = fc.integer({ min: 0, max: MAX_AMOUNT });

const splitArb: fc.Arbitrary<{ amount: number; input: SplitInput }> = fc.oneof(
  fc.record({
    amount,
    input: fc.record({
      type: fc.constant('equal' as const),
      participants: fc.uniqueArray(member, { minLength: 1 }),
    }),
  }),
  fc
    .tuple(amount, fc.uniqueArray(member, { minLength: 1 }), fc.integer({ min: 0, max: 1_000_000 }))
    .map(([a, ids, salt]) => {
      // Build exact amounts that add up: allocate by arbitrary weights derived from salt.
      const amounts: Record<string, number> = {};
      let left = a;
      ids.forEach((id, i) => {
        const part =
          i === ids.length - 1 ? left : Math.floor((left * ((salt + i * 7919) % 97)) / 97);
        amounts[id] = part;
        left -= part;
      });
      return { amount: a, input: { type: 'exact' as const, amounts } };
    }),
  fc
    .tuple(
      amount,
      fc.uniqueArray(member, { minLength: 1, maxLength: 8 }),
      fc.array(fc.nat(10_000), { minLength: 8, maxLength: 8 }),
    )
    .map(([a, ids, raw]) => {
      const bps: Record<string, number> = {};
      let left = 10_000;
      ids.forEach((id, i) => {
        const part = i === ids.length - 1 ? left : Math.min(left, raw[i]! % (left + 1));
        bps[id] = part;
        left -= part;
      });
      return { amount: a, input: { type: 'percentage' as const, bps } };
    }),
  fc.record({
    amount,
    input: fc.record({
      type: fc.constant('shares' as const),
      weights: fc.dictionary(member, fc.integer({ min: 1, max: 100_000 }), { minKeys: 1 }),
    }),
  }),
);

describe('split properties', () => {
  it('shares always add up to the amount, are never negative, and are deterministic', () => {
    fc.assert(
      fc.property(splitArb, fc.uuid(), ({ amount: a, input }, seed) => {
        const legs = computeShares(a, input, seed);
        const again = computeShares(a, structuredClone(input), seed);
        return (
          total(legs) === a &&
          legs.every((l) => l.amount >= 0) &&
          JSON.stringify(legs) === JSON.stringify(again)
        );
      }),
      { numRuns: 500 },
    );
  });
});
