import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../test/db';
import type { Db } from '../db';
import { user } from '../db/schema';
import { readDevOutbox } from '../email';
import { getAuth } from './auth';
import { getSessionUser } from './session';

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

describe('guest sessions', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await useTestDb());
  });
  afterAll(async () => {
    await close();
  });

  it('creates an anonymous user that can set a name', async () => {
    const res = await getAuth().api.signInAnonymous({ asResponse: true });
    const cookie = cookieFrom(res);
    await getAuth().api.updateUser({ body: { name: 'Neel' }, headers: new Headers({ cookie }) });
    const me = await getSessionUser(new Headers({ cookie }));
    expect(me).toMatchObject({ name: 'Neel', isAnonymous: true });
  });

  it('links a guest to an email account and deletes the anonymous user', async () => {
    const anon = await getAuth().api.signInAnonymous({ asResponse: true });
    const anonCookie = cookieFrom(anon);
    const guest = await getSessionUser(new Headers({ cookie: anonCookie }));
    expect(guest?.isAnonymous).toBe(true);

    const email = 'priya@example.in';
    await getAuth().api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const code = readDevOutbox(email)
      .at(-1)
      ?.text.match(/\b(\d{6})\b/)?.[1];
    const linked = await getAuth().api.signInEmailOTP({
      body: { email, otp: code! },
      headers: new Headers({ cookie: anonCookie }),
      asResponse: true,
    });
    expect(linked.status).toBe(200);

    const me = await getSessionUser(new Headers({ cookie: cookieFrom(linked) }));
    expect(me).toMatchObject({ email, isAnonymous: false });
    const leftover = await db.select().from(user).where(eq(user.id, guest!.id));
    expect(leftover).toEqual([]);
  });
});
