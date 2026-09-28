import { z } from 'zod';
import { currency, displayName, id, type Balance } from './common';
import type { MemberStatus } from './groups';

/** Add a friend: someone from one of my groups, or a new person by name. */
export const addFriendBody = z.union([
  z.object({ id, memberId: id, currency }),
  z.object({ id, name: displayName, currency }),
]);
export type AddFriendBody = z.infer<typeof addFriendBody>;

export type AddFriendResponse = { groupId: string; friendMemberId: string };

export type FriendSummary = {
  /** The 1:1 group with this friend. */
  groupId: string;
  friendMemberId: string;
  name: string;
  status: MemberStatus;
  /** My balance with this friend, per currency; zero omitted. */
  balances: Balance[];
};

/** Someone from my groups I could add as a friend. */
export type FriendCandidate = {
  memberId: string;
  displayName: string;
  groupName: string;
  status: MemberStatus;
};

export type FriendsResponse = { friends: FriendSummary[]; candidates: FriendCandidate[] };
