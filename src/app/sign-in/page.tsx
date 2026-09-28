import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInOptions } from '@/features/auth/sign-in-options';
import { isGoogleEnabled } from '@/server/auth/auth';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user && !user.isAnonymous) redirect('/');
  return (
    <main>
      <h1>Sign in</h1>
      <SignInOptions googleEnabled={isGoogleEnabled()} />
    </main>
  );
}
