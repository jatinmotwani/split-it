import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FriendScreen } from '@/features/friends/friend-screen';
import { requirePageMembership } from '@/server/pages';
import { listFriends } from '@/server/services/core/friends';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Friend' };

/** A friend, addressed by our 1:1 group. */
export default async function FriendPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/friends/${gid}`);
  if (membership.group.type !== 'direct') notFound();
  const [group, friends] = await Promise.all([
    getGroupDetail(membership, user.id),
    listFriends(user.id),
  ]);
  return <FriendScreen directGroup={group} initialFriends={friends} />;
}
