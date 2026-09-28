import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GroupDetail, GroupsResponse } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { makeMember } from '../../../../test/factories';
import {
  ctx,
  jsonRequest,
  readJson,
  signInEmail,
  signInGuest,
  type TestUser,
} from '../../../../test/helpers';
import { GET as getGroup, PATCH as patchGroup } from '../../../app/api/v1/groups/[gid]/route';
import { GET as listGroups, POST as createGroupRoute } from '../../../app/api/v1/groups/route';
import type { Db } from '../../db';
import { entries, entryPayers, entryShares } from '../../db/schema';

describe('groups API', () => {
  let db: Db;
  let close: () => Promise<void>;
  let asha: TestUser;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    asha = await signInGuest('Asha');
  });
  afterAll(async () => close());

  const create = (me: TestUser, body: Record<string, unknown>) =>
    createGroupRoute(jsonRequest('/api/v1/groups', { method: 'POST', body, cookie: me.cookie }));

  it('lets a guest create a group and become its owner', async () => {
    const id = uuidv7();
    const res = await create(asha, { id, name: 'Goa trip', type: 'trip', defaultCurrency: 'INR' });
    expect(res.status).toBe(201);
    const g = await readJson<GroupDetail>(res);
    expect(g).toMatchObject({
      id,
      name: 'Goa trip',
      type: 'trip',
      defaultCurrency: 'INR',
      simplifyDebts: true,
      myRole: 'owner',
    });
    expect(g.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(g.members).toEqual([
      {
        id: g.myMemberId,
        displayName: 'Asha',
        role: 'owner',
        status: 'guest',
        isMe: true,
        active: true,
      },
    ]);
  });

  it('is idempotent on the group id, and rejects someone else reusing it', async () => {
    const id = uuidv7();
    const body = {
      id,
      name: 'Flat 4B',
      type: 'home',
      defaultCurrency: 'INR',
      displayName: 'Asha M',
    };
    const first = await readJson<GroupDetail>(await create(asha, body));
    const second = await readJson<GroupDetail>(await create(asha, body));
    expect(second).toEqual(first);
    const ravi = await signInGuest('Ravi');
    expect((await create(ravi, body)).status).toBe(409);
  });

  it('validates input', async () => {
    const res = await create(asha, {
      id: uuidv7(),
      name: '  ',
      type: 'party',
      defaultCurrency: 'XYZ',
    });
    expect(res.status).toBe(400);
    const paths = (
      await readJson<{ error: { details: { path: string }[] } }>(res)
    ).error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'type', 'defaultCurrency']));
  });

  it('lists my groups by recent activity with my balance per currency', async () => {
    const neel = await signInEmail('neel-groups@example.in', 'Neel');
    const older = await readJson<GroupDetail>(
      await create(neel, { id: uuidv7(), name: 'Older', type: 'other', defaultCurrency: 'INR' }),
    );
    const newer = await readJson<GroupDetail>(
      await create(neel, { id: uuidv7(), name: 'Newer', type: 'trip', defaultCurrency: 'THB' }),
    );
    // Neel paid ₹900 in "Older", split with a placeholder friend: Neel is owed ₹450.
    const friend = await makeMember(db, older.id, { displayName: 'Friend' });
    const entryId = uuidv7();
    await db.insert(entries).values({
      id: entryId,
      groupId: older.id,
      kind: 'expense',
      description: 'Dinner',
      amount: 90_000,
      currency: 'INR',
      date: '2026-09-28',
      splitType: 'equal',
      splitInput: { type: 'equal', participants: [older.myMemberId, friend.id] },
      createdByMemberId: older.myMemberId,
    });
    await db.insert(entryPayers).values({ entryId, memberId: older.myMemberId, amount: 90_000 });
    await db.insert(entryShares).values([
      { entryId, memberId: older.myMemberId, amount: 45_000 },
      { entryId, memberId: friend.id, amount: 45_000 },
    ]);

    const list = await readJson<GroupsResponse>(
      await listGroups(jsonRequest('/api/v1/groups', { cookie: neel.cookie })),
    );
    expect(list.groups.map((g) => g.name)).toEqual(['Newer', 'Older']);
    expect(list.groups[1]).toMatchObject({
      memberCount: 2,
      balances: [{ currency: 'INR', net: 45_000 }],
    });
    expect(list.groups[0]!.balances).toEqual([]);
    expect(list.totals).toEqual([{ currency: 'INR', net: 45_000 }]);
    expect(newer.defaultCurrency).toBe('THB');
  });

  it('shows the group to members and updates settings', async () => {
    const g = await readJson<GroupDetail>(
      await create(asha, { id: uuidv7(), name: 'Couple', type: 'couple', defaultCurrency: 'INR' }),
    );
    const got = await getGroup(
      jsonRequest(`/api/v1/groups/${g.id}`, { cookie: asha.cookie }),
      ctx({ gid: g.id }),
    );
    expect((await readJson<GroupDetail>(got)).name).toBe('Couple');

    const patched = await patchGroup(
      jsonRequest(`/api/v1/groups/${g.id}`, {
        method: 'PATCH',
        body: { name: 'Us two', simplifyDebts: false },
        cookie: asha.cookie,
      }),
      ctx({ gid: g.id }),
    );
    expect(await readJson<GroupDetail>(patched)).toMatchObject({
      name: 'Us two',
      simplifyDebts: false,
    });

    const empty = await patchGroup(
      jsonRequest(`/api/v1/groups/${g.id}`, { method: 'PATCH', body: {}, cookie: asha.cookie }),
      ctx({ gid: g.id }),
    );
    expect(empty.status).toBe(400);
  });
});
