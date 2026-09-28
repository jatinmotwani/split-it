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

/** Everyone in `participants` splits (amount − Σadjustments) equally, then adds their ± adjustment. */
export type AdjustmentSplit = {
  type: 'adjustment';
  participants: MemberId[];
  adjustments: Record<MemberId, number>;
};
export type ItemAssignee = { memberId: MemberId; weight: number };
export type Item = { id: string; name: string; amount: Minor; assignees: ItemAssignee[] };
export type ExtraKind = 'tax' | 'service' | 'tip' | 'discount';
export type Extra = { kind: ExtraKind; name?: string; amount: Minor };
/**
 * Restaurant bill: items are shared by weight; tax, service charge and tip are added and
 * discounts subtracted in proportion to each person's item subtotal.
 */
export type ItemizedSplit = { type: 'itemized'; items: Item[]; extras: Extra[] };
/** Splitwise import fallback (SPEC §8 rule 3): explicit net shares; originalCost kept for display. */
export type ImportedNetSplit = {
  type: 'imported_net';
  amounts: Record<MemberId, Minor>;
  originalCost?: Minor;
};

export type SplitInput =
  | EqualSplit
  | ExactSplit
  | PercentageSplit
  | SharesSplit
  | AdjustmentSplit
  | ItemizedSplit
  | ImportedNetSplit;
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

function adjustment(amount: Minor, input: AdjustmentSplit, seed: string): Leg[] {
  const ids = [...new Set(input.participants)].sort();
  if (ids.length === 0)
    throw new MoneyError('no_participants', 'Pick at least one person to split with.');
  const members = new Set(ids);
  let adjTotal = 0;
  for (const [memberId, adj] of Object.entries(input.adjustments)) {
    if (!members.has(memberId)) {
      throw new MoneyError('not_participant', 'Adjustments are only for people in the split.');
    }
    if (!Number.isSafeInteger(adj))
      throw new MoneyError('invalid_amount', 'Adjustments must be whole minor units.');
    adjTotal += adj;
  }
  const rest = amount - adjTotal;
  if (rest < 0) {
    throw new MoneyError('adjustment_exceeds', 'Adjustments add up to more than the total.', {
      over: -rest,
    });
  }
  const equalShares = allocate(
    rest,
    ids.map((key) => ({ key, weight: 1 })),
    seed,
  );
  return ids.map((memberId, i) => {
    const value = equalShares[i]! + (input.adjustments[memberId] ?? 0);
    if (value < 0) {
      throw new MoneyError('negative_share', 'An adjustment makes someone’s share negative.', {
        shortBy: -value,
      });
    }
    return { memberId, amount: value };
  });
}

function itemized(amount: Minor, input: ItemizedSplit, seed: string): Leg[] {
  if (input.items.length === 0) throw new MoneyError('no_items', 'Add at least one item.');
  const subtotal = new Map<MemberId, number>();
  let itemsTotal = 0;
  for (const item of input.items) {
    assertMinor(item.amount, 'item amount');
    if (item.assignees.length === 0) {
      throw new MoneyError('item_unassigned', `Pick who shared “${item.name}”.`);
    }
    const parts = item.assignees.map((a) => ({ key: a.memberId, weight: a.weight }));
    const shares = allocate(item.amount, parts, `${seed}:item:${item.id}`);
    item.assignees.forEach((a, i) =>
      subtotal.set(a.memberId, (subtotal.get(a.memberId) ?? 0) + shares[i]!),
    );
    itemsTotal += item.amount;
  }

  let extrasNet = 0;
  for (const e of input.extras) {
    assertMinor(e.amount, 'extra amount');
    extrasNet += e.kind === 'discount' ? -e.amount : e.amount;
  }
  const remainder = amount - (itemsTotal + extrasNet);
  if (remainder !== 0) {
    throw new MoneyError('items_mismatch', 'Items, taxes and discounts must add up to the total.', {
      remainder,
    });
  }

  const ids = [...subtotal.keys()].sort();
  // If every item is free (all subtotals zero), share any tax or service charge equally.
  const allFree = itemsTotal === 0;
  const parts = ids.map((key) => ({ key, weight: allFree ? 1 : subtotal.get(key)! }));
  const extraShares =
    extrasNet === 0
      ? ids.map(() => 0)
      : allocate(Math.abs(extrasNet), parts, `${seed}:extras`).map((x) => (extrasNet < 0 ? -x : x));
  // A discount can never exceed the items total (amount ≥ 0), so no share goes negative.
  return ids.map((memberId, i) => ({
    memberId,
    amount: subtotal.get(memberId)! + extraShares[i]!,
  }));
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
    case 'adjustment':
      return adjustment(amount, input, seed);
    case 'itemized':
      return itemized(amount, input, seed);
    case 'imported_net':
      return exact(amount, { type: 'exact', amounts: input.amounts });
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
