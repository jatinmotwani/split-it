import type { GroupDetail } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { POST as createGroupRoute } from '@/app/api/v1/groups/route';
import { PUT as putEntry } from '@/app/api/v1/groups/[gid]/entries/[eid]/route';
import type { Db } from '@/server/db';
import { makeMember } from './factories';
import { ctx, jsonRequest, readJson, signInGuest, type TestUser } from './helpers';

/** Asha (owner, guest session), Ravi (guest session) and Neel (placeholder) in "Goa trip". */
export async function tripScenario(db: Db) {
  const asha = await signInGuest('Asha');
  const g = await readJson<GroupDetail>(
    await createGroupRoute(
      jsonRequest('/api/v1/groups', {
        method: 'POST',
        cookie: asha.cookie,
        body: { id: uuidv7(), name: 'Goa trip', type: 'trip', defaultCurrency: 'INR' },
      }),
    ),
  );
  const raviUser = await signInGuest('Ravi');
  const ravi = await makeMember(db, g.id, { userId: raviUser.id, displayName: 'Ravi' });
  const neel = await makeMember(db, g.id, { displayName: 'Neel' });
  return { asha, raviUser, groupId: g.id, A: g.myMemberId, R: ravi.id, N: neel.id };
}

export function put(
  me: TestUser,
  gid: string,
  eid: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return putEntry(
    jsonRequest(`/api/v1/groups/${gid}/entries/${eid}`, {
      method: 'PUT',
      body,
      cookie: me.cookie,
      headers,
    }),
    ctx({ gid, eid }),
  );
}

export function expenseBody(o: {
  amount: number;
  payer: string;
  participants: string[];
  description?: string;
  currency?: string;
  date?: string;
  baseVersion?: number;
}) {
  return {
    kind: 'expense',
    description: o.description ?? 'Dinner',
    amount: o.amount,
    currency: o.currency ?? 'INR',
    date: o.date ?? '2026-09-28',
    payers: [{ memberId: o.payer, amount: o.amount }],
    split: { type: 'equal', participants: o.participants },
    ...(o.baseVersion ? { baseVersion: o.baseVersion } : {}),
  };
}
