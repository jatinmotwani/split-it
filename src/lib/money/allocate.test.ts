import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate } from './allocate';
import { MAX_AMOUNT, MoneyError } from './currency';

const parts = (weights: number[], prefix = 'm') =>
  weights.map((weight, i) => ({ key: `${prefix}${i + 1}`, weight }));

describe('allocate', () => {
  it('splits evenly when it can', () => {
    expect(allocate(90_000, parts([1, 1, 1]), 'e1')).toEqual([30_000, 30_000, 30_000]);
  });

  it('gives leftover units to the largest remainders first', () => {
    // 100 by 50/30/20 -> exact; 101 by 50/30/20 -> remainders .5/.3/.2 -> first gets the extra
    expect(allocate(100, parts([50, 30, 20]), 'e1')).toEqual([50, 30, 20]);
    expect(allocate(101, parts([50, 30, 20]), 'e1')).toEqual([51, 30, 20]);
  });

  it('breaks ties by the seed, so the extra paisa moves between expenses', () => {
    const winners = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const shares = allocate(10_000, parts([1, 1, 1]), `entry-${i}`);
      winners.add(shares.indexOf(3_334));
    }
    expect(winners).toEqual(new Set([0, 1, 2]));
  });

  it('never gives leftovers to zero-weight parts', () => {
    expect(allocate(1, parts([0, 1, 1]), 'x')).toEqual([0, expect.any(Number), expect.any(Number)]);
    expect(allocate(0, parts([0, 0]), 'x')).toEqual([0, 0]);
  });

  it('stays exact where floats would overflow (amount × basis points > 2^53)', () => {
    const shares = allocate(MAX_AMOUNT, parts([3333, 3333, 3334]), 'big');
    expect(shares.reduce((a, b) => a + b, 0)).toBe(MAX_AMOUNT);
    expect(shares).toEqual([33_330_000_000_000, 33_330_000_000_000, 33_340_000_000_000]);
  });

  it('rejects bad input', () => {
    expect(() => allocate(100, [], 'x')).toThrow(MoneyError);
    expect(() => allocate(100, parts([0, 0]), 'x')).toThrow(MoneyError);
    expect(() => allocate(100, parts([1, -1]), 'x')).toThrow(MoneyError);
    expect(() => allocate(100, parts([1.5]), 'x')).toThrow(MoneyError);
    expect(() => allocate(-1, parts([1]), 'x')).toThrow(MoneyError);
    expect(() =>
      allocate(
        100,
        [
          { key: 'a', weight: 1 },
          { key: 'a', weight: 1 },
        ],
        'x',
      ),
    ).toThrow(MoneyError);
  });

  it('property: exact sum, no negatives, within one unit of the ideal share, deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_AMOUNT }),
        fc
          .array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 })
          .filter((w) => w.some((x) => x > 0)),
        fc.string(),
        (total, weights, seed) => {
          const p = parts(weights);
          const shares = allocate(total, p, seed);
          const W = weights.reduce((a, b) => a + b, 0);
          const sumOk = shares.reduce((a, b) => a + b, 0) === total;
          const boundsOk = shares.every((s, i) => {
            const ideal = (BigInt(total) * BigInt(weights[i]!)) / BigInt(W);
            return s >= 0 && BigInt(s) >= ideal && BigInt(s) <= ideal + 1n;
          });
          const same = JSON.stringify(allocate(total, p, seed)) === JSON.stringify(shares);
          return sumOk && boundsOk && same;
        },
      ),
    );
  });

  it('is fair over many entries, for prefix-sharing and UUID member ids', () => {
    const ids = Array.from(
      { length: 3000 },
      (_, i) => `0192${(i * 7919).toString(16).padStart(8, '0')}-entry`,
    );
    for (const members of [
      ['m1', 'm2', 'm3'],
      [
        '5f0c2e1a-8b7d-4c3e-9a21-0d6b4f8e2c11',
        '5f0c2e1a-8b7d-4c3e-9a21-0d6b4f8e2c12',
        '9e21b7c4-1a2b-4c5d-8e9f-0a1b2c3d4e5f',
      ],
    ]) {
      const extra = [0, 0, 0];
      for (const id of ids) {
        const shares = allocate(
          100,
          members.map((key) => ({ key, weight: 1 })),
          id,
        );
        extra[shares.indexOf(34)]!++;
      }
      for (const n of extra) expect(Math.abs(n / ids.length - 1 / 3)).toBeLessThan(0.03);
    }
  });
});
