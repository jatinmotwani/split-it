'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { DEFAULT_CURRENCY } from '@/config/app';
import type { AddFriendResponse, FriendCandidate } from '@/lib/contracts/friends';
import { uuidv7 } from '@/lib/ids';

/** Add a friend from your groups, or anyone by name; opens your 1:1 page with them. */
export function AddFriendSheet({
  open,
  onClose,
  candidates,
}: {
  open: boolean;
  onClose: () => void;
  candidates: FriendCandidate[];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: (who: { memberId: string } | { name: string }) => {
      const id = uuidv7();
      return sendMutation<AddFriendResponse>({
        id,
        method: 'POST',
        path: '/friends',
        body: { id, currency: DEFAULT_CURRENCY, ...who },
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.friends });
      router.push(`/g/${res.groupId}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) add.mutate({ name: name.trim() });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a friend"
      description="Split 1:1 with anyone. Your balance with them adds up across groups you share."
    >
      <div className="grid gap-4">
        {candidates.length > 0 ? (
          <section aria-labelledby="from-groups" className="grid gap-2">
            <h3 id="from-groups" className="text-sm font-semibold text-muted-foreground">
              From your groups
            </h3>
            <ul className="grid gap-1">
              {candidates.map((c) => (
                <li key={c.memberId}>
                  <button
                    type="button"
                    disabled={add.isPending}
                    onClick={() => add.mutate({ memberId: c.memberId })}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <span className="truncate font-medium">{c.displayName}</span>
                    <span className="truncate text-sm text-muted-foreground">{c.groupName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor="friend-name">
            {candidates.length > 0 ? 'Or someone else' : 'Their name'}
          </Label>
          <div className="flex gap-2">
            <Input
              id="friend-name"
              maxLength={40}
              placeholder="e.g. Kiran"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!name.trim() || add.isPending}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can add expenses right away and send them a link later.
          </p>
        </form>
        {add.error ? (
          <ErrorText>
            {add.error instanceof ApiError ? add.error.message : 'Couldn’t add them. Try again.'}
          </ErrorText>
        ) : null}
      </div>
    </Sheet>
  );
}
