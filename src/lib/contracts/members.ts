import { z } from 'zod';
import { displayName, type Balance } from './common';

export const addMemberBody = z.object({ displayName });

export type ClaimLinkResponse = { token: string; path: string; expiresAt: string };

export type ClaimPreview = {
  groupName: string;
  displayName: string;
  /** The spot belongs to a guest who lost their session (D3). */
  reclaim: boolean;
  alreadyMember: boolean;
};

export type ClaimResponse = { groupId: string; memberId: string };

export type MemberHasBalance = { balances: Balance[] };
