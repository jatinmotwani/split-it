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

/** What's between me and a friend in one shared group (their active view). */
export type FriendGroupBalance = {
  groupId: string;
  /** Null for our 1:1 group. */
  name: string | null;
  /** The friend's spot in that group. */
  friendMemberId: string;
  /** Positive: they owe me. Zero omitted. */
  balances: Balance[];
};

export type FriendSummary = {
  /** The 1:1 group with this friend. */
  groupId: string;
  friendMemberId: string;
  name: string;
  status: MemberStatus;
  /** Σ over shared groups (D4), per currency; positive: they owe me. Zero omitted. */
  balances: Balance[];
  /** The 1:1 group first if it has a balance or not; other groups only when non-zero. */
  groups: FriendGroupBalance[];
};

/** Someone from my groups I could add as a friend. */
export type FriendCandidate = {
  memberId: string;
  displayName: string;
  groupName: string;
  status: MemberStatus;
};

export type FriendsResponse = { friends: FriendSummary[]; candidates: FriendCandidate[] };
