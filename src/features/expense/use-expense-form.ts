'use client';

import { useMemo, useState } from 'react';
import type { EntryDefaults } from '@/lib/contracts/balances';
import type { EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { formatMoney, MoneyError, toDecimalString } from '@/lib/money/currency';
import { evalKeypad } from '@/lib/money/keypad';
import { computeShares, validatePayers, type Leg, type SplitInput } from '@/lib/money/splits';
import { todayIso } from '@/features/group/dates';

export type SplitMode = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

export type ExpenseFormState = {
  expr: string;
  description: string;
  currency: string;
  date: string;
  category: string | null;
  /** True once the user chose a category; until then it follows the description (1.28). */
  categoryPicked: boolean;
  /** Single payer (common case) or explicit amounts per payer. */
  payerMode: 'single' | 'multiple';
  payerId: string;
  payerAmounts: Record<string, string>;
  splitMode: SplitMode;
  /** Who shares an equal split (also the people in an adjustment split). */
  participants: string[];
  /** Raw text per member for exact (₹), percentage (%) and shares. Empty or zero = not included. */
  exact: Record<string, string>;
  percent: Record<string, string>;
  shares: Record<string, string>;
  /** Signed text per participant for the adjustment split: "200" or "-150". */
  adjust: Record<string, string>;
};

function initialState(
  group: GroupDetail,
  defaults: EntryDefaults,
  entry?: EntryDto,
): ExpenseFormState {
  const active = group.members.filter((m) => m.active).map((m) => m.id);
  const activeSet = new Set(active);
  if (entry) {
    const s = entry.split;
    const txt = (n: number) => toDecimalString(n, entry.currency);
    const map = (rec: Record<string, number>, f: (n: number) => string) =>
      Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, f(v)]));
    const mode: SplitMode =
      s.type === 'equal' ||
      s.type === 'percentage' ||
      s.type === 'shares' ||
      s.type === 'adjustment'
        ? s.type
        : 'exact';
    return {
      expr: txt(entry.amount),
      description: entry.description,
      currency: entry.currency,
      date: entry.date,
      category: entry.category,
      categoryPicked: entry.category !== null,
      payerMode: entry.payers.length === 1 ? 'single' : 'multiple',
      payerId: entry.payers[0]?.memberId ?? group.myMemberId,
      payerAmounts: Object.fromEntries(entry.payers.map((p) => [p.memberId, txt(p.amount)])),
      splitMode: mode,
      participants:
        s.type === 'equal' || s.type === 'adjustment'
          ? s.participants
          : entry.shares.map((l) => l.memberId),
      exact:
        s.type === 'exact'
          ? map(s.amounts, txt)
          : Object.fromEntries(entry.shares.map((l) => [l.memberId, txt(l.amount)])),
      percent: s.type === 'percentage' ? map(s.bps, (b) => String(b / 100)) : {},
      shares: s.type === 'shares' ? map(s.weights, (w) => String(w / 100)) : {},
      adjust:
        s.type === 'adjustment' ? map(s.adjustments, (n) => (n < 0 ? `-${txt(-n)}` : txt(n))) : {},
    };
  }
  const payer =
    defaults?.payerIds.length === 1 && activeSet.has(defaults.payerIds[0]!)
      ? defaults.payerIds[0]!
      : group.myMemberId;
  const remembered = (defaults?.participantIds ?? []).filter((id) => activeSet.has(id));
  return {
    expr: '',
    description: '',
    currency: defaults?.currency ?? group.defaultCurrency,
    date: todayIso(),
    category: null,
    categoryPicked: false,
    payerMode: 'single',
    payerId: payer,
    payerAmounts: {},
    splitMode: 'equal',
    participants: remembered.length > 1 ? remembered : active,
    exact: {},
    percent: {},
    shares: {},
    adjust: {},
  };
}

/** Parses a typed amount like "120.50" (or "100+20") into minor units, or null. */
export function parseTyped(text: string | undefined, currency: string): number | null {
  if (!text || text.trim() === '') return null;
  const r = evalKeypad(text, currency);
  return r.ok ? r.value : null;
}

/** Parses a signed amount like "-150" or "+200"; null when empty or invalid. */
export function parseSigned(text: string | undefined, currency: string): number | null {
  const t = text?.trim() ?? '';
  const negative = /^[-−]/.test(t);
  const value = parseTyped(t.replace(/^[-−+]/, ''), currency);
  return value === null ? null : negative ? -value : value;
}

