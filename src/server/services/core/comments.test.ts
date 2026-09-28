import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActivityPage } from '@/lib/contracts/activity';
import type { CommentDto, CommentsResponse } from '@/lib/contracts/comments';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { ctx, jsonRequest, readJson, signInGuest, type TestUser } from '../../../../test/helpers';
import { expenseBody, put, tripScenario } from '../../../../test/scenario';
import { GET as activityRoute } from '../../../app/api/v1/groups/[gid]/activity/route';
import { DELETE as deleteRoute } from '../../../app/api/v1/groups/[gid]/entries/[eid]/comments/[cid]/route';
import {
  GET as listRoute,
  POST as postRoute,
} from '../../../app/api/v1/groups/[gid]/entries/[eid]/comments/route';
import type { Db } from '../../db';

describe('comments', () => {
  let db: Db;
  let close: () => Promise<void>;
  let s: Awaited<ReturnType<typeof tripScenario>>;
  let outsider: TestUser;
  const eid = uuidv7();
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    s = await tripScenario(db);
    outsider = await signInGuest('Outsider');
    await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 90_000, payer: s.A, participants: [s.A, s.R] }),
    );
  });
  afterAll(async () => close());

  const post = (me: TestUser, body: unknown, entryId = eid) =>
    postRoute(
      jsonRequest('/x', { method: 'POST', cookie: me.cookie, body }),
      ctx({ gid: s.groupId, eid: entryId }),
    );
  const list = (me: TestUser) =>
    listRoute(jsonRequest('/x', { cookie: me.cookie }), ctx({ gid: s.groupId, eid })).then((r) =>
      readJson<CommentsResponse>(r),
    );
  const del = (me: TestUser, cid: string) =>
    deleteRoute(
      jsonRequest('/x', { method: 'DELETE', cookie: me.cookie }),
      ctx({ gid: s.groupId, eid, cid }),
    );

  it('posts a comment once, even when retried, and records activity', async () => {
    const id = uuidv7();
    const first = await post(s.asha, { id, body: '  Includes the tip  ' });
    expect(first.status).toBe(201);
    const c = await readJson<CommentDto>(first);
    expect(c).toMatchObject({ id, entryId: eid, authorMemberId: s.A, body: 'Includes the tip' });
    expect((await post(s.asha, { id, body: 'Includes the tip' })).status).toBe(201);
    expect((await list(s.asha)).comments).toHaveLength(1);

    const act = await readJson<ActivityPage>(
      await activityRoute(jsonRequest('/x', { cookie: s.asha.cookie }), ctx({ gid: s.groupId })),
    );
    expect(act.items[0]).toMatchObject({
      kind: 'comment_added',
      entryId: eid,
      actorMemberId: s.A,
      data: { description: 'Dinner' },
    });
  });

  it('rejects empty and oversized comments', async () => {
    expect((await post(s.asha, { id: uuidv7(), body: '   ' })).status).toBe(400);
    expect((await post(s.asha, { id: uuidv7(), body: 'x'.repeat(1001) })).status).toBe(400);
    expect((await post(s.asha, { id: uuidv7(), body: 'x'.repeat(1000) })).status).toBe(201);
  });

  it('404s for an entry in another group or that does not exist', async () => {
    expect((await post(s.asha, { id: uuidv7(), body: 'hi' }, uuidv7())).status).toBe(404);
  });

  it('only the author or the owner can delete; deleted comments disappear', async () => {
    const raviSession = s.raviUser;
    const byRavi = await readJson<CommentDto>(
      await post(raviSession, { id: uuidv7(), body: 'I paid you back already' }),
    );
    const byAsha = (await list(s.asha)).comments[0]!;
    expect((await del(raviSession, byAsha.id)).status).toBe(403);
    expect((await del(s.asha, byRavi.id)).status).toBe(200); // owner
    expect((await del(raviSession, byRavi.id)).status).toBe(404); // already gone
    expect((await list(s.asha)).comments.map((c) => c.id)).not.toContain(byRavi.id);
  });

  it('keeps non-members out', async () => {
    expect((await post(outsider, { id: uuidv7(), body: 'hi' })).status).toBe(404);
  });
});
