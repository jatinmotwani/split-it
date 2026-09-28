import type { Metadata } from 'next';
import { ActivityScreen } from '@/features/activity/activity-screen';
import { requirePageMembership } from '@/server/pages';
import { listActivity } from '@/server/services/core/entry-lifecycle';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/activity`);
  const [group, page] = await Promise.all([
    getGroupDetail(membership, user.id),
    listActivity(gid, { limit: 30 }),
  ]);
  return <ActivityScreen gid={gid} initialGroup={group} initialPage={page} />;
}
