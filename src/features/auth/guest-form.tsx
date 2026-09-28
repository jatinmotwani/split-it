'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/client/auth-client';

/** Name-only guest sign-in (SPEC §2.6). Returns to `next` afterwards. */
export function GuestForm({
  next = '/',
  cta = 'Continue as guest',
}: {
  next?: string;
  cta?: string;
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
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="guest-name">Your name</label>
      <input
        id="guest-name"
        autoComplete="given-name"
        maxLength={40}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={busy}>
        {cta}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
