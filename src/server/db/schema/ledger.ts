import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { SplitInput } from '@/lib/money/splits';
import { createdAt, currencyCode, money, tstz, updatedAt } from './columns';
import { groupMembers, groups } from './groups';

export const entryKind = pgEnum('entry_kind', ['expense', 'settlement', 'opening_balance']);
export const splitType = pgEnum('split_type', [
  'equal',
  'exact',
  'percentage',
  'shares',
  'adjustment',
  'itemized',
  'imported_net',
]);
export const entrySource = pgEnum('entry_source', ['app', 'splitwise_import', 'recurring']);
export const settlementMethod = pgEnum('settlement_method', ['cash', 'upi', 'bank', 'other']);
export const revisionReason = pgEnum('revision_reason', ['edit', 'delete', 'restore', 'conflict']);

export const entries = pgTable(
  'entries',
  {
    /** Client-generated UUIDv7; also the rounding seed. */
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    kind: entryKind('kind').notNull(),
    description: varchar('description', { length: 120 }).notNull(),
    category: varchar('category', { length: 32 }),
    amount: money('amount').notNull(),
    currency: currencyCode('currency').notNull(),
    /** Phase 3: set only when a user explicitly converts an expense. */
    originalAmount: money('original_amount'),
    originalCurrency: currencyCode('original_currency'),
    fxRate: numeric('fx_rate', { precision: 20, scale: 10 }),
    fxDate: date('fx_date'),
    fxSource: text('fx_source'),
    /** Calendar date as the user sees it (no time zone). */
    date: date('date').notNull(),
    notes: varchar('notes', { length: 1000 }),
    splitType: splitType('split_type').notNull(),
    /** Canonical, versioned input; entry_payers/entry_shares are computed from it. */
    splitInput: jsonb('split_input').$type<SplitInput>().notNull(),
    settlementMethod: settlementMethod('settlement_method'),
    createdByMemberId: uuid('created_by_member_id')
      .notNull()
      .references(() => groupMembers.id),
    updatedByMemberId: uuid('updated_by_member_id').references(() => groupMembers.id),
    source: entrySource('source').notNull().default('app'),
    importId: uuid('import_id'),
    importRowHash: text('import_row_hash'),
    recurringRuleId: uuid('recurring_rule_id'),
    recurringPeriod: text('recurring_period'),
    version: integer('version').notNull().default(1),
    deletedAt: tstz('deleted_at'),
    deletedByMemberId: uuid('deleted_by_member_id').references(() => groupMembers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('entries_group_live_date_idx').on(t.groupId, t.deletedAt, t.date.desc(), t.id.desc()),
    index('entries_group_creator_idx').on(t.groupId, t.createdByMemberId, t.createdAt.desc()),
    uniqueIndex('entries_import_row_uq')
      .on(t.groupId, t.importRowHash)
      .where(sql`${t.importRowHash} IS NOT NULL`),
    uniqueIndex('entries_recurring_period_uq')
      .on(t.recurringRuleId, t.recurringPeriod)
      .where(sql`${t.recurringRuleId} IS NOT NULL`),
    check('entries_amount_ck', sql`${t.amount} >= 0`),
    check('entries_currency_ck', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'entries_settlement_method_ck',
      sql`(${t.kind} = 'settlement') OR (${t.settlementMethod} IS NULL)`,
    ),
    check('entries_version_ck', sql`${t.version} >= 1`),
  ],
);

export const entryPayers = pgTable(
  'entry_payers',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => groupMembers.id),
    amount: money('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.memberId] }),
    index('entry_payers_member_idx').on(t.memberId),
    check('entry_payers_amount_ck', sql`${t.amount} >= 0`),
  ],
);

export const entryShares = pgTable(
  'entry_shares',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => groupMembers.id),
    amount: money('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.memberId] }),
    index('entry_shares_member_idx').on(t.memberId),
    check('entry_shares_amount_ck', sql`${t.amount} >= 0`),
  ],
);

export type EntrySnapshot = {
  kind: string;
  description: string;
  category: string | null;
  amount: number;
  currency: string;
  date: string;
  notes: string | null;
  splitType: string;
  splitInput: SplitInput;
  settlementMethod: string | null;
  deletedAt: string | null;
  payers: { memberId: string; amount: number }[];
  shares: { memberId: string; amount: number }[];
};

export const entryRevisions = pgTable(
  'entry_revisions',
  {
    id: uuid('id').primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** The version this snapshot captured (the one that was replaced). */
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<EntrySnapshot>().notNull(),
    reason: revisionReason('reason').notNull(),
    actorMemberId: uuid('actor_member_id').references(() => groupMembers.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('entry_revisions_entry_version_uq').on(t.entryId, t.version)],
);
