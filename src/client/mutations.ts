import { uuidv7 } from '@/lib/ids';
import { api, type ApiOptions } from './api';
import { noteWrite } from './recent-writes';

export type Mutation = {
  /** Unique per user action; doubles as the Idempotency-Key so a retry never applies twice. */
  id?: string;
  method: NonNullable<ApiOptions['method']>;
  path: string;
  body?: unknown;
};

/**
 * Every write goes through here (ARCHITECTURE §9). Today it sends immediately; the Phase 3
 * offline outbox replaces this function without changing callers.
 */
export async function sendMutation<T>(m: Mutation): Promise<T> {
  const res = await api<T>(m.path, {
    method: m.method,
    body: m.body,
    idempotencyKey: m.id ?? uuidv7(),
  });
  noteWrite(m.path);
  return res;
}
