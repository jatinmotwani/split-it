'use client';

import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/client/api';
import { qk } from '@/client/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FriendsResponse } from '@/lib/contracts/friends';
import { cn } from '@/lib/cn';
import { balanceLabel, toneClass } from '@/features/money/balance';
import { AddFriendSheet } from './add-friend-sheet';

export function useFriends(initial: FriendsResponse) {
  return useQuery({
    queryKey: qk.friends,
    queryFn: () => api<FriendsResponse>('/friends'),
    initialData: initial,
  });
}

/** Home: 1:1 friends with my balance, and "Add friend". */
export function FriendsSection({ initial }: { initial: FriendsResponse }) {
  const { data } = useFriends(initial);
  const [adding, setAdding] = useState(false);
  return (
    <section className="grid gap-2" aria-labelledby="friends-heading">
      <div className="flex items-center justify-between">
        <h2 id="friends-heading" className="text-lg font-semibold">
          Friends
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <UserPlus /> Add friend
        </Button>
      </div>
      {data.friends.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Split 1:1 with a flatmate, your partner or anyone, in a group or not.
        </p>
      ) : (
        <ul className="grid gap-2">
          {data.friends.map((f) => (
            <li key={f.groupId}>
              <Link
                href={`/g/${f.groupId}`}
                className="flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.name}</span>
                  {f.status === 'placeholder' ? <Badge variant="warn">not joined yet</Badge> : null}
                </span>
                <span className="tabular text-right text-sm">
                  {f.balances.length === 0 ? (
                    <span className={toneClass.settled}>settled up</span>
                  ) : (
                    f.balances.map((b) => {
                      const l = balanceLabel(b.net, b.currency);
                      return (
                        <span
                          key={b.currency}
                          className={cn('block font-medium', toneClass[l.tone])}
                        >
                          {l.text}
                        </span>
                      );
                    })
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AddFriendSheet open={adding} onClose={() => setAdding(false)} candidates={data.candidates} />
    </section>
  );
}
