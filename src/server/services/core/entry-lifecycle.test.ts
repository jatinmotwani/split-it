import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActivityPage } from '@/lib/contracts/activity';
import type {
  EntriesPage,
  EntryDto,
  RevisionDto,
  SaveEntryResponse,
} from '@/lib/contracts/entries';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { ctx, jsonRequest, readJson, type TestUser } from '../../../../test/helpers';
import { expenseBody, put, tripScenario } from '../../../../test/scenario';
import { GET as activityRoute } from '../../../app/api/v1/groups/[gid]/activity/route';
import { POST as restoreRoute } from '../../../app/api/v1/groups/[gid]/entries/[eid]/restore/route';
import { GET as revisionsRoute } from '../../../app/api/v1/groups/[gid]/entries/[eid]/revisions/route';
import {
  DELETE as deleteRoute,
  GET as getEntry,
} from '../../../app/api/v1/groups/[gid]/entries/[eid]/route';
import { GET as listRoute } from '../../../app/api/v1/groups/[gid]/entries/route';
import type { Db } from '../../db';
import { memberNets } from './nets';

describe('entry lifecycle', () => {
  let db: Db;
  let close: () => Promise<void>;
  let s: Awaited<ReturnType<typeof tripScenario>>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    s = await tripScenario(db);
  });
  afterAll(async () => close());

  const list = (me: TestUser, q = '') =>
    listRoute(
      jsonRequest(`/api/v1/groups/${s.groupId}/entries${q}`, { cookie: me.cookie }),
      ctx({ gid: s.groupId }),
    ).then((r) => readJson<EntriesPage>(r));
  const del = (eid: string) =>
    deleteRoute(
      jsonRequest('/x', { method: 'DELETE', cookie: s.asha.cookie }),
      ctx({ gid: s.groupId, eid }),
    );
  const restore = (eid: string, q = '') =>
    restoreRoute(
      jsonRequest(`/x${q}`, { method: 'POST', cookie: s.asha.cookie }),
      ctx({ gid: s.groupId, eid }),
    );

  it('lists live entries newest first, in pages', async () => {
    for (const [i, date] of ['2026-09-26', '2026-09-27', '2026-09-27', '2026-09-28'].entries()) {
      await put(
        s.asha,
        s.groupId,
        uuidv7(),
        expenseBody({
          amount: 1_000 * (i + 1),
          payer: s.A,
          participants: [s.A, s.R],
          date,
          description: `E${i}`,
        }),
      );
    }
    const p1 = await list(s.asha, '?limit=3');
    expect(p1.entries.map((e) => e.date)).toEqual(['2026-09-28', '2026-09-27', '2026-09-27']);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await list(s.asha, `?limit=3&before=${p1.nextCursor}`);
    expect(p2.entries.map((e) => e.description)).toEqual(['E0']);
    expect(p2.nextCursor).toBeNull();
    expect(p1.entries[0]!.shares).toHaveLength(2);
  });

  it('deletes softly (out of balances and the list) and restores with one tap', async () => {
    const eid = uuidv7();
    await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 90_000, payer: s.A, participants: [s.A, s.N] }),
    );
    const before = (await memberNets([s.N])).get(s.N)?.get('INR') ?? 0;

    const deleted = await readJson<EntryDto>(await del(eid));
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.version).toBe(2);
    expect((await memberNets([s.N])).get(s.N)?.get('INR') ?? 0).toBe(before + 45_000);
    expect((await list(s.asha)).entries.some((e) => e.id === eid)).toBe(false);
    expect((await readJson<EntryDto>(await del(eid))).version).toBe(2); // idempotent

    const restored = await readJson<EntryDto>(await restore(eid));
    expect(restored).toMatchObject({ deletedAt: null, version: 3 });
    expect((await memberNets([s.N])).get(s.N)?.get('INR') ?? 0).toBe(before);
  });

  it('restores an earlier version as a new version and lists the history', async () => {
    const eid = uuidv7();
    await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 10_000, payer: s.A, participants: [s.A, s.R], description: 'Cab' }),
    );
    await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({
        amount: 25_000,
        payer: s.R,
        participants: [s.A, s.R, s.N],
        description: 'Cab + tolls',
        baseVersion: 1,
      }),
    );

    const back = await readJson<EntryDto>(await restore(eid, '?version=1'));
    expect(back).toMatchObject({
      version: 3,
      amount: 10_000,
      description: 'Cab',
      payers: [{ memberId: s.A, amount: 10_000 }],
    });
    expect(back.shares.map((l) => l.memberId).sort()).toEqual([s.A, s.R].sort());

    const { revisions } = await readJson<{ revisions: RevisionDto[] }>(
      await revisionsRoute(
        jsonRequest('/x', { cookie: s.asha.cookie }),
        ctx({ gid: s.groupId, eid }),
      ),
    );
    expect(revisions.map((r) => [r.version, r.reason, r.snapshot.description])).toEqual([
      [2, 'restore', 'Cab + tolls'],
      [1, 'edit', 'Cab'],
    ]);
    expect((await restore(eid, '?version=3')).status).toBe(409);
    expect((await restore(eid, '?version=9')).status).toBe(409);
  });

  it('shows the activity feed newest first', async () => {
    const page = await readJson<ActivityPage>(
      await activityRoute(
        jsonRequest('/x?limit=5', { cookie: s.raviUser.cookie }),
        ctx({ gid: s.groupId }),
      ),
    );
    expect(page.items).toHaveLength(5);
    expect(page.items[0]!.kind).toBe('entry_updated');
    expect(page.nextCursor).toBe(page.items[4]!.id);
    const ids = page.items.map((i) => i.id);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('404s entries from other groups', async () => {
    const res = await getEntry(
      jsonRequest('/x', { cookie: s.asha.cookie }),
      ctx({ gid: s.groupId, eid: uuidv7() }),
    );
    expect(res.status).toBe(404);
    const saved = await readJson<SaveEntryResponse>(
      await put(
        s.asha,
        s.groupId,
        uuidv7(),
        expenseBody({ amount: 100, payer: s.A, participants: [s.A] }),
      ),
    );
    expect(
      (
        await getEntry(
          jsonRequest('/x', { cookie: s.asha.cookie }),
          ctx({ gid: s.groupId, eid: saved.entry.id }),
        )
      ).status,
    ).toBe(200);
  });
});
