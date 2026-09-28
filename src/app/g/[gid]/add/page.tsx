import type { Metadata } from 'next';
import { ExpenseFormScreen } from '@/features/expense/expense-form-screen';
import { requirePageMembership } from '@/server/pages';
import { entryDefaults } from '@/server/services/core/balances';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Add expense' };

export default async function AddExpensePage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/add`);
  const [group, defaults] = await Promise.all([
    getGroupDetail(membership, user.id),
    entryDefaults(membership),
  ]);
  return <ExpenseFormScreen group={group} defaults={defaults} />;
}
