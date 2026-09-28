import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { SignInOptions } from '@/features/auth/sign-in-options';
import { isGoogleEnabled } from '@/server/auth/auth';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const user = await getCurrentUser();
  if (user && !user.isAnonymous) redirect(next);
  return (
    <AppShell title="Sign in" back={{ href: '/', label: 'Back to home' }}>
      {user?.isAnonymous ? (
        <p className="mb-4 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          You’re using {`the app as a guest (${user.name})`}. Sign in to keep your groups on every
          device. Everything you’ve added moves with you.
        </p>
      ) : null}
      <SignInOptions googleEnabled={isGoogleEnabled()} next={next} showGuest={!user} />
    </AppShell>
  );
}
