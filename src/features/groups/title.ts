import type { GroupDetail, MemberDto } from '@/lib/contracts/groups';

/** The other person in a 1:1 group. */
export function friendOf(group: GroupDetail): MemberDto | undefined {
  if (group.type !== 'direct') return undefined;
  return group.members.find((m) => !m.isMe && m.active) ?? group.members.find((m) => !m.isMe);
}

/** What to call a group on screen: its name, or the friend's name for a 1:1 group. */
export function groupTitle(group: GroupDetail): string {
  return friendOf(group)?.displayName ?? group.name;
}
