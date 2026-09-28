import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MoneyError } from './currency';
import { computeShares, type Extra, type Item, type Leg } from './splits';

const A = 'asha';
const R = 'ravi';
const N = 'neel';
const total = (legs: Leg[]) => legs.reduce((s, l) => s + l.amount, 0);
const shareOf = (legs: Leg[], id: string) => legs.find((l) => l.memberId === id)!.amount;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MoneyError) return e.code;
    throw e;
  }
  return 'none';
}

describe('adjustment', () => {
  it('splits the rest equally and adds each adjustment', () => {
    // ₹1,000: Asha had an extra ₹100 drink, Neel skipped dessert (−₹40).
    const legs = computeShares(
      100_000,
      { type: 'adjustment', participants: [A, R, N], adjustments: { [A]: 10_000, [N]: -4_000 } },
      'e1',
    );
    // rest = 100000 − 6000 = 94000 → 31333.33 each
    expect(total(legs)).toBe(100_000);
    expect(shareOf(legs, A) - 10_000).toBeGreaterThanOrEqual(31_333);
    expect(shareOf(legs, N) + 4_000).toBeGreaterThanOrEqual(31_333);
    expect(legs.map((l) => l.memberId)).toEqual([A, N, R]);
  });

  it('rejects adjustments for outsiders, fractions, overshoot and negative shares', () => {
    const base = { type: 'adjustment' as const, participants: [A, R] };
    expect(
      code(() => computeShares(100, { ...base, participants: [], adjustments: {} }, 'e')),
    ).toBe('no_participants');
    expect(code(() => computeShares(100, { ...base, adjustments: { [N]: 10 } }, 'e'))).toBe(
      'not_participant',
    );
    expect(code(() => computeShares(100, { ...base, adjustments: { [A]: 0.5 } }, 'e'))).toBe(
      'invalid_amount',
    );
    expect(code(() => computeShares(100, { ...base, adjustments: { [A]: 150 } }, 'e'))).toBe(
      'adjustment_exceeds',
    );
    expect(code(() => computeShares(100, { ...base, adjustments: { [A]: -200 } }, 'e'))).toBe(
      'negative_share',
    );
  });
});

describe('itemized', () => {
  // A typical Indian restaurant bill: 10% service charge, then 5% GST on food + service.
  const items: Item[] = [
    {
      id: 'tikka',
      name: 'Paneer tikka',
      amount: 32_000,
      assignees: [
        { memberId: A, weight: 1 },
        { memberId: R, weight: 1 },
      ],
    },
    {
      id: 'dal',
      name: 'Dal makhani',
      amount: 28_000,
      assignees: [A, R, N].map((memberId) => ({ memberId, weight: 1 })),
    },
    {
      id: 'naan',
      name: 'Butter naan',
      amount: 15_000,
      assignees: [A, R, N].map((memberId) => ({ memberId, weight: 1 })),
    },
    { id: 'mocktail', name: 'Mocktail', amount: 18_000, assignees: [{ memberId: N, weight: 1 }] },
  ];
  const extras: Extra[] = [
    { kind: 'service', name: 'Service charge 10%', amount: 9_300 },
    { kind: 'tax', name: 'GST 5%', amount: 5_115 },
  ];

  it('matches the hand-computed restaurant bill to the paisa', () => {
    // Food ₹930, service ₹93, GST ₹51.15 → ₹1,074.15; everyone pays 1.155 × their food.
    // Asha and Ravi: (160 + 93.33 + 50) × 1.155 = ₹350.35. Neel: (93.33 + 50 + 180) × 1.155 = ₹373.45.
    for (const seed of ['bill-1', 'bill-2', 'bill-3']) {
      const legs = computeShares(107_415, { type: 'itemized', items, extras }, seed);
      expect(total(legs)).toBe(107_415);
      expect(Math.abs(shareOf(legs, A) - 35_035)).toBeLessThanOrEqual(1);
      expect(Math.abs(shareOf(legs, R) - 35_035)).toBeLessThanOrEqual(1);
      expect(Math.abs(shareOf(legs, N) - 37_345)).toBeLessThanOrEqual(1);
    }
  });

  it('applies a discount in proportion to items', () => {
    const legs = computeShares(
      3_600,
      {
        type: 'itemized',
        items: [
          { id: 'a', name: 'Pizza', amount: 1_000, assignees: [{ memberId: A, weight: 1 }] },
          { id: 'b', name: 'Pasta', amount: 3_000, assignees: [{ memberId: R, weight: 1 }] },
        ],
        extras: [{ kind: 'discount', name: '10% off', amount: 400 }],
      },
      'e',
    );
    expect(legs).toEqual([
      { memberId: A, amount: 900 },
      { memberId: R, amount: 2_700 },
    ]);
  });

  it('shares an item by weight (Asha had two of three plates)', () => {
    const legs = computeShares(
      900,
      {
        type: 'itemized',
        items: [
          {
            id: 'x',
            name: 'Momos',
            amount: 900,
            assignees: [
              { memberId: A, weight: 2 },
              { memberId: R, weight: 1 },
            ],
          },
        ],
        extras: [],
      },
      'e',
    );
    expect(legs).toEqual([
      { memberId: A, amount: 600 },
      { memberId: R, amount: 300 },
    ]);
  });

  it('shares tax equally when every item is free', () => {
    const legs = computeShares(
      300,
      {
        type: 'itemized',
        items: [
          {
            id: 'x',
            name: 'Complimentary',
            amount: 0,
            assignees: [A, R, N].map((memberId) => ({ memberId, weight: 1 })),
          },
        ],
        extras: [{ kind: 'service', amount: 300 }],
      },
      'e',
    );
    expect(legs).toEqual([A, N, R].map((memberId) => ({ memberId, amount: 100 })));
  });

  it('reports what does not add up', () => {
    expect(code(() => computeShares(100, { type: 'itemized', items: [], extras: [] }, 'e'))).toBe(
      'no_items',
    );
    expect(
      code(() =>
        computeShares(
          100,
          {
            type: 'itemized',
            items: [{ id: 'x', name: 'Chai', amount: 100, assignees: [] }],
            extras: [],
          },
          'e',
        ),
      ),
    ).toBe('item_unassigned');
    try {
      computeShares(1_000, { type: 'itemized', items: [items[3]!], extras: [] }, 'e');
    } catch (e) {
      expect((e as MoneyError).code).toBe('items_mismatch');
      expect((e as MoneyError).details).toEqual({ remainder: -17_000 });
    }
  });
});

