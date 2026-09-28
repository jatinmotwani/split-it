'use client';

import { useState } from 'react';
import { authClient } from '@/client/auth-client';
import { EmailCodeForm } from './email-code-form';
import { GuestForm } from './guest-form';

export function SignInOptions({ googleEnabled }: { googleEnabled: boolean }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {googleEnabled ? (
        <button
          type="button"
          onClick={async () => {
            setError(null);
            const res = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
            if (res.error) setError(res.error.message ?? 'Google sign-in failed. Try again.');
          }}
        >
          Continue with Google
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <EmailCodeForm />
      <GuestForm />
    </div>
  );
}
