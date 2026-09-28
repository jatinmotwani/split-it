import { z } from 'zod';
import { id } from './common';

export const COMMENT_MAX = 1000;

export const addCommentBody = z.object({
  /** Client-generated UUIDv7, so a retried post never adds the comment twice. */
  id,
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(COMMENT_MAX, 'Keep it under 1,000 characters.'),
});
export type AddCommentBody = z.infer<typeof addCommentBody>;

export type CommentDto = {
  id: string;
  entryId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
};

export type CommentsResponse = { comments: CommentDto[] };
