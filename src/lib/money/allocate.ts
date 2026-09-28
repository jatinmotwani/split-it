/**
 * Largest-remainder allocation (SPEC §5.2). Every split type builds on this.
 */
import { assertMinor, MoneyError, type Minor } from './currency';
import { tieBreakKey } from './hash';

export type Part = { key: string; weight: number };

/**
 * Splits `total` minor units in proportion to integer weights.
 *
 * - Each part gets floor(total × w / Σw); the leftover units go one each to the largest
 *   remainders. Ties are ordered by tieBreakKey(seed, key), so with the entry id as seed the
 *   extra paisa moves between people across expenses. Same input, same output.
 * - Zero-weight parts never receive a leftover unit.
 * - Products are computed in BigInt: total × weight can exceed 2^53.
 */
export function allocate(total: Minor, parts: readonly Part[], seed: string): Minor[] {
  assertMinor(total, 'total');
  if (parts.length === 0) throw new MoneyError('no_parts', 'Nothing to split between.');
  const keys = new Set<string>();
  let sum = 0n;
  for (const p of parts) {
    if (!Number.isSafeInteger(p.weight) || p.weight < 0) {
      throw new MoneyError('invalid_weight', 'Weights must be non-negative whole numbers.');
    }
    if (keys.has(p.key)) throw new MoneyError('duplicate_part', `Duplicate part: ${p.key}`);
    keys.add(p.key);
    sum += BigInt(p.weight);
  }
  if (sum === 0n) {
    if (total === 0) return parts.map(() => 0);
    throw new MoneyError('zero_weights', 'At least one person needs a share.');
  }

  const T = BigInt(total);
  const base = parts.map((p) => (T * BigInt(p.weight)) / sum);
  const rem = parts.map((p, i) => T * BigInt(p.weight) - base[i]! * sum);
  let leftover = T - base.reduce((a, b) => a + b, 0n);

  // Largest remainder first; equal remainders by the seeded hash. Array.prototype.sort is stable,
  // so even a hash collision resolves deterministically by input order.
  const order = parts
    .map((p, i) => ({ i, rem: rem[i]!, tie: tieBreakKey(seed, p.key), weight: p.weight }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => (a.rem === b.rem ? a.tie - b.tie : a.rem > b.rem ? -1 : 1));

  const out = [...base];
  for (let k = 0; leftover > 0n; k++, leftover--) out[order[k]!.i]! += 1n;
  return out.map(Number);
}
