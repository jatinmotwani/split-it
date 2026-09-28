import { authClient } from '@/client/auth-client';

/** Starts a guest session named `name` (SPEC §2.6). Throws with a readable message on failure. */
export async function startGuestSession(name: string): Promise<void> {
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(res.error.message ?? 'Couldn’t start a guest session.');
  await authClient.updateUser({ name });
}
