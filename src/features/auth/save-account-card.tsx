'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const KEY = 'splitit:save-account-dismissed';
const listeners = new Set<() => void>();
// Fallback when storage is blocked: the card still hides for this page's lifetime.
let dismissedInMemory = false;

function isDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedInMemory = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked; the in-memory flag covers this visit.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * D2: after a guest's first expense, a gentle card to save their account. Dismissible, never
 * blocks. Tells a lone guest plainly that clearing the browser can't be undone.
 */
export function SaveAccountCard({ next, alone }: { next: string; alone: boolean }) {
  // Hidden on the server and during hydration; the stored choice is only known in the browser.
  const hidden = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (hidden) return null;
  return (
    <Card className="grid gap-3 p-4" role="region" aria-labelledby="save-account-heading">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="grid gap-1">
          <h2 id="save-account-heading" className="font-semibold">
            Save your account
          </h2>
          <p className="text-sm text-muted-foreground">
            You’re a guest on this device. Sign in with Google or email to keep your groups on any
            phone.{' '}
            {alone
              ? 'Nobody else has joined yet, so if you clear this browser, this group can’t be recovered.'
              : 'If you clear this browser, anyone in the group can send you a link to get back in.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Save account
        </Link>
      </div>
    </Card>
  );
}
