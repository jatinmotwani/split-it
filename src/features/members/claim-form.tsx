'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ClaimPreview, ClaimResponse } from '@/lib/contracts/members';
import { startGuestSession } from '@/features/auth/guest-session';

/** Binds this device to the spot. Signed out → a guest session named after the spot first. */
export function ClaimForm({
  token,
  preview,
  signedInName,
}: {
  token: string;
  preview: ClaimPreview;
  /** Null when signed out. */
  signedInName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      if (signedInName === null) await startGuestSession(preview.displayName);
      const res = await sendMutation<ClaimResponse>({ method: 'POST', path: `/claims/${token}` });
      router.push(`/g/${res.groupId}`);
      router.refresh();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : 'Couldn’t claim it. Try again.',
      );
    }
  }

  return (
    <div className="grid gap-3">
      <Button size="lg" block disabled={busy} onClick={() => void claim()}>
        {busy
          ? 'Claiming…'
          : signedInName === null
            ? `Continue as ${preview.displayName}`
            : `I’m ${preview.displayName}, claim it`}
      </Button>
      {signedInName !== null ? (
        <p className="text-center text-sm text-muted-foreground">
          You’re signed in as {signedInName}. The spot keeps the name {preview.displayName}.
        </p>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}
