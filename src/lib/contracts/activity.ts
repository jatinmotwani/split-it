import { z } from 'zod';

export const activityQuery = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityDto = {
  id: string;
  kind: string;
  actorMemberId: string | null;
  entryId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};

export type ActivityPage = { items: ActivityDto[]; nextCursor: string | null };
