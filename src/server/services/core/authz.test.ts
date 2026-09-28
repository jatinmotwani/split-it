import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDb } from '../../../../test/db';
import { makeGroup, makeMember } from '../../../../test/factories';
import { ctx, jsonRequest, readJson, signInGuest } from '../../../../test/helpers';
import type { Db } from '../../db';
import { groupMembers } from '../../db/schema';
import { route } from '../../http/route';

describe("route({ auth: 'member' })", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
  });
  afterAll(async () => close());

  const whoami = route({
    auth: 'member',
    body: z.object({ n: z.int() }),
    handler: async ({ membership }) => ({
      member: membership.member.displayName,
      group: membership.group.name,
    }),
  });

  it('lets members in and gives the handler their spot and group', async () => {
    const asha = await signInGuest('Asha');
    const { group } = await makeGroup(db, {
      ownerUserId: asha.id,
      ownerName: 'Asha',
      name: 'Flat 4B',
    });
    const res = await whoami(
      jsonRequest('/x', { method: 'POST', body: { n: 1 }, cookie: asha.cookie }),
      ctx({ gid: group.id }),
    );
    expect(await readJson(res)).toEqual({ member: 'Asha', group: 'Flat 4B' });
  });

  it('returns 404 to non-members even with an invalid body, and to removed members', async () => {
    const owner = await signInGuest('Owner');
    const outsider = await signInGuest('Outsider');
    const { group } = await makeGroup(db, { ownerUserId: owner.id });
    const res = await whoami(
      jsonRequest('/x', { method: 'POST', body: { nope: 1 }, cookie: outsider.cookie }),
      ctx({ gid: group.id }),
    );
    expect(res.status).toBe(404);

    const leaver = await signInGuest('Leaver');
    const spot = await makeMember(db, group.id, { userId: leaver.id, displayName: 'Leaver' });
    await db
      .update(groupMembers)
      .set({ removedAt: new Date() })
      .where(eq(groupMembers.id, spot.id));
    const res2 = await whoami(
      jsonRequest('/x', { method: 'POST', body: { n: 1 }, cookie: leaver.cookie }),
      ctx({ gid: group.id }),
    );
    expect(res2.status).toBe(404);
  });

  it('returns 404 for malformed group ids and 401 when signed out', async () => {
    const someone = await signInGuest('Someone');
    const bad = await whoami(
      jsonRequest('/x', { method: 'POST', body: { n: 1 }, cookie: someone.cookie }),
      ctx({ gid: 'not-a-uuid' }),
    );
    expect(bad.status).toBe(404);
    const anon = await whoami(
      jsonRequest('/x', { method: 'POST', body: { n: 1 } }),
      ctx({ gid: 'x' }),
    );
    expect(anon.status).toBe(401);
  });
});
