'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { ErrorText } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GroupDetail, MemberDto } from '@/lib/contracts/groups';
import type { ClaimLinkResponse } from '@/lib/contracts/members';
import { claimMessage, copyText, whatsappUrl } from '@/features/invite/share';
import { useOrigin } from '@/features/invite/use-origin';

/** Placeholders get a claim link; so do guests who lost their session (D3). Accounts sign in. */
export function canSendClaimLink(m: MemberDto): boolean {
  return m.active && !m.isMe && m.status !== 'account';
}

/**
 * "Send claim link": mints a fresh single-use link on tap (each one replaces the last), then
 * offers WhatsApp and copy.
 */
export function ClaimLink({ group, member }: { group: GroupDetail; member: MemberDto }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const mint = useMutation({
    mutationFn: () =>
      sendMutation<ClaimLinkResponse>({
        method: 'POST',
        path: `/groups/${group.id}/members/${member.id}/claim-link`,
      }),
  });

  if (!mint.data) {
    return (
      <div className="grid justify-items-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-primary"
          disabled={mint.isPending}
          aria-label={`Send claim link to ${member.displayName}`}
          onClick={() => mint.mutate()}
        >
          {mint.isPending ? 'Making link…' : 'Send claim link'}
        </Button>
        {mint.error ? (
          <ErrorText>
            {mint.error instanceof ApiError ? mint.error.message : 'Couldn’t make a link.'}
          </ErrorText>
        ) : null}
      </div>
    );
  }

  const link = `${origin}${mint.data.path}`;
  const message = claimMessage(member.displayName, group.name, link, member.status === 'guest');
  return (
    <div className="grid w-full gap-2 rounded-lg bg-muted p-3">
      <Input
        readOnly
        aria-label={`Claim link for ${member.displayName}`}
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsappUrl(message)}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'default', size: 'sm' })}
        >
          <MessageCircle /> WhatsApp
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setCopied(await copyText(link));
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Works once. Sending a new link cancels this one.
      </p>
    </div>
  );
}
