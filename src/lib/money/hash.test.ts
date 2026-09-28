import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fmix32, fnv1a, tieBreakKey } from './hash';

describe('fnv1a', () => {
  it('matches the published FNV-1a test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('fmix32', () => {
  it('maps 0 to 0 and is a 32-bit unsigned value', () => {
    expect(fmix32(0)).toBe(0);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (n) => {
        const h = fmix32(n);
        return Number.isInteger(h) && h >= 0 && h <= 0xffffffff;
      }),
    );
  });
});

describe('tieBreakKey', () => {
  it('is deterministic for the same seed and member', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (seed, member) => {
        return tieBreakKey(seed, member) === tieBreakKey(seed, member);
      }),
    );
  });

  it('gives each of three prefix-sharing members a fair share of first places', () => {
    const members = ['m1', 'm2', 'm3'];
    const wins = [0, 0, 0];
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const seed = `entry-${i}`;
      let best = 0;
      for (let m = 1; m < members.length; m++) {
        if (tieBreakKey(seed, members[m]!) < tieBreakKey(seed, members[best]!)) best = m;
      }
      wins[best]!++;
    }
    for (const w of wins) expect(Math.abs(w / runs - 1 / 3)).toBeLessThan(0.03);
  });
});