function positiveEntries(rec: Record<string, string>, parse: (t: string) => number | null) {
  return Object.entries(rec)
    .map(([id, t]) => [id, parse(t)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== null && x[1] > 0);
}

/** The split the server will recompute, built from the form. */
export function buildSplit(state: ExpenseFormState): SplitInput {
  switch (state.splitMode) {
    case 'equal':
      return { type: 'equal', participants: state.participants };
    case 'exact':
      return {
        type: 'exact',
        amounts: Object.fromEntries(
          positiveEntries(state.exact, (t) => parseTyped(t, state.currency)),
        ),
      };
    case 'percentage':
      return {
        type: 'percentage',
        bps: Object.fromEntries(
          positiveEntries(state.percent, (t) =>
            Number.isFinite(Number(t)) ? Math.round(Number(t) * 100) : null,
          ),
        ),
      };
    case 'shares':
      return {
        type: 'shares',
        weights: Object.fromEntries(
          positiveEntries(state.shares, (t) =>
            Number.isFinite(Number(t)) ? Math.round(Number(t) * 100) : null,
          ),
        ),
      };
    case 'adjustment':
      return {
        type: 'adjustment',
        participants: state.participants,
        adjustments: Object.fromEntries(
          state.participants
            .map((id) => [id, parseSigned(state.adjust[id], state.currency)] as const)
            .filter((x): x is readonly [string, number] => x[1] !== null && x[1] !== 0),
        ),
      };
  }
}

export function buildPayers(state: ExpenseFormState, amount: number): Leg[] {
  if (state.payerMode === 'single') return [{ memberId: state.payerId, amount }];
  return positiveEntries(state.payerAmounts, (t) => parseTyped(t, state.currency)).map(
    ([memberId, a]) => ({
      memberId,
      amount: a,
    }),
  );
}

/** Values to start from when switching split mode, so the split still adds up. */
export function prefill(
  mode: SplitMode,
  state: ExpenseFormState,
  amount: number | null,
  seed: string,
): Partial<ExpenseFormState> {
  const ids = state.participants.length > 0 ? state.participants : [];
  if (mode === 'exact') {
    if (!amount || ids.length === 0) return { exact: {} };
    const legs = computeShares(amount, { type: 'equal', participants: ids }, seed);
    return {
      exact: Object.fromEntries(
        legs.map((l) => [l.memberId, toDecimalString(l.amount, state.currency)]),
      ),
    };
  }
  if (mode === 'percentage') {
    if (ids.length === 0) return { percent: {} };
    const legs = computeShares(10_000, { type: 'equal', participants: ids }, seed);
    return { percent: Object.fromEntries(legs.map((l) => [l.memberId, String(l.amount / 100)])) };
  }
  if (mode === 'shares') return { shares: Object.fromEntries(ids.map((id) => [id, '1'])) };
  if (mode === 'adjustment') return { adjust: {} };
  return {};
}

export type Check =
  { ok: true; shares: Leg[]; payers: Leg[] } | { ok: false; reason: string; shares: Leg[] | null };

/** Runs the same money engine the server will, so the form can explain what doesn't add up. */
export function checkForm(state: ExpenseFormState, amount: number | null, seed: string): Check {
  if (amount === null || amount <= 0)
    return { ok: false, reason: 'Enter an amount.', shares: null };
  const money = (n: number) => formatMoney(Math.abs(n), state.currency);
  let shares: Leg[];
  try {
    shares = computeShares(amount, buildSplit(state), seed);
  } catch (e) {
    if (!(e instanceof MoneyError)) throw e;
    const rem = e.details?.remainder;
    const bps = e.details?.remainingBps;
    const over = e.details?.over;
    const shortBy = e.details?.shortBy;
    const reason =
      rem !== undefined
        ? rem > 0
          ? `${money(rem)} left to split.`
          : `${money(rem)} too much in the split.`
        : bps !== undefined
          ? bps > 0
            ? `${bps / 100}% left to assign.`
            : `${-bps / 100}% too much.`
          : over !== undefined
            ? `Adjustments are ${money(over)} more than the total.`
            : shortBy !== undefined
              ? `An adjustment takes someone ${money(shortBy)} below zero.`
              : e.message;
    return { ok: false, reason, shares: null };
  }
  try {
    const payers = validatePayers(amount, buildPayers(state, amount));
    if (payers.length === 0) return { ok: false, reason: 'Choose who paid.', shares };
    return { ok: true, shares, payers };
  } catch (e) {
    if (!(e instanceof MoneyError)) throw e;
    const rem = e.details?.remainder ?? 0;
    return {
      ok: false,
      reason:
        rem > 0
          ? `${money(rem)} of the payment is unassigned.`
          : `Payers add up to ${money(rem)} too much.`,
      shares,
    };
  }
}

export function useExpenseForm(group: GroupDetail, defaults: EntryDefaults, entry?: EntryDto) {
  const [state, setState] = useState(() => initialState(group, defaults, entry));
  const update = (patch: Partial<ExpenseFormState>) => setState((s) => ({ ...s, ...patch }));
  const amount = useMemo(() => {
    const r = evalKeypad(state.expr.replace(/[+−×÷]$/, ''), state.currency);
    return r.ok ? r.value : null;
  }, [state.expr, state.currency]);
  return { state, setState, update, amount };
}
