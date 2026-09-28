import { z } from 'zod';
import type { Balance } from './common';

export type MemberBalances = { memberId: string; balances: Balance[] };

export type TransferDto = { currency: string; from: string; to: string; amount: number };

export type BalancesResponse = {
  simplifyDebts: boolean;
  members: MemberBalances[];
  /** Settle-up plan from the active view; applying all of it zeroes everyone. */
  suggestions: TransferDto[];
};

export const explainQuery = z.union([
  z.object({ a: z.uuid(), b: z.uuid() }),
  z.object({ member: z.uuid() }),
]);

type RowMeta = {
  entryId: string;
  description: string;
  date: string;
  kind: string;
  currency: string;
};

/** Raw view: "why does b owe a?" amount > 0 means b owes a from that entry. */
export type ExplainPairResponse = {
  view: 'pair';
  a: string;
  b: string;
  rows: (RowMeta & { amount: number })[];
  totals: { currency: string; amount: number }[];
};

/** Simplified view: "why is my balance what it is?" */
export type ExplainNetResponse = {
  view: 'net';
  member: string;
  rows: (RowMeta & { paid: number; owed: number; net: number })[];
  totals: Balance[];
};

export type ExplainResponse = ExplainPairResponse | ExplainNetResponse;

/** What the add-expense form starts with, from my last entry in this group. */
export type EntryDefaults = {
  payerIds: string[];
  splitType: string;
  participantIds: string[];
  currency: string;
  category: string | null;
} | null;
