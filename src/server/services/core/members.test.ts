import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GroupDetail, MemberDto } from '@/lib/contracts/groups';
import type { ClaimLinkResponse, ClaimPreview } from '@/lib/contracts/members';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { addEntry, makeMember } from '../../../../test/factories';
import {
  ctx,
  jsonRequest,
  readJson,
  signInEmail,
  signInGuest,
  type TestUser,
} from '../../../../test/helpers';
import {
  GET as previewClaimRoute,
  POST as claimRoute,
} from '../../../app/api/v1/claims/[token]/route';
import { POST as claimLinkRoute } from '../../../app/api/v1/groups/[gid]/members/[mid]/claim-link/route';
import { DELETE as removeRoute } from '../../../app/api/v1/groups/[gid]/members/[mid]/route';
import { POST as unlinkRoute } from '../../../app/api/v1/groups/[gid]/members/[mid]/unlink/route';
import { POST as addMemberRoute } from '../../../app/api/v1/groups/[gid]/members/route';
import { GET as getGroup } from '../../../app/api/v1/groups/[gid]/route';
import { POST as createGroupRoute } from '../../../app/api/v1/groups/route';
import type { Db } from '../../db';
import { activity, groupMembers } from '../../db/schema';

let ip = 0;
const headers = () => ({ 'x-forwarded-for': `10.9.${Math.floor(++ip / 250)}.${ip % 250}` });

