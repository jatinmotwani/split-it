// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MemberDto } from '@/lib/contracts/groups';
import { SplitSheet } from './split-sheet';
import type { ExpenseFormState } from './use-expense-form';

beforeAll(() => {
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const members: MemberDto[] = [
  { id: 'a', displayName: 'Asha', role: 'owner', status: 'guest', isMe: true, active: true },
  { id: 'r', displayName: 'Ravi', role: 'member', status: 'guest', isMe: false, active: true },
];

function Harness({ initial }: { initial: Partial<ExpenseFormState> }) {
  const [state, setState] = useState<ExpenseFormState>({
    expr: '1000',
    description: '',
    currency: 'INR',
    date: '2026-09-28',
    category: null,
    categoryPicked: false,
    payerMode: 'single',
    payerId: 'a',
    payerAmounts: {},
    splitMode: 'equal',
    participants: ['a', 'r'],
    exact: {},
    percent: {},
    shares: {},
    ...initial,
  });
  return (
    <SplitSheet
      open
      onClose={() => {}}
      state={state}
      update={(p) => setState((s) => ({ ...s, ...p }))}
      amount={100_000}
      members={members}
      seed="seed"
    />
  );
}

describe('SplitSheet', () => {
  afterEach(cleanup);

  it('shows each person’s equal share and toggles people', () => {
    render(<Harness initial={{}} />);
    expect(screen.getAllByText('₹500.00')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ravi/ }));
    expect(screen.getByText('₹1,000.00')).toBeTruthy();
    expect(screen.getByText('Adds up to ₹1,000.00')).toBeTruthy();
  });

  it('shows what is left in exact mode as you type', () => {
    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exact' }));
    expect(screen.getByText('Adds up to ₹1,000.00')).toBeTruthy(); // prefilled equal amounts
    fireEvent.change(screen.getByLabelText('Ravi'), { target: { value: '300' } });
    expect(screen.getByText('₹200.00 left to split.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('You'), { target: { value: '800' } });
    expect(screen.getByText('₹100.00 too much in the split.')).toBeTruthy();
  });
});
