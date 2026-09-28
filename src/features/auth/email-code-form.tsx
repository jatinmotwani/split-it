'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/client/auth-client';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';

export function EmailCodeForm({ next = '/' }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'name'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'sign-in',
    });
    setBusy(false);
    if (res.error)
      return setError(res.error.message ?? "Couldn't send the code. Check the address.");
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (res.error) {
      return setError(
        res.error.status === 429
          ? 'Too many tries. Wait a minute, then try again.'
          : 'That code didn’t work. Check it, or send yourself a new one.',
      );
    }
    // New accounts have no name yet; friends need one to see who paid.
    const session = await authClient.getSession();
    if (!session.data?.user.name?.trim()) return setStep('name');
    done();
  }

  function done() {
    router.push(next);
    router.refresh();
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Add your name so friends know who you are.');
    setBusy(true);
    setError(null);
    const res = await authClient.updateUser({ name: trimmed });
    setBusy(false);
    if (res.error) return setError('Couldn’t save your name. Try again.');
    done();
  }

  if (step === 'name') {
    return (
      <form onSubmit={saveName} className="grid gap-3">
        <Field>
          <Label htmlFor="account-name">What should friends call you?</Label>
          <Input
            id="account-name"
            autoComplete="given-name"
            maxLength={40}
            placeholder="e.g. Asha"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy} block>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </form>
    );
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="grid gap-3">
        <Field>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={busy} block>
          {busy ? 'Sending…' : 'Email me a code'}
        </Button>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to <strong className="text-foreground">{email}</strong>.
      </p>
      <Field>
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="tabular text-center text-2xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <Button type="submit" disabled={busy} block>
        {busy ? 'Checking…' : 'Sign in'}
      </Button>
      <Button variant="ghost" onClick={() => setStep('email')}>
        Use a different email
      </Button>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </form>
  );
}
