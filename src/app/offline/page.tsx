import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: 'Offline' };
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <AppShell title="You’re offline">
      <div className="grid justify-items-center gap-4 pt-12 text-center">
        <WifiOff className="size-12 text-muted-foreground" aria-hidden />
        <p className="text-lg font-semibold">No connection right now</p>
        <p className="max-w-xs text-muted-foreground">
          This page needs the internet. Check your connection, then try again.
        </p>
        <RetryButton />
      </div>
    </AppShell>
  );
}
