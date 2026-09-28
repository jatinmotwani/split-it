/**
 * Split types (SPEC §5.2). Pure functions: the same input always gives the same legs, the legs
 * always sum to the amount, and nobody's share is negative. The server recomputes every split
 * with these functions; the client uses them only to preview.
 */
import { allocate } from './allocate';
import { assertMinor, MoneyError, type Minor } from './currency';

export type MemberId = string;
export type Leg = { memberId: MemberId; amount: Minor };

export type EqualSplit = { type: 'equal'; participants: MemberId[] };
export type ExactSplit = { type: 'exact'; amounts: Record<MemberId, Minor> };
/** Basis points: 10000 = 100%. */
export type PercentageSplit = { type: 'percentage'; bps: Record<MemberId, number> };
/** Integer weights; the UI uses weight × 100 so "1.5 shares" is 150. */
export type SharesSplit = { type: 'shares'; weights: Record<MemberId, number> };

export type SplitInput = EqualSplit | ExactSplit | PercentageSplit | SharesSplit;
export type SplitType = SplitInput['type'];

/** Member ids within one list are unique, so there are no ties. */
const byMember = (a: Leg, b: Leg) => (a.memberId < b.memberId ? -1 : 1);

function sortedKeys(record: Record<MemberId, unknown>): MemberId[] {
  return Object.keys(record).sort();
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function equal(amount: Minor, input: EqualSplit, seed: string): Leg[] {
  const ids = [...new Set(input.participants)].sort();
  if (ids.length === 0)
    throw new MoneyError('no_participants', 'Pick at least one person to split with.');
  const shares = allocate(
    amount,
    ids.map((key) => ({ key, weight: 1 })),
    seed,
  );
  return ids.map((memberId, i) => ({ memberId, amount: shares[i]! }));
}

function exact(amount: Minor, input: ExactSplit): Leg[] {
  const ids = sortedKeys(input.amounts);
  if (ids.length === 0)
    throw new MoneyError('no_participants', 'Pick at least one person to split with.');
  const legs = ids.map((memberId) => {
    const value = input.amounts[memberId]!;
    assertMinor(value, 'share');
    return { memberId, amount: value };
  });
  const remainder = amount - sum(legs.map((l) => l.amount));
  if (remainder !== 0) {
    throw new MoneyError('exact_mismatch', 'The amounts must add up to the total.', { remainder });
  }
  return legs;
}

function weighted(amount: Minor, weights: Record<MemberId, number>, seed: string): Leg[] {
  const ids = sortedKeys(weights);
  if (ids.length === 0)
    throw new MoneyError('no_participants', 'Pick at least one person to split with.');
  const shares = allocate(
    amount,
    ids.map((key) => ({ key, weight: weights[key]! })),
    seed,
  );
  return ids.map((memberId, i) => ({ memberId, amount: shares[i]! }));
}

function percentage(amount: Minor, input: PercentageSplit, seed: string): Leg[] {
  const total = sum(Object.values(input.bps));
  if (total !== 10_000) {
    throw new MoneyError('percent_total', 'Percentages must add up to 100%.', {
      remainingBps: 10_000 - total,
    });
  }
  return weighted(amount, input.bps, seed);
}

/** Computes each member's share. `seed` is the entry id (it decides who gets leftover paise). */
export function computeShares(amount: Minor, input: SplitInput, seed: string): Leg[] {
  assertMinor(amount);
  switch (input.type) {
    case 'equal':
      return equal(amount, input, seed);
    case 'exact':
      return exact(amount, input);
    case 'percentage':
      return percentage(amount, input, seed);
    case 'shares':
      return weighted(amount, input.weights, seed);
  }
}

/**
 * Who paid. Any number of payers with explicit amounts that add up to the total; returned sorted
 * by member with zero amounts dropped.
 */
export function validatePayers(amount: Minor, payers: readonly Leg[]): Leg[] {
  assertMinor(amount);
  const seen = new Set<MemberId>();
  for (const p of payers) {
    assertMinor(p.amount, 'paid amount');
    if (seen.has(p.memberId))
      throw new MoneyError('duplicate_payer', 'Each person can appear once as a payer.');
    seen.add(p.memberId);
  }
  const remainder = amount - sum(payers.map((p) => p.amount));
  if (remainder !== 0) {
    throw new MoneyError('payers_mismatch', 'What people paid must add up to the total.', {
      remainder,
    });
  }
  return payers.filter((p) => p.amount > 0).sort(byMember);
}

/** Legs worth storing: non-zero, sorted by member. */
export function nonZero(legs: readonly Leg[]): Leg[] {
  return legs.filter((l) => l.amount > 0).sort(byMember);
}
