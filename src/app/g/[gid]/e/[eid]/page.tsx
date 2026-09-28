import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { EntryDetail } from '@/features/entry/entry-detail';
import { getDb } from '@/server/db';
import { requirePageMembership } from '@/server/pages';
import { listComments } from '@/server/services/core/comments';
import { loadEntry } from '@/server/services/core/entries';
import { listRevisions } from '@/server/services/core/entry-lifecycle';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Expense' };

export default async function EntryPage({
  params,
}: {
  params: Promise<{ gid: string; eid: string }>;
}) {
  const { gid, eid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/e/${eid}`);
  if (!isUuid(eid)) notFound();
  const [group, entry, revisions, comments] = await Promise.all([
    getGroupDetail(membership, user.id),
    loadEntry(getDb(), gid, eid).catch(() => null),
    listRevisions(gid, eid).catch(() => []),
    listComments(membership, eid).catch(() => []),
  ]);
  if (!entry) notFound();
  return (
    <EntryDetail
      group={group}
      initialEntry={entry}
      initialRevisions={revisions}
      initialComments={comments}
    />
  );
}
