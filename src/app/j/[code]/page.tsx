import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import { GroupIcon } from '@/features/groups/group-icon';
import { JoinForm } from '@/features/invite/join-form';
import { getCurrentUser } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { clientIp, LIMITS, rateLimit } from '@/server/http/rate-limit';
import { previewInvite } from '@/server/services/core/invites';

export const metadata: Metadata = { title: 'Join a group', robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getCurrentUser();
  const h = await headers();
  let preview;
  try {
    await rateLimit(
      `invite:ip:${clientIp(new Request('http://x', { headers: h }))}`,
      LIMITS.invitePreviewPerIp.limit,
      LIMITS.invitePreviewPerIp.window,
    );
    preview = await previewInvite(code, user);
  } catch (e) {
    const message = e instanceof AppError ? e.message : 'This invite link doesn’t work.';
    return (
      <AppShell title="Join a group" back={{ href: '/', label: 'Home' }}>
        <Card className="grid gap-3 p-4">
          <p className="font-semibold">{message}</p>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Go to {APP_NAME}
          </Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Join a group">
      <div className="grid gap-5">
        <Card className="flex items-center gap-3 p-4">
          <GroupIcon type={preview.type} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{preview.name}</p>
            <p className="text-sm text-muted-foreground">
              {preview.members.map((m) => m.displayName).join(', ')}
            </p>
          </div>
        </Card>
        {preview.alreadyMember ? (
          <Link
            href={`/g/${preview.groupId}`}
            className={buttonVariants({ size: 'lg', block: true })}
          >
            You’re in. Open the group
          </Link>
        ) : (
          <>
            <JoinForm code={code} preview={preview} signedInName={user ? user.name : null} />
            {!user ? (
              <p className="text-center text-sm text-muted-foreground">
                Have an account?{' '}
                <Link
                  href={`/sign-in?next=/j/${code}`}
                  className={buttonVariants({ variant: 'link', size: 'sm' })}
                >
                  Sign in first
                </Link>
              </p>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
