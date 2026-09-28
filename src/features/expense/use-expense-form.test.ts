import { describe, expect, it } from 'vitest';
import {
  buildPayers,
  buildSplit,
  checkForm,
  parseSigned,
  prefill,
  type ExpenseFormState,
} from './use-expense-form';

const A = 'a';
const R = 'r';
const N = 'n';
const base: ExpenseFormState = {
  expr: '900',
  description: '',
  currency: 'INR',
  date: '2026-09-28',
  category: null,
  categoryPicked: false,
  payerMode: 'single',
  payerId: A,
  payerAmounts: {},
  splitMode: 'equal',
  participants: [A, R, N],
  exact: {},
  percent: {},
  shares: {},
  adjust: {},
};

describe('split form helpers', () => {
  it('prefills exact amounts and percentages so they add up', () => {
    expect(prefill('exact', base, 90_000, 'seed')).toEqual({
      exact: { a: '300.00', n: '300.00', r: '300.00' },
    });
    const pct = prefill('percentage', base, 90_000, 'seed').percent!;
    expect(Object.values(pct).reduce((s, v) => s + Number(v), 0)).toBeCloseTo(100);
    expect(prefill('shares', base, 90_000, 'seed')).toEqual({ shares: { a: '1', r: '1', n: '1' } });
  });

  it('explains an exact split that is short or over', () => {
    const short = checkForm(
      { ...base, splitMode: 'exact', exact: { a: '300', r: '300' } },
      90_000,
      's',
    );
    expect(short).toMatchObject({ ok: false, reason: '₹300.00 left to split.' });
    const over = checkForm(
      { ...base, splitMode: 'exact', exact: { a: '500', r: '500' } },
      90_000,
      's',
    );
    expect(over).toMatchObject({ ok: false, reason: '₹100.00 too much in the split.' });
  });

  it('explains percentages that do not reach 100%', () => {
    const r = checkForm(
      { ...base, splitMode: 'percentage', percent: { a: '50', r: '30' } },
      90_000,
      's',
    );
    expect(r).toMatchObject({ ok: false, reason: '20% left to assign.' });
  });

  it('checks multiple payers', () => {
    const state = { ...base, payerMode: 'multiple' as const, payerAmounts: { a: '600', r: '200' } };
    expect(checkForm(state, 90_000, 's')).toMatchObject({
      ok: false,
      reason: '₹100.00 of the payment is unassigned.',
    });
    const ok = checkForm({ ...state, payerAmounts: { a: '600', r: '300' } }, 90_000, 's');
    expect(ok.ok).toBe(true);
    expect(buildPayers({ ...state, payerAmounts: { a: '600', r: '300', n: '' } }, 90_000)).toEqual([
      { memberId: 'a', amount: 60_000 },
      { memberId: 'r', amount: 30_000 },
    ]);
  });

  it('builds the split the server expects', () => {
    expect(
      buildSplit({ ...base, splitMode: 'shares', shares: { a: '1.5', r: '1', n: '0' } }),
    ).toEqual({
      type: 'shares',
      weights: { a: 150, r: 100 },
    });
    expect(buildSplit({ ...base, splitMode: 'exact', exact: { a: '100+20', r: 'x' } })).toEqual({
      type: 'exact',
      amounts: { a: 12_000 },
    });
  });

  it('parses signed adjustments and builds an adjustment split for participants only', () => {
    expect(parseSigned('-150', 'INR')).toBe(-15_000);
    expect(parseSigned('−20.5', 'INR')).toBe(-2_050);
    expect(parseSigned('+200', 'INR')).toBe(20_000);
    expect(parseSigned('', 'INR')).toBeNull();
    expect(parseSigned('abc', 'INR')).toBeNull();
    const s: ExpenseFormState = {
      ...base,
      splitMode: 'adjustment',
      participants: [A, R],
      adjust: { [A]: '100', [R]: '-0', [N]: '50' },
    };
    expect(buildSplit(s)).toEqual({
      type: 'adjustment',
      participants: [A, R],
      adjustments: { [A]: 10_000 },
    });
  });

  it('asks for an amount first and for at least one person', () => {
    expect(checkForm(base, null, 's')).toMatchObject({ ok: false, reason: 'Enter an amount.' });
    expect(checkForm({ ...base, participants: [] }, 100, 's')).toMatchObject({ ok: false });
  });
});
