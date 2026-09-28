// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BalancesResponse } from '@/lib/contracts/balances';
import type { EntriesPage, EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { renderWithQuery } from '../../../test/render';
import { GroupScreen } from './group-screen';

const A = '01928f3a-0000-7000-8000-00000000000a';
const R = '01928f3a-0000-7000-8000-00000000000b';
const N = '01928f3a-0000-7000-8000-00000000000c';
const gid = '01928f3a-0000-7000-8000-0000000000aa';

const group: GroupDetail = {
  id: gid,
  name: 'Goa trip',
  type: 'trip',
  defaultCurrency: 'INR',
  simplifyDebts: true,
  inviteCode: 'x'.repeat(22),
  myMemberId: A,
  myRole: 'owner',
  members: [
    { id: A, displayName: 'Asha', role: 'owner', status: 'guest', isMe: true, active: true },
    { id: R, displayName: 'Ravi', role: 'member', status: 'guest', isMe: false, active: true },
    {
      id: N,
      displayName: 'Neel',
      role: 'member',
      status: 'placeholder',
      isMe: false,
      active: true,
    },
  ],
};

function entry(o: Partial<EntryDto>): EntryDto {
  return {
    id: '01928f3a-0000-7000-8000-000000000001',
    groupId: gid,
    kind: 'expense',
    description: 'Dinner',
    category: null,
    amount: 90_000,
    currency: 'INR',
    date: '2026-09-28',
    notes: null,
    split: { type: 'equal', participants: [A, R, N] },
    payers: [{ memberId: A, amount: 90_000 }],
    shares: [A, R, N].map((memberId) => ({ memberId, amount: 30_000 })),
    settlementMethod: null,
    version: 1,
    createdByMemberId: A,
    updatedByMemberId: null,
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-09-28T10:00:00Z',
    deletedAt: null,
    ...o,
  };
}

const balances: BalancesResponse = {
  simplifyDebts: true,
  members: [
    { memberId: A, balances: [{ currency: 'INR', net: 60_000 }] },
    { memberId: R, balances: [] },
    { memberId: N, balances: [{ currency: 'INR', net: -60_000 }] },
  ],
  suggestions: [{ currency: 'INR', from: N, to: A, amount: 60_000 }],
};

const entries: EntriesPage = {
  entries: [
    entry({}),
    entry({
      id: '01928f3a-0000-7000-8000-000000000002',
      description: 'Cab',
      amount: 60_000,
      payers: [{ memberId: R, amount: 60_000 }],
      shares: [R, N].map((memberId) => ({ memberId, amount: 30_000 })),
    }),
  ],
  nextCursor: null,
};

describe('GroupScreen', () => {
  afterEach(cleanup);

  it('shows my position, balances, suggestions and entries with my part in each', () => {
    renderWithQuery(<GroupScreen gid={gid} initial={{ group, balances, entries }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeTruthy();
    expect(screen.getByText('You’re owed ₹600')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settle up/ })).toBeTruthy();

    const balancesSection = screen.getByRole('region', { name: 'Balances' });
    expect(within(balancesSection).getByText('Neel')).toBeTruthy();
    expect(within(balancesSection).getByText('owes ₹600')).toBeTruthy();
    expect(within(balancesSection).getByText(/Neel → You ₹600/)).toBeTruthy();

    const dinner = screen.getByRole('link', { name: /Dinner/ });
    expect(dinner.textContent).toContain('You paid ₹900');
    expect(dinner.textContent).toContain('you lent₹600');
    const cab = screen.getByRole('link', { name: /Cab/ });
    expect(cab.textContent).toContain('not involved');
  });

  it('shows the empty state for a new group', () => {
    renderWithQuery(
      <GroupScreen
        gid={gid}
        initial={{
          group,
          balances: { simplifyDebts: true, members: [], suggestions: [] },
          entries: { entries: [], nextCursor: null },
        }}
      />,
    );
    expect(screen.getByText('You’re all settled up')).toBeTruthy();
    expect(screen.getByText('No expenses yet')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Settle up/ })).toBeNull();
  });
});
