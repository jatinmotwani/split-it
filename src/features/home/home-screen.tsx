'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/client/api';
import { qk } from '@/client/query-keys';
import { wroteRecently } from '@/client/recent-writes';
import { AppShell } from '@/components/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import type { FriendsResponse } from '@/lib/contracts/friends';
import type { GroupsResponse } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { FriendsSection, useFriends } from '@/features/friends/friends-section';
import { GroupIcon } from '@/features/groups/group-icon';
import { NewGroupSheet } from '@/features/groups/new-group-sheet';
import { balanceLabel, toneClass } from '@/features/money/balance';

export function HomeScreen({
  initial,
  initialFriends,
  name,
  openNew,
}: {
  initial: GroupsResponse;
  initialFriends: FriendsResponse;
  name: string;
  openNew?: boolean;
}) {
  const { data } = useQuery({
    queryKey: qk.groups,
    queryFn: () => api<GroupsResponse>('/groups'),
    initialData: initial,
    // A render that raced a write from this tab refetches once.
    ...(wroteRecently() ? { initialDataUpdatedAt: 0 } : {}),
  });
  const [newOpen, setNewOpen] = useState(!!openNew);
  const friendCount = useFriends(initialFriends).data.friends.length;
  const owed = data.totals.filter((t) => t.net > 0);
  const owe = data.totals.filter((t) => t.net < 0);

  return (
    <AppShell
      title={APP_NAME}
      actions={
        <>
          <ThemeToggle />
          <Link
            href="/account"
            aria-label="Account"
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
          >
            <UserRound className="size-5" />
          </Link>
        </>
      }
    >
      <div className="grid gap-5">
        <p className="text-muted-foreground">Hi, {name || 'there'}</p>

        {data.groups.length > 0 || friendCount > 0 ? (
          <Card className="grid gap-1 p-4" aria-label="Overall balance">
            {owed.length === 0 && owe.length === 0 ? (
              <p className="text-lg font-semibold">You’re all settled up</p>
            ) : null}
            {owed.map((t) => (
              <p key={`owed-${t.currency}`} className="tabular text-lg font-semibold text-owed">
                {balanceLabel(t.net, t.currency).text.replace(/^./, (c) => c.toUpperCase())}
              </p>
            ))}
            {owe.map((t) => (
              <p key={`owe-${t.currency}`} className="tabular text-lg font-semibold text-owe">
                {balanceLabel(t.net, t.currency).text.replace(/^./, (c) => c.toUpperCase())}
              </p>
            ))}
            <p className="text-sm text-muted-foreground">Across all your groups and friends</p>
          </Card>
        ) : null}

        <section className="grid gap-2" aria-labelledby="groups-heading">
          <div className="flex items-center justify-between">
            <h2 id="groups-heading" className="text-lg font-semibold">
              Groups
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setNewOpen(true)}>
              <Plus /> New group
            </Button>
          </div>

          {data.groups.length === 0 ? (
            <Card className="grid justify-items-center gap-3 p-6 text-center">
              <p className="font-semibold">No groups yet</p>
              <p className="text-sm text-muted-foreground">
                Make one for a trip, your flat or anything you share. Invite friends on WhatsApp;
                they can join with just their name.
              </p>
              <Button onClick={() => setNewOpen(true)}>Create a group</Button>
            </Card>
          ) : (
            <ul className="grid gap-2">
              {data.groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/g/${g.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted"
                  >
                    <GroupIcon type={g.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{g.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
                      </span>
                    </span>
                    <span className="tabular text-right text-sm">
                      {g.balances.length === 0 ? (
                        <span className={toneClass.settled}>settled up</span>
                      ) : (
                        g.balances.map((b) => {
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
        </section>

        <FriendsSection initial={initialFriends} />
      </div>

      {data.groups.length > 0 ? (
        <Link
          href="/add"
          aria-label="Add an expense"
          className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          <Plus className="size-7" />
        </Link>
      ) : null}
      <NewGroupSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </AppShell>
  );
}
