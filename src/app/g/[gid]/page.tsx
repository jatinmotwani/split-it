import type { Metadata } from 'next';
import { GroupPageClient } from '@/features/group/group-page-client';
import { requirePageMembership } from '@/server/pages';
import { getBalances } from '@/server/services/core/balances';
import { listEntries } from '@/server/services/core/entry-lifecycle';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Group' };

export default async function GroupPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}`);
  const [group, balances, entries] = await Promise.all([
    getGroupDetail(membership, user.id),
    getBalances(membership),
    listEntries(gid, { limit: 50 }),
  ]);
  return <GroupPageClient gid={gid} initial={{ group, balances, entries }} />;
}
