'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, LogOut, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { AppShell } from '@/components/app-shell';
import { CurrencySelect } from '@/components/currency-select';
import { ErrorText } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import type { Balance } from '@/lib/contracts/common';
import type { GroupDetail, GroupType, MemberDto, UpdateGroupBody } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { GROUP_TYPE_OPTIONS } from '@/features/groups/group-types';
import { useGroup } from '@/features/group/use-group-data';
import { copyText, inviteMessage, whatsappUrl } from '@/features/invite/share';
import { useOrigin } from '@/features/invite/use-origin';
import { PeopleList } from '@/features/members/people-list';
import { balanceLabel } from '@/features/money/balance';
import { SimplifySwitch } from '@/features/settle/simplify-switch';

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function DetailsForm({ group }: { group: GroupDetail }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [type, setType] = useState(group.type);
  const [currency, setCurrency] = useState(group.defaultCurrency);
  const { toast } = useToast();

  const patch: UpdateGroupBody = {
    ...(name.trim() !== group.name ? { name: name.trim() } : {}),
    ...(type !== group.type && type !== 'direct' ? { type } : {}),
    ...(currency !== group.defaultCurrency ? { defaultCurrency: currency } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: () =>
      sendMutation<GroupDetail>({ method: 'PATCH', path: `/groups/${group.id}`, body: patch }),
    onSuccess: (g) => {
      qc.setQueryData(qk.group(group.id), g);
      void qc.invalidateQueries({ queryKey: qk.groups });
      toast({ message: 'Saved' });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (dirty && name.trim()) save.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" aria-labelledby="details-heading">
      <SectionHeading id="details-heading">Group</SectionHeading>
      <Field>
        <Label htmlFor="settings-name">Name</Label>
        <Input
          id="settings-name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {group.type !== 'direct' ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Type</legend>
          <div className="grid grid-cols-4 gap-2">
            {GROUP_TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={type === t.value}
                onClick={() => setType(t.value as GroupType)}
                className={cn(
                  'h-11 rounded-lg border text-sm font-semibold',
                  type === t.value
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-input bg-card',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Field>
        <Label htmlFor="settings-currency">Default currency</Label>
        <CurrencySelect id="settings-currency" value={currency} onChange={setCurrency} />
        <p className="text-xs text-muted-foreground">
          Used for new expenses. Existing expenses keep their currency.
        </p>
      </Field>
      {save.error ? (
        <ErrorText>
          {save.error instanceof ApiError ? save.error.message : 'Couldn’t save. Try again.'}
        </ErrorText>
      ) : null}
      <Button type="submit" disabled={!dirty || !name.trim() || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

function InviteSection({ group, onRotate }: { group: GroupDetail; onRotate: () => void }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const link = `${origin}/j/${group.inviteCode}`;
  return (
    <section aria-labelledby="invite-heading" className="grid gap-2">
      <SectionHeading id="invite-heading">Invite link</SectionHeading>
      <Input
        aria-label="Invite link"
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
          className={buttonVariants({ variant: 'secondary' })}
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
      {group.myRole === 'owner' ? (
        <Button variant="ghost" onClick={onRotate}>
          Reset invite link
        </Button>
      ) : null}
    </section>
  );
}

type Action =
  | { kind: 'remove'; member: MemberDto }
  | { kind: 'unlink'; member: MemberDto }
  | { kind: 'leave' }
  | { kind: 'rotate' };

const COPY: Record<
  Action['kind'],
  (name: string) => { title: string; description: string; confirm: string }
> = {
  remove: (n) => ({
    title: `Remove ${n}?`,
    description: `${n} stays on past expenses but can’t be added to new ones.`,
    confirm: 'Remove',
  }),
  unlink: (n) => ({
    title: `Unlink ${n}?`,
    description: `Use this if the wrong person claimed ${n}’s spot. It goes back to “not joined yet” and keeps its expenses; send a new claim link afterwards.`,
    confirm: 'Unlink',
  }),
  leave: () => ({
    title: 'Leave this group?',
    description: 'You stay on past expenses. Someone can add you back with the invite link.',
    confirm: 'Leave group',
  }),
  rotate: () => ({
    title: 'Reset the invite link?',
    description: 'The old link stops working. People already in the group aren’t affected.',
    confirm: 'Reset link',
  }),
};

function balanceBlocker(e: unknown, who: string): string[] | null {
  if (!(e instanceof ApiError) || e.code !== 'member_has_balance') return null;
  const balances = (e.details as { balances?: Balance[] } | undefined)?.balances ?? [];
  return balances.map((b) => {
    const t = balanceLabel(b.net, b.currency, who).text;
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
}

export function SettingsScreen({ gid, initialGroup }: { gid: string; initialGroup: GroupDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: group } = useGroup(gid, initialGroup);
  const [action, setAction] = useState<Action | null>(null);
  const isOwner = group.myRole === 'owner';

  const act = useMutation({
    mutationFn: (a: Action) => {
      switch (a.kind) {
        case 'remove':
          return sendMutation({ method: 'DELETE', path: `/groups/${gid}/members/${a.member.id}` });
        case 'unlink':
          return sendMutation({
            method: 'POST',
            path: `/groups/${gid}/members/${a.member.id}/unlink`,
          });
        case 'leave':
          return sendMutation({
            method: 'DELETE',
            path: `/groups/${gid}/members/${group.myMemberId}`,
          });
        case 'rotate':
          return sendMutation({ method: 'POST', path: `/groups/${gid}/invite/rotate` });
      }
    },
    onSuccess: (_r, a) => {
      setAction(null);
      if (a.kind === 'leave') {
        void qc.invalidateQueries({ queryKey: qk.groups });
        router.push('/');
        return;
      }
      for (const key of [qk.group(gid), qk.activity(gid), qk.balances(gid)])
        void qc.invalidateQueries({ queryKey: key });
    },
  });

  const open = (a: Action) => {
    act.reset();
    setAction(a);
  };
  const who = action && 'member' in action ? action.member.displayName : 'You';
  const copy = action ? COPY[action.kind](who) : null;
  const blocked = act.error
    ? balanceBlocker(act.error, action?.kind === 'leave' ? 'you' : who)
    : null;

  return (
    <AppShell title="Group settings" back={{ href: `/g/${gid}`, label: 'Back to group' }}>
      <div className="grid gap-6">
        <DetailsForm key={`${group.name}|${group.type}|${group.defaultCurrency}`} group={group} />
        <SimplifySwitch group={group} />
        <InviteSection group={group} onRotate={() => open({ kind: 'rotate' })} />
        <Card className="p-3">
          <PeopleList
            group={group}
            actions={(m) =>
              isOwner && !m.isMe ? (
                <span className="flex">
                  {m.status !== 'placeholder' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Unlink ${m.displayName}`}
                      onClick={() => open({ kind: 'unlink', member: m })}
                    >
                      Unlink
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    aria-label={`Remove ${m.displayName}`}
                    onClick={() => open({ kind: 'remove', member: m })}
                  >
                    Remove
                  </Button>
                </span>
              ) : null
            }
          />
        </Card>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => open({ kind: 'leave' })}
        >
          <LogOut /> Leave group
        </Button>
      </div>

      <Sheet
        open={action !== null}
        onClose={() => setAction(null)}
        title={copy?.title ?? ''}
        description={copy?.description}
      >
        <div className="grid gap-3">
          {blocked ? (
            <div className="grid gap-2 rounded-lg bg-warn-soft p-3 text-sm" role="alert">
              {blocked.map((line) => (
                <p key={line} className="font-semibold text-warn">
                  {line}
                </p>
              ))}
              <p>{(act.error as ApiError).message}</p>
              <Link
                href={`/g/${gid}/settle`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Settle up
              </Link>
            </div>
          ) : act.error ? (
            <ErrorText>
              {act.error instanceof ApiError ? act.error.message : 'Couldn’t do that. Try again.'}
            </ErrorText>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={act.isPending || blocked !== null}
              onClick={() => action && act.mutate(action)}
            >
              {act.isPending ? 'Working…' : (copy?.confirm ?? 'OK')}
            </Button>
          </div>
        </div>
      </Sheet>
    </AppShell>
  );
}
