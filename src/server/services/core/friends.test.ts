import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddFriendResponse, FriendsResponse } from '@/lib/contracts/friends';
import type { GroupsResponse } from '@/lib/contracts/groups';
import type { ClaimLinkResponse } from '@/lib/contracts/members';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { makeGroup, makeMember } from '../../../../test/factories';
import { ctx, jsonRequest, readJson, signInGuest, type TestUser } from '../../../../test/helpers';
import { expenseBody, put, tripScenario } from '../../../../test/scenario';
import { POST as claimRoute } from '../../../app/api/v1/claims/[token]/route';
import { GET as friendsGet, POST as friendsPost } from '../../../app/api/v1/friends/route';
import { POST as claimLinkRoute } from '../../../app/api/v1/groups/[gid]/members/[mid]/claim-link/route';
import { POST as addMemberRoute } from '../../../app/api/v1/groups/[gid]/members/route';
import { PATCH as patchGroup } from '../../../app/api/v1/groups/[gid]/route';
import { GET as groupsGet } from '../../../app/api/v1/groups/route';
import type { Db } from '../../db';
import { groups } from '../../db/schema';

describe('friends', () => {
  let db: Db;
  let close: () => Promise<void>;
  let s: Awaited<ReturnType<typeof tripScenario>>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    s = await tripScenario(db);
  });
  afterAll(async () => close());

  const add = (me: TestUser, body: Record<string, unknown>) =>
    friendsPost(jsonRequest('/api/v1/friends', { method: 'POST', cookie: me.cookie, body }));
  const friends = (me: TestUser) =>
    friendsGet(jsonRequest('/api/v1/friends', { cookie: me.cookie })).then((r) =>
      readJson<FriendsResponse>(r),
    );
  const home = (me: TestUser) =>
    groupsGet(jsonRequest('/api/v1/groups', { cookie: me.cookie })).then((r) =>
      readJson<GroupsResponse>(r),
    );

  let kiran: AddFriendResponse;

  it('adds a friend by name: a hidden 1:1 group with a placeholder', async () => {
    const id = uuidv7();
    const res = await add(s.asha, { id, name: 'Kiran', currency: 'INR' });
    expect(res.status).toBe(201);
    kiran = await readJson<AddFriendResponse>(res);
    expect(kiran.groupId).toBe(id);

    // A retry with the same id returns the same friend.
    const again = await readJson<AddFriendResponse>(
      await add(s.asha, { id, name: 'Kiran', currency: 'INR' }),
    );
    expect(again).toEqual(kiran);

    const list = await friends(s.asha);
    expect(list.friends).toEqual([
      {
        groupId: id,
        friendMemberId: kiran.friendMemberId,
        name: 'Kiran',
        status: 'placeholder',
        balances: [],
        groups: [{ groupId: id, name: null, friendMemberId: kiran.friendMemberId, balances: [] }],
      },
    ]);
    expect((await home(s.asha)).groups.map((g) => g.id)).not.toContain(id);
  });

  it('a 1:1 expense shows in the friend balance and the Home totals', async () => {
    const [me] = (await home(s.asha)).groups; // Goa trip
    expect(me).toBeDefined();
    const detail = await db.select().from(groups).where(eq(groups.id, kiran.groupId));
    expect(detail[0]?.type).toBe('direct');
    const members = await db.query.groupMembers.findMany({
      where: (m, { eq: e }) => e(m.groupId, kiran.groupId),
    });
    const mine = members.find((m) => m.id !== kiran.friendMemberId)!;
    await put(
      s.asha,
      kiran.groupId,
      uuidv7(),
      expenseBody({
        amount: 30_000,
        payer: mine.id,
        participants: [mine.id, kiran.friendMemberId],
      }),
    );
    expect((await friends(s.asha)).friends[0]?.balances).toEqual([
      { currency: 'INR', net: 15_000 },
    ]);
    expect((await home(s.asha)).totals).toEqual([{ currency: 'INR', net: 15_000 }]);
  });

  it('adds a co-member once, by account; candidates come from my groups', async () => {
    const before = await friends(s.asha);
    expect(before.candidates.map((c) => c.displayName).sort()).toEqual(['Neel', 'Ravi']);

    const first = await readJson<AddFriendResponse>(
      await add(s.asha, { id: uuidv7(), memberId: s.R, currency: 'INR' }),
    );
    const second = await readJson<AddFriendResponse>(
      await add(s.asha, { id: uuidv7(), memberId: s.R, currency: 'INR' }),
    );
    expect(second).toEqual(first);
    const [g] = await db.select().from(groups).where(eq(groups.id, first.groupId));
    expect(g?.directKey).toBe([s.asha.id, s.raviUser.id].sort().join(':'));

    const after = await friends(s.asha);
    expect(after.candidates.map((c) => c.displayName)).toEqual(['Neel']);
    expect(after.friends.map((f) => f.name).sort()).toEqual(['Kiran', 'Ravi']);
    // Ravi sees Asha as a friend too.
    expect((await friends(s.raviUser)).friends.map((f) => f.groupId)).toContain(first.groupId);
  });

  it('sums a friend balance over every shared group, each in its active view (D4)', async () => {
    const ravi = (await friends(s.asha)).friends.find((f) => f.name === 'Ravi')!;
    // Goa trip (simplified): Asha pays ₹900 for all three → Ravi and Neel each owe Asha ₹300.
    await put(
      s.asha,
      s.groupId,
      uuidv7(),
      expenseBody({ amount: 90_000, payer: s.A, participants: [s.A, s.R, s.N] }),
    );
    // 1:1: Ravi pays ₹200, split equally → Asha owes Ravi ₹100.
    const members = await db.query.groupMembers.findMany({
      where: (m, { eq: e }) => e(m.groupId, ravi.groupId),
    });
    const ashaThere = members.find((m) => m.id !== ravi.friendMemberId)!;
    await put(
      s.raviUser,
      ravi.groupId,
      uuidv7(),
      expenseBody({
        amount: 20_000,
        payer: ravi.friendMemberId,
        participants: [ashaThere.id, ravi.friendMemberId],
      }),
    );
    const after = (await friends(s.asha)).friends.find((f) => f.name === 'Ravi')!;
    expect(after.balances).toEqual([{ currency: 'INR', net: 20_000 }]);
    expect(after.groups).toEqual([
      {
        groupId: ravi.groupId,
        name: null,
        friendMemberId: ravi.friendMemberId,
        balances: [{ currency: 'INR', net: -10_000 }],
      },
      {
        groupId: s.groupId,
        name: 'Goa trip',
        friendMemberId: s.R,
        balances: [{ currency: 'INR', net: 30_000 }],
      },
    ]);
    // Ravi sees the mirror image.
    const mirror = (await friends(s.raviUser)).friends.find((f) => f.name === 'Asha')!;
    expect(mirror.balances).toEqual([{ currency: 'INR', net: -20_000 }]);
  });

  it('refuses people from groups I’m not in, and myself', async () => {
    const stranger = await signInGuest('Stranger');
    const other = await makeGroup(db, { ownerUserId: stranger.id });
    const theirs = await makeMember(db, other.group.id, { displayName: 'Zed' });
    expect((await add(s.asha, { id: uuidv7(), memberId: theirs.id, currency: 'INR' })).status).toBe(
      404,
    );
    expect((await add(s.asha, { id: uuidv7(), memberId: s.A, currency: 'INR' })).status).toBe(409);
  });

  it('keeps a 1:1 group to two people and out of invites', async () => {
    const res = await addMemberRoute(
      jsonRequest('/x', { method: 'POST', cookie: s.asha.cookie, body: { displayName: 'Third' } }),
      ctx({ gid: kiran.groupId }),
    );
    expect(res.status).toBe(409);
    const patch = await patchGroup(
      jsonRequest('/x', { method: 'PATCH', cookie: s.asha.cookie, body: { type: 'trip' } }),
      ctx({ gid: kiran.groupId }),
    );
    expect(patch.status).toBe(409);
  });

  it('claiming the placeholder sets the direct key', async () => {
    const link = await readJson<ClaimLinkResponse>(
      await claimLinkRoute(
        jsonRequest('/x', { method: 'POST', cookie: s.asha.cookie }),
        ctx({ gid: kiran.groupId, mid: kiran.friendMemberId }),
      ),
    );
    const kiranUser = await signInGuest('Kiran');
    const claimed = await claimRoute(
      jsonRequest('/x', { method: 'POST', cookie: kiranUser.cookie }),
      ctx({ token: link.token }),
    );
    expect(claimed.status).toBe(200);
    const [g] = await db.select().from(groups).where(eq(groups.id, kiran.groupId));
    expect(g?.directKey).toBe([s.asha.id, kiranUser.id].sort().join(':'));
    expect((await friends(kiranUser)).friends).toEqual([
      expect.objectContaining({
        groupId: kiran.groupId,
        name: 'Asha',
        balances: [{ currency: 'INR', net: -15_000 }],
      }),
    ]);
  });
});
