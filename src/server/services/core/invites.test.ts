import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GroupDetail } from '@/lib/contracts/groups';
import type { InvitePreview, JoinResponse } from '@/lib/contracts/invites';
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
import { GET as getGroup } from '../../../app/api/v1/groups/[gid]/route';
import { POST as rotate } from '../../../app/api/v1/groups/[gid]/invite/rotate/route';
import { POST as createGroupRoute } from '../../../app/api/v1/groups/route';
import { POST as joinRoute } from '../../../app/api/v1/invites/[code]/join/route';
import { GET as previewRoute } from '../../../app/api/v1/invites/[code]/route';
import type { Db } from '../../db';
import { groupMembers } from '../../db/schema';

let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

describe('invites', () => {
  let db: Db;
  let close: () => Promise<void>;
  let asha: TestUser;
  let group: GroupDetail;

  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    asha = await signInGuest('Asha');
    group = await readJson<GroupDetail>(
      await createGroupRoute(
        jsonRequest('/api/v1/groups', {
          method: 'POST',
          cookie: asha.cookie,
          body: { id: uuidv7(), name: 'Goa trip', type: 'trip', defaultCurrency: 'INR' },
        }),
      ),
    );
  });
  afterAll(async () => close());

  const preview = (code: string, cookie?: string) =>
    previewRoute(
      jsonRequest(`/api/v1/invites/${code}`, { cookie, headers: { 'x-forwarded-for': freshIp() } }),
      ctx({ code }),
    );
  const join = (code: string, me: TestUser, body: unknown, ip = freshIp()) =>
    joinRoute(
      jsonRequest(`/api/v1/invites/${code}/join`, {
        method: 'POST',
        body,
        cookie: me.cookie,
        headers: { 'x-forwarded-for': ip },
      }),
      ctx({ code }),
    );

  it('previews the group to anyone with the link', async () => {
    const res = await preview(group.inviteCode);
    expect(res.status).toBe(200);
    expect(await readJson<InvitePreview>(res)).toEqual({
      groupId: group.id,
      name: 'Goa trip',
      type: 'trip',
      members: [{ id: group.myMemberId, displayName: 'Asha', joined: true }],
      alreadyMember: false,
    });
    expect(
      (await readJson<InvitePreview>(await preview(group.inviteCode, asha.cookie))).alreadyMember,
    ).toBe(true);
    expect((await preview('does-not-exist-000')).status).toBe(404);
  });

  it('joins as a new member, idempotently', async () => {
    const ravi = await signInGuest('Ravi');
    const first = await readJson<JoinResponse>(
      await join(group.inviteCode, ravi, { displayName: 'Ravi' }),
    );
    const again = await readJson<JoinResponse>(
      await join(group.inviteCode, ravi, { displayName: 'Ravi K' }),
    );
    expect(again).toEqual(first);
    const detail = await readJson<GroupDetail>(
      await getGroup(jsonRequest('/x', { cookie: ravi.cookie }), ctx({ gid: group.id })),
    );
    expect(detail.members.map((m) => [m.displayName, m.status])).toEqual([
      ['Asha', 'guest'],
      ['Ravi', 'guest'],
    ]);
  });

  it('claims a placeholder once; a second claim is a conflict', async () => {
    const neelSpot = await makeMember(db, group.id, { displayName: 'Neel' });
    const neel = await signInGuest('Neel');
    const res = await join(group.inviteCode, neel, { claimMemberId: neelSpot.id });
    expect(await readJson<JoinResponse>(res)).toEqual({ groupId: group.id, memberId: neelSpot.id });

    const imposter = await signInGuest('Not Neel');
    const again = await join(group.inviteCode, imposter, { claimMemberId: neelSpot.id });
    expect(again.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(again)).error.code).toBe('already_claimed');
  });

  it('only the owner can rotate, and the old link stops working', async () => {
    const outsider = await signInGuest('Kabir');
    await join(group.inviteCode, outsider, { displayName: 'Kabir' });
    const denied = await rotate(
      jsonRequest('/x', { method: 'POST', cookie: outsider.cookie }),
      ctx({ gid: group.id }),
    );
    expect(denied.status).toBe(403);

    const old = group.inviteCode;
    const res = await rotate(
      jsonRequest('/x', { method: 'POST', cookie: asha.cookie }),
      ctx({ gid: group.id }),
    );
    const { inviteCode } = await readJson<{ inviteCode: string }>(res);
    expect(inviteCode).not.toBe(old);
    expect((await preview(old)).status).toBe(404);
    expect((await preview(inviteCode)).status).toBe(200);
    group = { ...group, inviteCode };
  });

  it('rate-limits joins per IP', async () => {
    // Freeze the clock mid-minute so all 11 requests land in one fixed window.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-28T10:00:05Z') });
    const ip = '203.0.113.9';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const u = await signInGuest(`Spammer ${i}`);
      statuses.push((await join(group.inviteCode, u, { displayName: `S${i}` }, ip)).status);
    }
    vi.useRealTimers();
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('linking a guest to an account moves their groups', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
  });
  afterAll(async () => close());

  const newGroup = (me: TestUser, name: string) =>
    createGroupRoute(
      jsonRequest('/api/v1/groups', {
        method: 'POST',
        cookie: me.cookie,
        body: { id: uuidv7(), name, type: 'other', defaultCurrency: 'INR' },
      }),
    ).then((r) => readJson<GroupDetail>(r));

  it('moves spots, and turns a clashing spot back into a placeholder', async () => {
    // Priya already has an account and a group; on her phone she used the app as a guest.
    const priyaAccount = await signInEmail('priya-link@example.in', 'Priya');
    const shared = await newGroup(priyaAccount, 'Shared flat');
    const guest = await signInGuest('Priya (phone)');
    const guestOnly = await newGroup(guest, 'Phone-only group');
    const guestSpotInShared = await makeMember(db, shared.id, {
      userId: guest.id,
      displayName: 'Priya phone',
    });

    // The guest now signs in with the same email.
    const linked = await signInEmail('priya-link@example.in', undefined, guest.cookie);
    expect(linked.id).toBe(priyaAccount.id);

    const [moved] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, guestOnly.myMemberId));
    expect(moved!.userId).toBe(priyaAccount.id);
    const [clashed] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, guestSpotInShared.id));
    expect(clashed).toMatchObject({ userId: null, displayName: 'Priya phone (guest)' });
  });
});
