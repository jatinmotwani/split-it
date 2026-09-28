import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { getCurrentUser, type SessionUser } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { requireMember, type Membership } from '@/server/services/core/authz';

/** For group pages: signed-in members only; everyone else gets the 404 page. */
export async function requirePageMembership(
  gid: string,
  nextPath: string,
): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  if (!isUuid(gid)) notFound();
  try {
    return { user, membership: await requireMember(user.id, gid) };
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
