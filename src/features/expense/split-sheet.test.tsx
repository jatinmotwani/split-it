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
    adjust: {},
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

  it('adjustment mode: shows the equal remainder, then catches a negative share', () => {
    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    // Ravi pays ₹200 more: ₹800 is split equally, then Ravi gets +₹200.
    fireEvent.change(screen.getByLabelText('Ravi adjustment'), { target: { value: '200' } });
    expect(screen.getByText('₹800.00 split equally between 2 people, then adjusted.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /You/ }).textContent).toContain('₹400.00');
    expect(screen.getByRole('checkbox', { name: /Ravi/ }).textContent).toContain('₹600.00');
    expect(screen.getByText('Adds up to ₹1,000.00')).toBeTruthy();

    // You take ₹1,200 off: ₹2,000 split is ₹1,000 each, and yours would be −₹200.
    fireEvent.change(screen.getByLabelText('You adjustment'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make your adjustment negative' }));
    expect(screen.getByText('An adjustment takes someone ₹200.00 below zero.')).toBeTruthy();

    // Adjustments over the total are caught before that.
    fireEvent.click(screen.getByRole('button', { name: 'Make your adjustment positive' }));
    expect(screen.getByText('Adjustments are ₹400.00 more than the total.')).toBeTruthy();
  });
});
