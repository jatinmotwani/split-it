import { z } from 'zod';
import { currency, displayName, id, type Balance } from './common';

export const GROUP_TYPES = ['trip', 'home', 'couple', 'other'] as const;
export const groupType = z.enum(GROUP_TYPES);
export type GroupType = z.infer<typeof groupType>;

export const groupName = z
  .string()
  .trim()
  .min(1, 'Name the group.')
  .max(60, 'Keep it under 60 characters.');

export const createGroupBody = z.object({
  id,
  name: groupName,
  type: groupType,
  defaultCurrency: currency,
  /** Your name in this group; defaults to your account name. */
  displayName: displayName.optional(),
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;

export const updateGroupBody = z
  .object({
    name: groupName,
    type: groupType,
    defaultCurrency: currency,
    simplifyDebts: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export type UpdateGroupBody = z.infer<typeof updateGroupBody>;

export type MemberStatus = 'placeholder' | 'guest' | 'account';

export type MemberDto = {
  id: string;
  displayName: string;
  role: 'owner' | 'member';
  status: MemberStatus;
  isMe: boolean;
};

export type GroupSummary = {
  id: string;
  name: string;
  type: GroupType | 'direct';
  defaultCurrency: string;
  lastActivityAt: string;
  memberCount: number;
  myMemberId: string;
  /** My net per currency; zero balances omitted. */
  balances: Balance[];
};

export type GroupsResponse = { groups: GroupSummary[]; totals: Balance[] };

export type GroupDetail = {
  id: string;
  name: string;
  type: GroupType | 'direct';
  defaultCurrency: string;
  simplifyDebts: boolean;
  inviteCode: string;
  myMemberId: string;
  myRole: 'owner' | 'member';
  members: MemberDto[];
};
