import { describe, expect, it } from 'vitest';
import type { EntryDto, RevisionDto } from '@/lib/contracts/entries';
import { buildHistory, describeChanges, snapshotOfEntry } from './history';

const entry: EntryDto = {
  id: 'e',
  groupId: 'g',
  kind: 'expense',
  description: 'Cab + tolls',
  category: null,
  amount: 25_000,
  currency: 'INR',
  date: '2026-09-28',
  notes: null,
  split: { type: 'equal', participants: ['a', 'r'] },
  payers: [{ memberId: 'r', amount: 25_000 }],
  shares: [
    { memberId: 'a', amount: 12_500 },
    { memberId: 'r', amount: 12_500 },
  ],
  settlementMethod: null,
  version: 2,
  createdByMemberId: 'a',
  updatedByMemberId: 'r',
  createdAt: '2026-09-28T10:00:00Z',
  updatedAt: '2026-09-28T11:00:00Z',
  deletedAt: null,
};

const v1: RevisionDto = {
  version: 1,
  reason: 'edit',
  actorMemberId: 'r',
  createdAt: '2026-09-28T11:00:00Z',
  snapshot: {
    ...snapshotOfEntry(entry),
    description: 'Cab',
    amount: 10_000,
    payers: [{ memberId: 'a', amount: 10_000 }],
    shares: [
      { memberId: 'a', amount: 5_000 },
      { memberId: 'r', amount: 5_000 },
    ],
  },
};

describe('entry history', () => {
  it('describes what changed', () => {
    expect(describeChanges(v1.snapshot, snapshotOfEntry(entry))).toEqual([
      'Amount ₹100.00 → ₹250.00',
      'Description “Cab” → “Cab + tolls”',
      'Who paid changed',
      'Split changed',
    ]);
  });

  it('lists changes newest first, ending with creation', () => {
    const h = buildHistory(entry, [v1]);
    expect(h.map((i) => [i.version, i.reason, i.actorMemberId, i.restorable])).toEqual([
      [2, 'edit', 'r', 1],
      [1, 'created', 'a', null],
    ]);
  });

  it('shows deletion and restore', () => {
    const deleted = { ...entry, deletedAt: '2026-09-28T12:00:00Z', version: 3 };
    const v2: RevisionDto = {
      version: 2,
      reason: 'delete',
      actorMemberId: 'a',
      createdAt: '2026-09-28T12:00:00Z',
      snapshot: snapshotOfEntry(entry),
    };
    const h = buildHistory(deleted, [v2, v1]);
    expect(h[0]).toMatchObject({
      version: 3,
      reason: 'delete',
      changes: ['Deleted'],
      restorable: null,
    });
  });
});
