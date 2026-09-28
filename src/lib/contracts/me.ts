import { z } from 'zod';

export const meResponse = z.object({
  id: z.string(),
  name: z.string(),
  /** null for guests (their placeholder address is never shown). */
  email: z.string().nullable(),
  isGuest: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponse>;
