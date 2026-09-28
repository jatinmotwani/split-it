'use client';

import { GroupScreen, type GroupScreenProps } from './group-screen';

/** Wires the group screen's slots; later features (invite, explain) plug in here. */
export function GroupPageClient(props: Pick<GroupScreenProps, 'gid' | 'initial'>) {
  return <GroupScreen {...props} />;
}
