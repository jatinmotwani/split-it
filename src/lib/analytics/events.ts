import { z } from 'zod';

/**
 * Product events (SPEC §12, §9.6). Properties are ids, counts and enums only: never names,
 * descriptions, emails or amounts typed by users. Unknown events or properties are dropped.
 */
const currency = z.string().regex(/^[A-Z]{3}$/);

export const EVENT_SCHEMAS = {
  group_created: z.strictObject({ groupType: z.string().max(16), currency }),
  member_joined: z.strictObject({
    asGuest: z.boolean(),
    via: z.enum(['invite', 'claim', 'create']),
  }),
  expense_added: z.strictObject({
    splitType: z.string().max(16),
    payerCount: z.int().min(1).max(100),
    shareCount: z.int().min(0).max(100),
    currency,
    isGroupCurrency: z.boolean(),
  }),
  settlement_recorded: z.strictObject({ method: z.enum(['cash', 'upi', 'bank', 'other']) }),
  claim_link_opened: z.strictObject({ reclaim: z.boolean() }),
  import_completed: z.strictObject({ rows: z.int().min(0), verified: z.boolean() }),
  wrapped_viewed: z.strictObject({}),
  wrapped_shared: z.strictObject({}),
  install_prompt_shown: z.strictObject({}),
  install_prompt_accepted: z.strictObject({}),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventProps<E extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[E]>;

/** Events a browser may send to /api/events (everything else is server-side only). */
export const CLIENT_EVENTS = new Set<EventName>([
  'wrapped_viewed',
  'wrapped_shared',
  'install_prompt_shown',
  'install_prompt_accepted',
]);
