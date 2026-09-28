import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createdAt, currencyCode, tstz, updatedAt } from './columns';

export const groupType = pgEnum('group_type', ['trip', 'home', 'couple', 'other', 'direct']);
export const memberRole = pgEnum('member_role', ['owner', 'member']);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 60 }).notNull(),
    type: groupType('type').notNull().default('other'),
    defaultCurrency: currencyCode('default_currency').notNull().default('INR'),
    simplifyDebts: boolean('simplify_debts').notNull().default(true),
    /** 128-bit random, base64url. Stored raw so members can re-share it; owners can rotate it. */
    inviteCode: text('invite_code').notNull(),
    inviteExpiresAt: tstz('invite_expires_at'),
    /** type = 'direct' only: "userA:userB" (sorted) once both members are real users. */
    directKey: text('direct_key'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    lastActivityAt: tstz('last_activity_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('groups_invite_code_uq').on(t.inviteCode),
    uniqueIndex('groups_direct_key_uq')
      .on(t.directKey)
      .where(sql`${t.directKey} IS NOT NULL`),
    check('groups_currency_ck', sql`${t.defaultCurrency} ~ '^[A-Z]{3}$'`),
  ],
);

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    /** null = placeholder ("Ravi — not joined yet"); an anonymous user = guest. */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    displayName: varchar('display_name', { length: 40 }).notNull(),
    role: memberRole('role').notNull().default('member'),
    /** sha256 of a single-use claim token. */
    claimTokenHash: text('claim_token_hash'),
    claimTokenExpiresAt: tstz('claim_token_expires_at'),
    joinedAt: tstz('joined_at'),
    /** Soft removal, only at zero balance; ledger rows keep pointing here. */
    removedAt: tstz('removed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('group_members_group_idx').on(t.groupId),
    index('group_members_user_idx').on(t.userId),
    uniqueIndex('group_members_active_user_uq')
      .on(t.groupId, t.userId)
      .where(sql`${t.userId} IS NOT NULL AND ${t.removedAt} IS NULL`),
    uniqueIndex('group_members_claim_token_uq')
      .on(t.claimTokenHash)
      .where(sql`${t.claimTokenHash} IS NOT NULL`),
  ],
);
