'use client';

import type { EntryDefaults } from '@/lib/contracts/balances';
import type { EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { ExpenseForm } from './expense-form';

/** The add/edit screen; the split editor and other extras plug in here. */
export function ExpenseFormScreen(props: {
  group: GroupDetail;
  defaults: EntryDefaults;
  entry?: EntryDto;
}) {
  return <ExpenseForm {...props} />;
}
