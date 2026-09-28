import { z } from 'zod';
import { isCategory } from '@/lib/categories';
import type { SplitInput } from '@/lib/money/splits';
import { currency, id, isoDate, minor, signedMinor } from './common';

const memberIds = z.array(id).min(1, 'Pick at least one person.').max(100);

export const splitInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equal'), participants: memberIds }),
  z.object({ type: z.literal('exact'), amounts: z.record(id, minor) }),
  z.object({ type: z.literal('percentage'), bps: z.record(id, z.int().min(0).max(10_000)) }),
  z.object({ type: z.literal('shares'), weights: z.record(id, z.int().min(0).max(1_000_000)) }),
  z.object({
    type: z.literal('adjustment'),
    participants: memberIds,
    adjustments: z.record(id, signedMinor),
  }),
  z.object({
    type: z.literal('itemized'),
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          name: z.string().trim().min(1).max(80),
          amount: minor,
          assignees: z
            .array(z.object({ memberId: id, weight: z.int().min(1).max(1_000) }))
            .min(1)
            .max(100),
        }),
      )
      .min(1)
      .max(100),
    extras: z
      .array(
        z.object({
          kind: z.enum(['tax', 'service', 'tip', 'discount']),
          name: z.string().trim().max(40).optional(),
          amount: minor,
        }),
      )
      .max(10),
  }),
]);

export const SETTLEMENT_METHODS = ['cash', 'upi', 'bank', 'other'] as const;

export const upsertEntryBody = z.object({
  kind: z.enum(['expense', 'settlement']),
  description: z.string().trim().min(1, 'Add a description.').max(120),
  category: z.string().refine(isCategory, 'Unknown category.').nullable().optional(),
  amount: minor.refine((n) => n > 0, 'Enter an amount above zero.'),
  currency,
  date: isoDate,
  notes: z.string().trim().max(1000).nullable().optional(),
  payers: z
    .array(z.object({ memberId: id, amount: minor }))
    .min(1)
    .max(100),
  split: splitInput,
  settlementMethod: z.enum(SETTLEMENT_METHODS).nullable().optional(),
  /** The version this edit started from; omit when creating. */
  baseVersion: z.int().min(1).nullable().optional(),
});
export type UpsertEntryBody = z.infer<typeof upsertEntryBody>;

export type Leg = { memberId: string; amount: number };

export type EntryDto = {
  id: string;
  groupId: string;
  kind: 'expense' | 'settlement' | 'opening_balance';
  description: string;
  category: string | null;
  amount: number;
  currency: string;
  date: string;
  notes: string | null;
  split: SplitInput;
  payers: Leg[];
  shares: Leg[];
  settlementMethod: (typeof SETTLEMENT_METHODS)[number] | null;
  version: number;
  createdByMemberId: string;
  updatedByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** PUT response: `conflict` is true when this save replaced someone else's newer edit. */
export type SaveEntryResponse = { entry: EntryDto; conflict: boolean; unchanged: boolean };

export const listEntriesQuery = z.object({
  /** Cursor from the previous page: "<date>_<id>". */
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EntriesPage = { entries: EntryDto[]; nextCursor: string | null };

export type RevisionDto = {
  version: number;
  reason: 'edit' | 'delete' | 'restore' | 'conflict';
  actorMemberId: string | null;
  createdAt: string;
  snapshot: {
    kind: string;
    description: string;
    category: string | null;
    amount: number;
    currency: string;
    date: string;
    notes: string | null;
    split: SplitInput;
    settlementMethod: string | null;
    deleted: boolean;
    payers: Leg[];
    shares: Leg[];
  };
};

export const restoreQuery = z.object({ version: z.coerce.number().int().min(1).optional() });
