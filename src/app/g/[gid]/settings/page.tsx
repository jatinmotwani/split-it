import type { Metadata } from 'next';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { requirePageMembership } from '@/server/pages';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Group settings' };

export default async function SettingsPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/settings`);
  const group = await getGroupDetail(membership, user.id);
  return <SettingsScreen gid={gid} initialGroup={group} />;
}
