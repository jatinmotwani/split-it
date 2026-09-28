import { getAuth } from '@/server/auth/auth';
import { readDevOutbox } from '@/server/email';

export const BASE = 'http://localhost:3000';

export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export type TestUser = { id: string; name: string; cookie: string };

/** A guest session with a display name. */
export async function signInGuest(name: string): Promise<TestUser> {
  const res = await getAuth().api.signInAnonymous({ asResponse: true });
  const cookie = cookieFrom(res);
  await getAuth().api.updateUser({ body: { name }, headers: new Headers({ cookie }) });
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  return { id: session!.user.id, name, cookie };
}

/** An email-code account. Requires ENABLE_DEV_OUTBOX=1 (set by test/setup.ts). */
export async function signInEmail(
  email: string,
  name?: string,
  existingCookie?: string,
): Promise<TestUser> {
  await getAuth().api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const code = readDevOutbox(email)
    .at(-1)
    ?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code in dev outbox');
  const res = await getAuth().api.signInEmailOTP({
    body: { email, otp: code },
    headers: new Headers(existingCookie ? { cookie: existingCookie } : {}),
    asResponse: true,
  });
  const cookie = cookieFrom(res);
  if (name) await getAuth().api.updateUser({ body: { name }, headers: new Headers({ cookie }) });
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  return { id: session!.user.id, name: session!.user.name, cookie };
}

type ReqInit = {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
};

export function jsonRequest(path: string, init: ReqInit = {}): Request {
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? init.body
          : JSON.stringify(init.body),
  });
}

/** Route context the way Next passes it. */
export const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
