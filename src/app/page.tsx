import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import { GuestForm } from '@/features/auth/guest-form';
import { HomeScreen } from '@/features/home/home-screen';
import { getCurrentUser } from '@/server/auth/session';
import { listFriends } from '@/server/services/core/friends';
import { listMyGroups } from '@/server/services/core/groups';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    const [initial, friends, sp] = await Promise.all([
      listMyGroups(user.id),
      listFriends(user.id),
      searchParams,
    ]);
    return (
      <HomeScreen
        initial={initial}
        initialFriends={friends}
        name={user.name}
        openNew={sp.new === '1'}
      />
    );
  }
  return (
    <AppShell title={APP_NAME} actions={<ThemeToggle />}>
      <div className="grid gap-6">
        <section className="grid gap-2 pt-4">
          <p className="text-3xl leading-tight font-bold text-balance">
            Split bills with friends. Free, with no daily limits.
          </p>
          <p className="text-muted-foreground">
            Trips, flatmates, couples. Add an expense in three taps, see who owes whom, and settle
            up however you like. No ads, ever.
          </p>
        </section>
        <Card className="grid gap-3 p-4">
          <h2 className="text-lg font-semibold">Start in seconds</h2>
          <GuestForm cta="Start as a guest" />
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/sign-in" className={buttonVariants({ variant: 'link', size: 'sm' })}>
            Sign in
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
