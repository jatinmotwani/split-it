import { z } from 'zod';
import { isCurrencyCode, MAX_AMOUNT } from '@/lib/money/currency';

export const id = z.uuid();
export const currency = z.string().refine(isCurrencyCode, 'Unknown currency code.');
export const minor = z.int().min(0).max(MAX_AMOUNT);
/** Signed minor units (balances, adjustments). */
export const signedMinor = z.int().min(-MAX_AMOUNT).max(MAX_AMOUNT);
export const isoDate = z.iso.date();
export const displayName = z
  .string()
  .trim()
  .min(1, 'Add a name.')
  .max(40, 'Keep names under 40 characters.');

export type Balance = { currency: string; net: number };