describe('members', () => {
  let db: Db;
  let close: () => Promise<void>;
  let asha: TestUser;
  let g: GroupDetail;

  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    asha = await signInGuest('Asha');
    g = await readJson<GroupDetail>(
      await createGroupRoute(
        jsonRequest('/api/v1/groups', {
          method: 'POST',
          cookie: asha.cookie,
          body: { id: uuidv7(), name: 'Flat 4B', type: 'home', defaultCurrency: 'INR' },
        }),
      ),
    );
  });
  afterAll(async () => close());

  const addPlaceholder = async (name: string) =>
    readJson<MemberDto>(
      await addMemberRoute(
        jsonRequest('/x', { method: 'POST', body: { displayName: name }, cookie: asha.cookie }),
        ctx({ gid: g.id }),
      ),
    );
  const mintLink = (me: TestUser, mid: string) =>
    claimLinkRoute(
      jsonRequest('/x', { method: 'POST', cookie: me.cookie }),
      ctx({ gid: g.id, mid }),
    );
  const claim = (me: TestUser, token: string) =>
    claimRoute(
      jsonRequest(`/api/v1/claims/${token}`, {
        method: 'POST',
        cookie: me.cookie,
        headers: headers(),
      }),
      ctx({ token }),
    );
  const remove = (me: TestUser, mid: string) =>
    removeRoute(
      jsonRequest('/x', { method: 'DELETE', cookie: me.cookie }),
      ctx({ gid: g.id, mid }),
    );

  it('adds a placeholder and lets them claim it with a single-use link', async () => {
    const ravi = await addPlaceholder('Ravi');
    expect(ravi).toMatchObject({ displayName: 'Ravi', status: 'placeholder' });

    const link = await readJson<ClaimLinkResponse>(await mintLink(asha, ravi.id));
    expect(link.path).toBe(`/c/${link.token}`);

    const preview = await readJson<ClaimPreview>(
      await previewClaimRoute(
        jsonRequest(`/api/v1/claims/${link.token}`, { headers: headers() }),
        ctx({ token: link.token }),
      ),
    );
    expect(preview).toEqual({
      groupId: g.id,
      groupName: 'Flat 4B',
      displayName: 'Ravi',
      reclaim: false,
      alreadyMember: false,
    });

    const raviUser = await signInGuest('Ravi');
    expect((await claim(raviUser, link.token)).status).toBe(200);
    expect((await claim(await signInGuest('Other'), link.token)).status).toBe(404);

    const detail = await readJson<GroupDetail>(
      await getGroup(jsonRequest('/x', { cookie: raviUser.cookie }), ctx({ gid: g.id })),
    );
    expect(detail.members.find((m) => m.id === ravi.id)).toMatchObject({
      status: 'guest',
      isMe: true,
    });
  });

  it('lets a guest get back in on a new device, but never takes over an account (D3)', async () => {
    const neel = await signInGuest('Neel');
    const neelSpot = await makeMember(db, g.id, { userId: neel.id, displayName: 'Neel' });
    const link = await readJson<ClaimLinkResponse>(await mintLink(asha, neelSpot.id));
    const newPhone = await signInGuest('Neel');
    expect((await claim(newPhone, link.token)).status).toBe(200);
    const [row] = await db.select().from(groupMembers).where(eq(groupMembers.id, neelSpot.id));
    expect(row!.userId).toBe(newPhone.id);
    const kinds = (
      await db.select({ kind: activity.kind }).from(activity).where(eq(activity.groupId, g.id))
    ).map((a) => a.kind);
    expect(kinds).toContain('member_reclaimed');

    const priya = await signInEmail('priya-members@example.in', 'Priya');
    const priyaSpot = await makeMember(db, g.id, { userId: priya.id, displayName: 'Priya' });
    const denied = await mintLink(asha, priyaSpot.id);
    expect(denied.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(denied)).error.code).toBe(
      'claim_not_allowed',
    );
  });

  it('refuses a claim by someone already in the group under another name', async () => {
    const kabir = await addPlaceholder('Kabir');
    const link = await readJson<ClaimLinkResponse>(await mintLink(asha, kabir.id));
    const res = await claim(asha, link.token);
    expect(res.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('already_member');
  });

  it('removes people only at zero balance, and only the owner removes others', async () => {
    const meera = await addPlaceholder('Meera');
    await addEntry(db, {
      groupId: g.id,
      createdBy: g.myMemberId,
      payers: [{ memberId: g.myMemberId, amount: 50_000 }],
      shares: [{ memberId: meera.id, amount: 50_000 }],
    });
    const blocked = await remove(asha, meera.id);
    expect(blocked.status).toBe(409);
    expect(await readJson(blocked)).toMatchObject({
      error: {
        code: 'member_has_balance',
        details: { balances: [{ currency: 'INR', net: -50_000 }] },
      },
    });

    // Meera settles up (payer = Meera, share = Asha): now removable.
    await addEntry(db, {
      groupId: g.id,
      createdBy: g.myMemberId,
      kind: 'settlement',
      payers: [{ memberId: meera.id, amount: 50_000 }],
      shares: [{ memberId: g.myMemberId, amount: 50_000 }],
    });
    const zara = await signInGuest('Zara');
    const zaraSpot = await makeMember(db, g.id, { userId: zara.id, displayName: 'Zara' });
    expect((await remove(zara, meera.id)).status).toBe(403);
    expect((await remove(asha, meera.id)).status).toBe(200);
    expect((await remove(zara, zaraSpot.id)).status).toBe(200); // leaving yourself is fine
  });

  it('hands ownership on when the owner leaves, and the owner can unlink a wrong claim', async () => {
    const owner = await signInGuest('Owner');
    const g2 = await readJson<GroupDetail>(
      await createGroupRoute(
        jsonRequest('/api/v1/groups', {
          method: 'POST',
          cookie: owner.cookie,
          body: { id: uuidv7(), name: 'Trip', type: 'trip', defaultCurrency: 'INR' },
        }),
      ),
    );
    const second = await signInGuest('Second');
    const secondSpot = await makeMember(db, g2.id, { userId: second.id, displayName: 'Second' });
    const wrong = await signInGuest('Wrong');
    const wrongSpot = await makeMember(db, g2.id, { userId: wrong.id, displayName: 'Tanvi' });

    const unlinked = await unlinkRoute(
      jsonRequest('/x', { method: 'POST', cookie: owner.cookie }),
      ctx({ gid: g2.id, mid: wrongSpot.id }),
    );
    expect(await readJson(unlinked)).toMatchObject({ status: 'placeholder', displayName: 'Tanvi' });

    await removeRoute(
      jsonRequest('/x', { method: 'DELETE', cookie: owner.cookie }),
      ctx({ gid: g2.id, mid: g2.myMemberId }),
    );
    const [row] = await db.select().from(groupMembers).where(eq(groupMembers.id, secondSpot.id));
    expect(row!.role).toBe('owner');
  });
});
