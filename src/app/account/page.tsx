import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return (
    <AppShell title="Account" back={{ href: '/', label: 'Back to home' }}>
      <div className="grid gap-4">
        <Card className="grid gap-1 p-4">
          <p className="text-lg font-semibold">{user.name || 'You'}</p>
          <p className="text-sm text-muted-foreground">
            {user.isAnonymous ? 'Guest on this device' : user.email}
          </p>
        </Card>
        {user.isAnonymous ? (
          <Card className="grid gap-3 p-4">
            <p className="font-semibold">Save your account</p>
            <p className="text-sm text-muted-foreground">
              You’re using the app as a guest. Sign in with Google or your email to keep your groups
              on every device. Everything you’ve added moves with you.
            </p>
            <Link href="/sign-in?next=/account" className={buttonVariants({ block: true })}>
              Save my account
            </Link>
          </Card>
        ) : null}
        <SignOutButton />
      </div>
    </AppShell>
  );
}
