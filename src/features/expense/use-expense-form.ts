'use client';

import { useMemo, useState } from 'react';
import type { EntryDefaults } from '@/lib/contracts/balances';
import type { EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { evalKeypad } from '@/lib/money/keypad';
import { toDecimalString } from '@/lib/money/currency';
import type { SplitInput } from '@/lib/money/splits';
import { todayIso } from '@/features/group/dates';

export type SplitMode = 'equal' | 'exact' | 'percentage' | 'shares';

export type ExpenseFormState = {
  expr: string;
  description: string;
  currency: string;
  date: string;
  category: string | null;
  /** Single payer (common case) or explicit amounts per payer. */
  payerMode: 'single' | 'multiple';
  payerId: string;
  payerAmounts: Record<string, string>;
  splitMode: SplitMode;
  participants: string[];
  /** Raw text per member for exact (₹), percentage (%) and shares. */
  exact: Record<string, string>;
  percent: Record<string, string>;
  shares: Record<string, string>;
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
    const byMember = (rec: Record<string, number>, f: (n: number) => string) =>
      Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, f(v)]));
    return {
      expr: txt(entry.amount),
      description: entry.description,
      currency: entry.currency,
      date: entry.date,
      category: entry.category,
      payerMode: entry.payers.length === 1 ? 'single' : 'multiple',
      payerId: entry.payers[0]?.memberId ?? group.myMemberId,
      payerAmounts: Object.fromEntries(entry.payers.map((p) => [p.memberId, txt(p.amount)])),
      splitMode:
        s.type === 'equal' || s.type === 'exact' || s.type === 'percentage' || s.type === 'shares'
          ? s.type
          : 'exact',
      participants: s.type === 'equal' ? s.participants : entry.shares.map((l) => l.memberId),
      exact:
        s.type === 'exact'
          ? byMember(s.amounts, txt)
          : Object.fromEntries(entry.shares.map((l) => [l.memberId, txt(l.amount)])),
      percent: s.type === 'percentage' ? byMember(s.bps, (b) => String(b / 100)) : {},
      shares: s.type === 'shares' ? byMember(s.weights, (w) => String(w / 100)) : {},
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
    payerMode: 'single',
    payerId: payer,
    payerAmounts: {},
    splitMode: 'equal',
    participants: remembered.length > 0 ? remembered : active,
    exact: {},
    percent: {},
    shares: {},
  };
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

/** Parses a typed amount like "120.50" into minor units, or null. */
export function parseTyped(text: string | undefined, currency: string): number | null {
  if (!text || text.trim() === '') return null;
  const r = evalKeypad(text, currency);
  return r.ok ? r.value : null;
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
          state.participants.map((id) => [id, parseTyped(state.exact[id], state.currency) ?? 0]),
        ),
      };
    case 'percentage':
      return {
        type: 'percentage',
        bps: Object.fromEntries(
          state.participants.map((id) => [id, Math.round(Number(state.percent[id] || 0) * 100)]),
        ),
      };
    case 'shares':
      return {
        type: 'shares',
        weights: Object.fromEntries(
          state.participants.map((id) => [id, Math.round(Number(state.shares[id] || 1) * 100)]),
        ),
      };
  }
}

export function buildPayers(state: ExpenseFormState, amount: number) {
  if (state.payerMode === 'single') return [{ memberId: state.payerId, amount }];
  return Object.entries(state.payerAmounts)
    .map(([memberId, text]) => ({ memberId, amount: parseTyped(text, state.currency) ?? 0 }))
    .filter((p) => p.amount > 0);
}
