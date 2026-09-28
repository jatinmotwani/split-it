import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AddCommentBody, CommentDto } from '@/lib/contracts/comments';
import { getDb } from '@/server/db';
import { comments } from '@/server/db/schema';
import { conflict, forbidden, notFound } from '@/server/http/errors';
import { recordActivity } from './activity';
import type { Membership } from './authz';
import { loadEntry } from './entries';

type CommentRow = typeof comments.$inferSelect;

const toDto = (c: CommentRow): CommentDto => ({
  id: c.id,
  entryId: c.entryId,
  authorMemberId: c.authorMemberId,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
});

/** Live comments on an entry, oldest first. */
export async function listComments({ group }: Membership, entryId: string): Promise<CommentDto[]> {
  const db = getDb();
  await loadEntry(db, group.id, entryId); // 404 unless the entry is in this group
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.entryId, entryId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return rows.map(toDto);
}

/** Adds a comment. Idempotent on the client id: a retry returns the comment already saved. */
export async function addComment(
  { member, group }: Membership,
  entryId: string,
  input: AddCommentBody,
): Promise<CommentDto> {
  const db = getDb();
  const entry = await loadEntry(db, group.id, entryId);
  const [existing] = await db.select().from(comments).where(eq(comments.id, input.id));
  if (existing) {
    if (existing.entryId !== entryId || existing.authorMemberId !== member.id) {
      throw conflict('id_taken', 'That comment id is already in use.');
    }
    return toDto(existing);
  }
  const row = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(comments)
      .values({
        id: input.id,
        groupId: group.id,
        entryId,
        authorMemberId: member.id,
        body: input.body,
      })
      .returning();
    await recordActivity(tx, {
      groupId: group.id,
      actorMemberId: member.id,
      kind: 'comment_added',
      entryId,
      data: { description: entry.description },
    });
    return c!;
  });
  return toDto(row);
}

/** Soft delete by its author or the group owner. */
export async function deleteComment(
  { member, group }: Membership,
  entryId: string,
  commentId: string,
): Promise<{ ok: true }> {
  const db = getDb();
  const [c] = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.entryId, entryId),
        eq(comments.groupId, group.id),
        isNull(comments.deletedAt),
      ),
    );
  if (!c) throw notFound('That comment isn’t here any more.');
  if (c.authorMemberId !== member.id && member.role !== 'owner') {
    throw forbidden('Only the person who wrote it can delete this comment.');
  }
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, c.id));
  return { ok: true };
}
