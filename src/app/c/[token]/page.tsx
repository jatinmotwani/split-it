import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import { ClaimForm } from '@/features/members/claim-form';
import { getCurrentUser } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { clientIp, LIMITS, rateLimit } from '@/server/http/rate-limit';
import { previewClaim } from '@/server/services/core/members';

export const metadata: Metadata = { title: 'Claim your spot', robots: { index: false } };

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  const h = await headers();
  let preview;
  try {
    await rateLimit(
      `claim:ip:${clientIp(new Request('http://x', { headers: h }))}`,
      LIMITS.claimPerIp.limit,
      LIMITS.claimPerIp.window,
    );
    preview = await previewClaim(token, user);
  } catch (e) {
    const message = e instanceof AppError ? e.message : 'This claim link doesn’t work.';
    return (
      <AppShell title="Claim your spot" back={{ href: '/', label: 'Home' }}>
        <Card className="grid gap-3 p-4">
          <p className="font-semibold">{message}</p>
          <p className="text-sm text-muted-foreground">
            Anyone in the group can send you a fresh link.
          </p>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Go to {APP_NAME}
          </Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Claim your spot">
      <div className="grid gap-5">
        <Card className="grid gap-1 p-4">
          <p className="text-sm text-muted-foreground">{preview.groupName}</p>
          <p className="text-xl font-semibold">
            {preview.reclaim
              ? `Get back in as ${preview.displayName}`
              : `This spot is for ${preview.displayName}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {preview.reclaim
              ? 'Use this on your new phone or browser. Your expenses and balance are all still there.'
              : 'Your expenses and balance are already there. Claim the spot to see them and add your own.'}
          </p>
        </Card>
        {preview.alreadyMember ? (
          <>
            <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              You’re already in {preview.groupName} on this device. If this link is for someone
              else, send it to them instead.
            </p>
            <Link
              href={`/g/${preview.groupId}`}
              className={buttonVariants({ size: 'lg', block: true })}
            >
              Open the group
            </Link>
          </>
        ) : (
          <>
            <ClaimForm token={token} preview={preview} signedInName={user ? user.name : null} />
            {!user ? (
              <p className="text-center text-sm text-muted-foreground">
                Have an account?{' '}
                <Link
                  href={`/sign-in?next=/c/${token}`}
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