describe('imported_net', () => {
  it('behaves like an exact split', () => {
    expect(
      computeShares(
        700,
        { type: 'imported_net', amounts: { [R]: 300, [A]: 400 }, originalCost: 1_000 },
        'e',
      ),
    ).toEqual([
      { memberId: A, amount: 400 },
      { memberId: R, amount: 300 },
    ]);
    expect(
      code(() => computeShares(700, { type: 'imported_net', amounts: { [A]: 400 } }, 'e')),
    ).toBe('exact_mismatch');
  });
});

// ---- properties -------------------------------------------------------------------------

const member = fc.constantFrom('m1', 'm2', 'm3', 'm4', 'm5', 'm6');

const itemArb = fc.record({
  id: fc.uuid(),
  name: fc.constant('item'),
  amount: fc.integer({ min: 0, max: 10_000_000 }),
  assignees: fc
    .uniqueArray(member, { minLength: 1, maxLength: 6 })
    .chain((ids) =>
      fc.tuple(
        ...ids.map((memberId) =>
          fc.integer({ min: 1, max: 5 }).map((weight) => ({ memberId, weight })),
        ),
      ),
    ),
});

describe('advanced split properties', () => {
  it('itemized bills with taxes and discounts always add up and never go negative', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        fc.uuid(),
        (items, tax, discountPermille, seed) => {
          const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
          const discount = Math.floor((itemsTotal * discountPermille) / 1_000);
          const extras: Extra[] = [
            { kind: 'tax', amount: tax },
            { kind: 'discount', amount: discount },
          ];
          const amount = itemsTotal + tax - discount;
          const legs = computeShares(amount, { type: 'itemized', items, extras }, seed);
          return total(legs) === amount && legs.every((l) => l.amount >= 0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('non-negative adjustments always add up', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(member, { minLength: 1 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 6, maxLength: 6 }),
        fc.uuid(),
        (ids, base, adjs, seed) => {
          const adjustments = Object.fromEntries(ids.map((id, i) => [id, adjs[i]!]));
          const amount = base + Object.values(adjustments).reduce((a, b) => a + b, 0);
          const legs = computeShares(
            amount,
            { type: 'adjustment', participants: ids, adjustments },
            seed,
          );
          return total(legs) === amount && legs.every((l) => l.amount >= 0);
        },
      ),
    );
  });
});
