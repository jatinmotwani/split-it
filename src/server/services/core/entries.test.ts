import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SaveEntryResponse } from '@/lib/contracts/entries';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from '../../../../test/db';
import { makeGroup } from '../../../../test/factories';
import { readJson, signInGuest } from '../../../../test/helpers';
import { expenseBody, put, tripScenario } from '../../../../test/scenario';
import type { Db } from '../../db';
import { activity, entries, entryPayers, entryRevisions, entryShares } from '../../db/schema';
import { assertStoredLegs } from './entries';
import { memberNets } from './nets';

describe('saving entries', () => {
  let db: Db;
  let close: () => Promise<void>;
  let s: Awaited<ReturnType<typeof tripScenario>>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
    s = await tripScenario(db);
  });
  afterAll(async () => close());

  it('creates an expense with shares computed on the server', async () => {
    const eid = uuidv7();
    const res = await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 57_000, payer: s.A, participants: [s.A, s.R, s.N] }),
    );
    expect(res.status).toBe(200);
    const { entry, conflict, unchanged } = await readJson<SaveEntryResponse>(res);
    expect({ conflict, unchanged }).toEqual({ conflict: false, unchanged: false });
    expect(entry).toMatchObject({
      id: eid,
      version: 1,
      amount: 57_000,
      payers: [{ memberId: s.A, amount: 57_000 }],
    });
    expect(entry.shares.map((l) => l.amount).sort()).toEqual([19_000, 19_000, 19_000]);
    const nets = await memberNets([s.A, s.R, s.N]);
    expect(nets.get(s.A)?.get('INR')).toBe(38_000);
    expect(nets.get(s.N)?.get('INR')).toBe(-19_000);
    const kinds = (
      await db.select({ kind: activity.kind }).from(activity).where(eq(activity.entryId, eid))
    ).map((a) => a.kind);
    expect(kinds).toEqual(['entry_created']);
  });

  it('replays the same Idempotency-Key without saving twice, and ignores an unchanged save', async () => {
    const eid = uuidv7();
    const body = expenseBody({ amount: 45_000, payer: s.R, participants: [s.A, s.R] });
    const key = uuidv7();
    const first = await readJson<SaveEntryResponse>(
      await put(s.raviUser, s.groupId, eid, body, { 'idempotency-key': key }),
    );
    const replay = await put(s.raviUser, s.groupId, eid, body, { 'idempotency-key': key });
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(await readJson(replay)).toEqual(first);

    const same = await readJson<SaveEntryResponse>(
      await put(s.raviUser, s.groupId, eid, { ...body, baseVersion: 1 }),
    );
    expect(same.unchanged).toBe(true);
    expect(same.entry.version).toBe(1);
    expect(await db.select().from(entryRevisions).where(eq(entryRevisions.entryId, eid))).toEqual(
      [],
    );
  });

  it('edits keep the old version; a stale edit wins but is marked as a conflict', async () => {
    const eid = uuidv7();
    await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 10_000, payer: s.A, participants: [s.A, s.N] }),
    );
    const v2 = await readJson<SaveEntryResponse>(
      await put(
        s.asha,
        s.groupId,
        eid,
        expenseBody({ amount: 12_000, payer: s.A, participants: [s.A, s.N], baseVersion: 1 }),
      ),
    );
    expect(v2).toMatchObject({ conflict: false, entry: { version: 2, amount: 12_000 } });

    // Ravi edits from an old copy (still at version 1).
    const v3 = await readJson<SaveEntryResponse>(
      await put(
        s.raviUser,
        s.groupId,
        eid,
        expenseBody({ amount: 15_000, payer: s.R, participants: [s.A, s.R], baseVersion: 1 }),
      ),
    );
    expect(v3).toMatchObject({
      conflict: true,
      entry: { version: 3, amount: 15_000, updatedByMemberId: s.R },
    });

    const revs = await db.select().from(entryRevisions).where(eq(entryRevisions.entryId, eid));
    expect(revs.map((r) => [r.version, r.reason, r.snapshot.amount]).sort()).toEqual([
      [1, 'edit', 10_000],
      [2, 'conflict', 12_000],
    ]);
  });

  it('reports split problems with details the UI can show', async () => {
    const res = await put(s.asha, s.groupId, uuidv7(), {
      ...expenseBody({ amount: 10_000, payer: s.A, participants: [s.A] }),
      split: { type: 'exact', amounts: { [s.A]: 6_000, [s.R]: 3_000 } },
    });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toMatchObject({
      error: { code: 'exact_mismatch', details: { remainder: 1_000 } },
    });

    const payers = await put(s.asha, s.groupId, uuidv7(), {
      ...expenseBody({ amount: 10_000, payer: s.A, participants: [s.A] }),
      payers: [{ memberId: s.A, amount: 9_000 }],
    });
    expect(await readJson(payers)).toMatchObject({
      error: { code: 'payers_mismatch', details: { remainder: 1_000 } },
    });
  });

  it('rejects people from outside the group, and entry ids from another group', async () => {
    const outsider = uuidv7();
    const res = await put(
      s.asha,
      s.groupId,
      uuidv7(),
      expenseBody({ amount: 1_000, payer: s.A, participants: [s.A, outsider] }),
    );
    expect(res.status).toBe(400);

    // Someone else's group already has this entry id.
    const other = await signInGuest('Mallory');
    const { group: otherGroup, owner } = await makeGroup(db, { ownerUserId: other.id });
    const eid = uuidv7();
    await put(
      other,
      otherGroup.id,
      eid,
      expenseBody({ amount: 1_000, payer: owner.id, participants: [owner.id] }),
    );
    const hijack = await put(
      s.asha,
      s.groupId,
      eid,
      expenseBody({ amount: 1, payer: s.A, participants: [s.A] }),
    );
    expect(hijack.status).toBe(404);
  });

  it('records settlements between two different people with a method', async () => {
    const body = {
      kind: 'settlement',
      description: 'Neel paid Asha',
      amount: 19_000,
      currency: 'INR',
      date: '2026-09-29',
      payers: [{ memberId: s.N, amount: 19_000 }],
      split: { type: 'exact', amounts: { [s.A]: 19_000 } },
      settlementMethod: 'upi',
    };
    const ok = await readJson<SaveEntryResponse>(await put(s.asha, s.groupId, uuidv7(), body));
    expect(ok.entry).toMatchObject({ kind: 'settlement', settlementMethod: 'upi' });
    const noMethod = await put(s.asha, s.groupId, uuidv7(), { ...body, settlementMethod: null });
    expect(noMethod.status).toBe(400);
    const self = await put(s.asha, s.groupId, uuidv7(), {
      ...body,
      split: { type: 'exact', amounts: { [s.N]: 19_000 } },
    });
    expect(self.status).toBe(400);
  });

  it('rolls back when stored legs break the invariant', async () => {
    const eid = uuidv7();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(entries).values({
          id: eid,
          groupId: s.groupId,
          kind: 'expense',
          description: 'Broken',
          amount: 1_000,
          currency: 'INR',
          date: '2026-09-28',
          splitType: 'exact',
          splitInput: { type: 'exact', amounts: {} },
          createdByMemberId: s.A,
        });
        await tx.insert(entryPayers).values({ entryId: eid, memberId: s.A, amount: 1_000 });
        await tx.insert(entryShares).values({ entryId: eid, memberId: s.A, amount: 999 });
        await assertStoredLegs(tx, eid, 1_000);
      }),
    ).rejects.toThrow(/invariant/);
    expect(await db.select().from(entries).where(eq(entries.id, eid))).toEqual([]);
  });
});
