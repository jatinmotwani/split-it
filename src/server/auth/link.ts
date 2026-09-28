import 'server-only';

/**
 * Runs when a guest signs in with Google or an email code: Better Auth then deletes the
 * anonymous user. Group memberships move to the new user here (implemented with groups, task 1.10).
 */
export async function onGuestLinked(anonymousUserId: string, newUserId: string): Promise<void> {
  console.info(`[auth] guest ${anonymousUserId} linked to ${newUserId}`);
}
