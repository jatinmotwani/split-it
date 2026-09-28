import { index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, tstz } from './columns';
import { groupMembers, groups } from './groups';
import { entries } from './ledger';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    authorMemberId: uuid('author_member_id')
      .notNull()
      .references(() => groupMembers.id),
    body: varchar('body', { length: 1000 }).notNull(),
    deletedAt: tstz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('comments_entry_idx').on(t.entryId, t.createdAt)],
);

export type ActivityKind =
  | 'group_created'
  | 'group_updated'
  | 'entry_created'
  | 'entry_updated'
  | 'entry_deleted'
  | 'entry_restored'
  | 'settlement_recorded'
  | 'member_added'
  | 'member_joined'
  | 'member_claimed'
  | 'member_reclaimed'
  | 'member_unlinked'
  | 'member_removed'
  | 'member_left'
  | 'invite_rotated'
  | 'comment_added';

/** Written in the same transaction as the change it describes. */
export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey(), // UUIDv7, so ids sort by time
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    actorMemberId: uuid('actor_member_id').references(() => groupMembers.id),
    kind: varchar('kind', { length: 32 }).$type<ActivityKind>().notNull(),
    entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_group_idx').on(t.groupId, t.id.desc())],
);
