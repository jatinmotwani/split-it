import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useTestDb } from '../../../test/db';
import { jsonRequest, readJson, signInGuest, type TestUser } from '../../../test/helpers';
import { GET as getMe } from '../../app/api/v1/me/route';
import { AppError } from './errors';
import { route } from './route';

describe('route()', () => {
  let close: () => Promise<void>;
  let guest: TestUser;
  beforeAll(async () => {
    ({ close } = await useTestDb());
    guest = await signInGuest('Asha');
  });
  afterAll(async () => close());

  const echo = route({
    auth: 'user',
    body: z.object({ amount: z.int().nonnegative() }),
    status: 201,
    handler: async ({ body, user }) => ({ amount: body.amount, by: user.name }),
  });

  it('returns 401 with an error body when not signed in', async () => {
    const res = await echo(jsonRequest('/api/v1/echo', { method: 'POST', body: { amount: 1 } }));
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({
      error: { code: 'unauthorized', message: 'Sign in to continue.' },
    });
  });

  it('returns 400 with field details for invalid input', async () => {
    const res = await echo(
      jsonRequest('/api/v1/echo', { method: 'POST', body: { amount: -5 }, cookie: guest.cookie }),
    );
    expect(res.status).toBe(400);
    const body = await readJson<{ error: { code: string; details: { path: string }[] } }>(res);
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.details[0]?.path).toBe('amount');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await echo(
      jsonRequest('/api/v1/echo', { method: 'POST', body: '{nope', cookie: guest.cookie }),
    );
    expect(res.status).toBe(400);
    expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('invalid_json');
  });

  it('rejects a mutation from another origin with 403', async () => {
    const res = await echo(
      jsonRequest('/api/v1/echo', {
        method: 'POST',
        body: { amount: 1 },
        cookie: guest.cookie,
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('bad_origin');
  });

  it('returns the success shape with a request id', async () => {
    const res = await echo(
      jsonRequest('/api/v1/echo', {
        method: 'POST',
        body: { amount: 450 },
        cookie: guest.cookie,
        headers: { origin: 'http://localhost:3000' },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await readJson(res)).toEqual({ amount: 450, by: 'Asha' });
  });

  it('maps AppError and unknown errors', async () => {
    const failing = route({
      auth: 'none',
      handler: async () => {
        throw new AppError(409, 'member_has_balance', 'Settle up first.', { owes: 100 });
      },
    });
    const res = await failing(jsonRequest('/api/v1/x'));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({
      error: { code: 'member_has_balance', message: 'Settle up first.', details: { owes: 100 } },
    });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const crashing = route({
      auth: 'none',
      handler: async () => {
        throw new Error('db down');
      },
    });
    const res2 = await crashing(jsonRequest('/api/v1/y'));
    expect(res2.status).toBe(500);
    expect((await readJson<{ error: { code: string } }>(res2)).error.code).toBe('internal_error');
    spy.mockRestore();
  });

  it('replays an idempotent request instead of running it twice', async () => {
    let calls = 0;
    const create = route({
      auth: 'user',
      idempotent: true,
      body: z.object({ n: z.int() }),
      handler: async ({ body }) => ({ n: body.n, call: ++calls }),
    });
    const key = crypto.randomUUID();
    const send = (n: number) =>
      create(
        jsonRequest('/api/v1/things', {
          method: 'PUT',
          body: { n },
          cookie: guest.cookie,
          headers: { 'idempotency-key': key },
        }),
      );

    const first = await send(1);
    const second = await send(1);
    expect(await readJson(first)).toEqual({ n: 1, call: 1 });
    expect(await readJson(second)).toEqual({ n: 1, call: 1 });
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(calls).toBe(1);

    const mismatch = await send(2);
    expect(mismatch.status).toBe(422);
  });
});

describe('GET /api/v1/me', () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ close } = await useTestDb());
  });
  afterAll(async () => close());

  it('describes a guest without exposing the placeholder email', async () => {
    const guest = await signInGuest('Neel');
    const res = await getMe(jsonRequest('/api/v1/me', { cookie: guest.cookie }));
    expect(await readJson(res)).toEqual({ id: guest.id, name: 'Neel', email: null, isGuest: true });
  });
});
