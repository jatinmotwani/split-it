import { z } from 'zod';
import { displayName, id } from './common';
import type { GroupType } from './groups';

export type InvitePreview = {
  groupId: string;
  name: string;
  type: GroupType | 'direct';
  members: { id: string; displayName: string; joined: boolean }[];
  /** True when the signed-in caller already has a spot here. */
  alreadyMember: boolean;
};

export const joinBody = z.union([z.object({ displayName }), z.object({ claimMemberId: id })]);
export type JoinBody = z.infer<typeof joinBody>;

export type JoinResponse = { groupId: string; memberId: string };
