import { bigint, char, timestamp } from 'drizzle-orm/pg-core';

/** Money: bigint minor units, read as a JS number. Always pass through assertMinor at boundaries. */
export const money = (name: string) => bigint(name, { mode: 'number' });
export const currencyCode = (name: string) => char(name, { length: 3 });
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const createdAt = () => tstz('created_at').notNull().defaultNow();
export const updatedAt = () => tstz('updated_at').notNull().defaultNow();
