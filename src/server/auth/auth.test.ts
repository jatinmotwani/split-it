import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/db';
import { getAuth } from './auth';
import { getSessionUser } from './session';

describe('Better Auth wiring', () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ close } = await useTestDb());
  });
  afterAll(async () => close());

  it('serves the auth handler', async () => {
    const res = await getAuth().handler(new Request('http://localhost:3000/api/auth/ok'));
    expect(res.status).toBe(200);
  });

  it('returns no user without a session cookie', async () => {
    expect(await getSessionUser(new Headers())).toBeNull();
  });
});
