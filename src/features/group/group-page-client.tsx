'use client';

import { InviteButton } from '@/features/invite/invite-sheet';
import { GroupScreen, type GroupScreenProps } from './group-screen';
import { useGroup } from './use-group-data';

/** Wires the group screen's slots; later features (explain) plug in here. */
export function GroupPageClient(props: Pick<GroupScreenProps, 'gid' | 'initial'>) {
  const { data: group } = useGroup(props.gid, props.initial.group);
  return <GroupScreen {...props} inviteAction={<InviteButton group={group} />} />;
}
