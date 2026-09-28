'use client';

import { useState } from 'react';
import { authClient } from '@/client/auth-client';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmailCodeForm } from './email-code-form';
import { GuestForm } from './guest-form';

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function SignInOptions({
  googleEnabled,
  next = '/',
  showGuest = true,
}: {
  googleEnabled: boolean;
  next?: string;
  showGuest?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-5">
      {googleEnabled ? (
        <>
          <Button
            variant="outline"
            size="lg"
            block
            onClick={async () => {
              setError(null);
              const res = await authClient.signIn.social({ provider: 'google', callbackURL: next });
              if (res.error) setError(res.error.message ?? 'Google sign-in failed. Try again.');
            }}
          >
            Continue with Google
          </Button>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Divider label="or" />
        </>
      ) : null}
      <EmailCodeForm next={next} />
      {showGuest ? (
        <>
          <Divider label="or just use your name" />
          <GuestForm next={next} />
        </>
      ) : null}
    </div>
  );
}
