import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { ExpenseFormScreen } from '@/features/expense/expense-form-screen';
import { getDb } from '@/server/db';
import { requirePageMembership } from '@/server/pages';
import { loadEntry } from '@/server/services/core/entries';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Edit expense' };

export default async function EditEntryPage({
  params,
}: {
  params: Promise<{ gid: string; eid: string }>;
}) {
  const { gid, eid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/e/${eid}/edit`);
  if (!isUuid(eid)) notFound();
  const entry = await loadEntry(getDb(), gid, eid).catch(() => null);
  if (!entry) notFound();
  if (entry.kind === 'settlement') redirect(`/g/${gid}/settle?edit=${eid}`);
  const group = await getGroupDetail(membership, user.id);
  return <ExpenseFormScreen group={group} defaults={null} entry={entry} />;
}
