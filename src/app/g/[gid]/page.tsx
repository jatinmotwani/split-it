import type { Metadata } from 'next';
import { GroupPageClient } from '@/features/group/group-page-client';
import { requirePageMembership } from '@/server/pages';
import { getBalances } from '@/server/services/core/balances';
import { listEntries } from '@/server/services/core/entry-lifecycle';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Group' };

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ gid: string }>;
  searchParams: Promise<{ explain?: string }>;
}) {
  const [{ gid }, { explain }] = await Promise.all([params, searchParams]);
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}`);
  const [group, balances, entries] = await Promise.all([
    getGroupDetail(membership, user.id),
    getBalances(membership),
    listEntries(gid, { limit: 50 }),
  ]);
  // ?explain=<member id> opens that person's "Why?" sheet (linked from a friend's page).
  const explaining = group.members.some((m) => m.id === explain) ? explain! : null;
  return (
    <GroupPageClient gid={gid} initial={{ group, balances, entries }} initialExplain={explaining} />
  );
}
