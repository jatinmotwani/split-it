'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, MessageCircle, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { ErrorText } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import type { GroupDetail, MemberDto } from '@/lib/contracts/groups';
import { copyText, inviteMessage, whatsappUrl } from './share';

export function InviteButton({ group }: { group: GroupDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Invite people"
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
      >
        <UserPlus className="size-5" />
      </button>
      <InviteSheet group={group} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function statusText(m: MemberDto) {
  if (m.isMe) return 'you';
  if (m.status === 'placeholder') return 'not joined yet';
  return m.status === 'guest' ? 'joined as guest' : 'joined';
}

export function InviteSheet({
  group,
  open,
  onClose,
}: {
  group: GroupDetail;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    // Set after mount: the server doesn't know the origin the user is on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  const link = `${origin}/j/${group.inviteCode}`;

  const add = useMutation({
    mutationFn: () =>
      sendMutation<MemberDto>({
        method: 'POST',
        path: `/groups/${group.id}/members`,
        body: { displayName: name.trim() },
      }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: qk.group(group.id) });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) add.mutate();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite people"
      description="Anyone with the link can join with just their name."
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="invite-link">Invite link</Label>
          <Input
            id="invite-link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsappUrl(inviteMessage(group.name, link))}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'default' })}
            >
              <MessageCircle /> WhatsApp
            </a>
            <Button
              variant="outline"
              onClick={async () => {
                setCopied(await copyText(link));
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor="placeholder-name">Add someone who isn’t here yet</Label>
          <div className="flex gap-2">
            <Input
              id="placeholder-name"
              maxLength={40}
              placeholder="Their name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!name.trim() || add.isPending}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can split with them now; they can claim their spot later.
          </p>
          {add.error ? (
            <ErrorText>
              {add.error instanceof ApiError ? add.error.message : 'Couldn’t add them.'}
            </ErrorText>
          ) : null}
        </form>

        <section aria-labelledby="people-heading" className="grid gap-1">
          <h3 id="people-heading" className="text-sm font-semibold text-muted-foreground">
            People ({group.members.filter((m) => m.active).length})
          </h3>
          <ul className="grid">
            {group.members
              .filter((m) => m.active)
              .map((m) => (
                <li key={m.id} className="flex min-h-11 items-center justify-between gap-2">
                  <span className="truncate">{m.displayName}</span>
                  <Badge variant={m.status === 'placeholder' ? 'warn' : 'muted'}>
                    {statusText(m)}
                  </Badge>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
