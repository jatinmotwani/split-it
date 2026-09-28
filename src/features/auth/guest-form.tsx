'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/client/auth-client';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';

/** Name-only guest sign-in (SPEC §2.6). Goes to `next` afterwards. */
export function GuestForm({
  next = '/',
  cta = 'Continue as guest',
  onDone,
}: {
  next?: string;
  cta?: string;
  /** Called instead of navigating, e.g. when the page itself continues the flow. */
  onDone?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Add your name so friends know who you are.');
    setBusy(true);
    setError(null);
    const signIn = await authClient.signIn.anonymous();
    if (signIn.error) {
      setBusy(false);
      return setError(signIn.error.message ?? "Couldn't start a guest session. Try again.");
    }
    await authClient.updateUser({ name: trimmed });
    if (onDone) {
      await onDone();
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field>
        <Label htmlFor="guest-name">Your name</Label>
        <Input
          id="guest-name"
          autoComplete="given-name"
          maxLength={40}
          placeholder="e.g. Asha"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={busy} block>
        {busy ? 'Just a moment…' : cta}
      </Button>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </form>
  );
}
