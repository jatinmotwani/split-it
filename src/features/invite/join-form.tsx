'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import type { InvitePreview, JoinResponse } from '@/lib/contracts/invites';
import { startGuestSession } from '@/features/auth/guest-session';

export function JoinForm({
  code,
  preview,
  signedInName,
}: {
  code: string;
  preview: InvitePreview;
  /** Null when signed out. */
  signedInName: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(signedInName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholders = preview.members.filter((m) => !m.joined);

  async function join(
    body: { displayName: string } | { claimMemberId: string },
    sessionName: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      if (signedInName === null) await startGuestSession(sessionName);
      const res = await sendMutation<JoinResponse>({
        method: 'POST',
        path: `/invites/${code}/join`,
        body,
      });
      router.push(`/g/${res.groupId}`);
      router.refresh();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError || e instanceof Error ? e.message : 'Couldn’t join. Try again.',
      );
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Add your name so the group knows who you are.');
    void join({ displayName: trimmed }, trimmed);
  }

  return (
    <div className="grid gap-5">
      {placeholders.length > 0 ? (
        <section aria-labelledby="pick-heading" className="grid gap-2">
          <h2 id="pick-heading" className="font-semibold">
            Are you one of these?
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {placeholders.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                disabled={busy}
                onClick={() => void join({ claimMemberId: p.id }, signedInName ?? p.displayName)}
              >
                I’m {p.displayName}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="grid gap-3">
        <Field>
          <Label htmlFor="join-name">
            {placeholders.length > 0 ? 'Or join with your name' : 'Your name'}
          </Label>
          <Input
            id="join-name"
            autoComplete="given-name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? 'Joining…' : `Join ${preview.name}`}
        </Button>
      </form>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}
