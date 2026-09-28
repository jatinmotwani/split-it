import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/db';
import { readDevOutbox } from '../email';
import { resetEnvCache } from '../env';
import { getAuth } from './auth';
import { getSessionUser } from './session';

function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

describe('email code sign-in', () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    process.env.ENABLE_DEV_OUTBOX = '1';
    resetEnvCache();
    ({ close } = await useTestDb());
  });
  afterAll(async () => {
    delete process.env.ENABLE_DEV_OUTBOX;
    resetEnvCache();
    await close();
  });

  it('sends a code and signs in with it, creating the user', async () => {
    const email = 'asha@example.in';
    await getAuth().api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const mail = readDevOutbox(email).at(-1);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const res = await getAuth().api.signInEmailOTP({
      body: { email, otp: code! },
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const user = await getSessionUser(new Headers({ cookie: cookieFrom(res) }));
    expect(user?.email).toBe(email);
    expect(user?.isAnonymous).toBe(false);
  });

  it('rejects a wrong code', async () => {
    const email = 'ravi@example.in';
    await getAuth().api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const res = await getAuth().api.signInEmailOTP({
      body: { email, otp: '000000' },
      asResponse: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
