import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  BalancesResponse,
  EntryDefaults,
  ExplainNetResponse,
  ExplainPairResponse,
} from '@/lib/contracts/balances';
import type { GroupsResponse } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { ctx, jsonRequest, readJson, signInGuest } from '../../../../test/helpers';
import { expenseBody, put, tripScenario } from '../../../../test/scenario';
import { GET as balancesRoute } from '../../../app/api/v1/groups/[gid]/balances/route';
import { GET as defaultsRoute } from '../../../app/api/v1/groups/[gid]/defaults/route';
import { GET as explainRoute } from '../../../app/api/v1/groups/[gid]/explain/route';
import { PATCH as patchGroup } from '../../../app/api/v1/groups/[gid]/route';
import { GET as listGroups } from '../../../app/api/v1/groups/route';
import type { Db } from '../../db';

describe('balances and explain (the D4 example)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let s: Awaited<ReturnType<typeof tripScenario>>;
  let dinnerId: string;
  let cabId: string;

  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    s = await tripScenario(db);
    dinnerId = uuidv7();
    cabId = uuidv7();
    await put(
      s.asha,
      s.groupId,
      dinnerId,
      expenseBody({
        amount: 90_000,
        payer: s.A,
        participants: [s.A, s.R, s.N],
        description: 'Dinner',
      }),
    );
    await put(
      s.raviUser,
      s.groupId,
      cabId,
      expenseBody({ amount: 60_000, payer: s.R, participants: [s.R, s.N], description: 'Cab' }),
    );
  });
  afterAll(async () => close());

  const balances = () =>
    balancesRoute(jsonRequest('/x', { cookie: s.asha.cookie }), ctx({ gid: s.groupId })).then((r) =>
      readJson<BalancesResponse>(r),
    );
  const explain = (q: string) =>
    explainRoute(jsonRequest(`/x?${q}`, { cookie: s.asha.cookie }), ctx({ gid: s.groupId }));

  it('shows nets per member and a simplified plan by default', async () => {
    const b = await balances();
    const net = (id: string) => b.members.find((m) => m.memberId === id)!.balances;
    expect(net(s.A)).toEqual([{ currency: 'INR', net: 60_000 }]);
    expect(net(s.R)).toEqual([]);
    expect(net(s.N)).toEqual([{ currency: 'INR', net: -60_000 }]);
    expect(b.suggestions).toEqual([{ currency: 'INR', from: s.N, to: s.A, amount: 60_000 }]);
  });

  it('switches to the raw person-to-person plan when simplify is off', async () => {
    await patchGroup(
      jsonRequest('/x', { method: 'PATCH', body: { simplifyDebts: false }, cookie: s.asha.cookie }),
      ctx({ gid: s.groupId }),
    );
    const b = await balances();
    expect(b.simplifyDebts).toBe(false);
    expect(b.suggestions).toHaveLength(3);
    await patchGroup(
      jsonRequest('/x', { method: 'PATCH', body: { simplifyDebts: true }, cookie: s.asha.cookie }),
      ctx({ gid: s.groupId }),
    );
  });

  it('explains a pair with entry rows that add up', async () => {
    const e = await readJson<ExplainPairResponse>(await explain(`a=${s.A}&b=${s.N}`));
    expect(e.rows).toEqual([
      {
        entryId: dinnerId,
        description: 'Dinner',
        date: '2026-09-28',
        kind: 'expense',
        currency: 'INR',
        amount: 30_000,
      },
    ]);
    expect(e.totals).toEqual([{ currency: 'INR', amount: 30_000 }]);
  });

  it('explains a net for the simplified view', async () => {
    const e = await readJson<ExplainNetResponse>(await explain(`member=${s.N}`));
    expect(e.rows.map((r) => [r.description, r.net])).toEqual([
      ['Dinner', -30_000],
      ['Cab', -30_000],
    ]);
    expect(e.totals).toEqual([{ currency: 'INR', net: -60_000 }]);
  });

  it('404s explain for people outside the group, 400s a bad query', async () => {
    expect((await explain(`member=${uuidv7()}`)).status).toBe(404);
    expect((await explain('a=1')).status).toBe(400);
  });

  it('derives form defaults and the last-used group', async () => {
    const { defaults } = await readJson<{ defaults: EntryDefaults }>(
      await defaultsRoute(
        jsonRequest('/x', { cookie: s.raviUser.cookie }),
        ctx({ gid: s.groupId }),
      ),
    );
    expect(defaults).toEqual({
      payerIds: [s.R],
      splitType: 'equal',
      participantIds: [s.R, s.N],
      currency: 'INR',
      category: null,
    });

    const fresh = await signInGuest('Fresh');
    const none = await readJson<GroupsResponse>(
      await listGroups(jsonRequest('/x', { cookie: fresh.cookie })),
    );
    expect(none.lastUsedGroupId).toBeNull();
    const mine = await readJson<GroupsResponse>(
      await listGroups(jsonRequest('/x', { cookie: s.raviUser.cookie })),
    );
    expect(mine.lastUsedGroupId).toBe(s.groupId);
  });
});
