import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { listMyGroups } from '@/server/services/core/groups';

/** The global "+": straight to the add form of the group I used last (SPEC §7 Phase 1). */
export default async function AddPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  const { lastUsedGroupId } = await listMyGroups(user.id);
  redirect(lastUsedGroupId ? `/g/${lastUsedGroupId}/add` : '/?new=1');
}
