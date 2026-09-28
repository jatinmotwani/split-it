import 'server-only';
import { headers as nextHeaders } from 'next/headers';
import { getAuth } from './auth';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAnonymous: boolean;
};

/** The signed-in user (guests included) for a request's headers, or null. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const result = await getAuth().api.getSession({ headers });
  if (!result) return null;
  const u = result.user as typeof result.user & { isAnonymous?: boolean | null };
  return { id: u.id, name: u.name, email: u.email, isAnonymous: !!u.isAnonymous };
}

/** For server components and pages. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser(await nextHeaders());
}
