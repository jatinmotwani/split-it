// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExplainNetResponse, ExplainPairResponse } from '@/lib/contracts/balances';
import { ExplainView, explainRows, routingLines, totalsOf } from './explain-view';

const pair: ExplainPairResponse = {
  view: 'pair',
  a: 'asha',
  b: 'neel',
  rows: [
    {
      entryId: 'e1',
      description: 'Dinner',
      date: '2026-09-28',
      kind: 'expense',
      currency: 'INR',
      amount: 30_000,
    },
    {
      entryId: 'e2',
      description: 'Cab',
      date: '2026-09-28',
      kind: 'expense',
      currency: 'INR',
      amount: -10_000,
    },
  ],
  totals: [{ currency: 'INR', amount: 20_000 }],
};

const net: ExplainNetResponse = {
  view: 'net',
  member: 'neel',
  rows: [
    {
      entryId: 'e1',
      description: 'Dinner',
      date: '2026-09-28',
      kind: 'expense',
      currency: 'INR',
      paid: 0,
      owed: 30_000,
      net: -30_000,
    },
    {
      entryId: 'e3',
      description: 'Cab',
      date: '2026-09-28',
      kind: 'expense',
      currency: 'INR',
      paid: 0,
      owed: 30_000,
      net: -30_000,
    },
  ],
  totals: [{ currency: 'INR', net: -60_000 }],
};

const name = (id: string) => ({ asha: 'You', ravi: 'Ravi', neel: 'Neel' })[id] ?? id;

describe('explain view', () => {
  afterEach(cleanup);

  it('rows add up to the balance being explained', () => {
    expect(totalsOf(explainRows(pair))).toEqual([{ currency: 'INR', amount: 20_000 }]);
    expect(totalsOf(explainRows(net))).toEqual([{ currency: 'INR', amount: -60_000 }]);
  });

  it('shows the routing line only in the simplified view', () => {
    const routing = routingLines(
      'neel',
      [{ currency: 'INR', from: 'neel', to: 'asha', amount: 60_000 }],
      name,
    );
    expect(routing).toEqual(['Neel pays You ₹600']);

    render(<ExplainView gid="g" data={net} simplified routing={routing} subject="Neel" />);
    expect(screen.getByText(/Simplify debts routes Neel’s balance/)).toBeTruthy();
    expect(screen.getByText('-₹600.00')).toBeTruthy();
    cleanup();

    render(<ExplainView gid="g" data={pair} simplified={false} routing={routing} subject="Neel" />);
    expect(screen.queryByText(/Simplify debts routes/)).toBeNull();
    expect(screen.getByText('+₹200.00')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Dinner/ }).getAttribute('href')).toBe('/g/g/e/e1');
  });
});
