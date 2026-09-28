import { describe, expect, it } from 'vitest';
import type { EntryDto } from '@/lib/contracts/entries';
import { mergeEntries } from './entry-writes';

const entry = (id: string, date: string, extra: Partial<EntryDto> = {}): EntryDto => ({
  id,
  groupId: 'g',
  kind: 'expense',
  description: id,
  category: null,
  amount: 100,
  currency: 'INR',
  date,
  notes: null,
  split: { type: 'equal', participants: ['a'] },
  payers: [{ memberId: 'a', amount: 100 }],
  shares: [{ memberId: 'a', amount: 100 }],
  settlementMethod: null,
  version: 1,
  createdByMemberId: 'a',
  updatedByMemberId: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
});

describe('mergeEntries', () => {
  const list = [entry('02', '2026-09-28'), entry('01', '2026-09-27')];

  it('returns the list untouched when nothing is pending', () => {
    expect(mergeEntries(list, [])).toBe(list);
  });

  it('adds new entries in server order: newest date, then newest id', () => {
    const merged = mergeEntries(list, [entry('03', '2026-09-27'), entry('04', '2026-09-29')]);
    expect(merged.map((e) => e.id)).toEqual(['04', '02', '03', '01']);
  });

  it('replaces an edited entry and drops a deleted one', () => {
    const merged = mergeEntries(list, [
      entry('01', '2026-09-27', { description: 'edited' }),
      entry('02', '2026-09-28', { deletedAt: '2026-09-28T10:00:00Z' }),
    ]);
    expect(merged.map((e) => [e.id, e.description])).toEqual([['01', 'edited']]);
  });
});
