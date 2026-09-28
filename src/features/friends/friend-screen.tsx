'use client';

import { Plus, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Balance } from '@/lib/contracts/common';
import type { FriendsResponse } from '@/lib/contracts/friends';
import type { GroupDetail } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { toneClass } from '@/features/money/balance';
import { FriendLinkButton } from './friend-link';
import { useFriends } from './friends-section';

/** "Kiran owes you ₹200" / "You owe Kiran ₹100", from my side (positive: they owe me). */
export function friendLine(b: Balance, name: string) {
  const amount = formatMoney(Math.abs(b.net), b.currency, { trimZeros: true });
  return b.net > 0
    ? { text: `${name} owes you ${amount}`, tone: 'owed' as const }
    : { text: `You owe ${name} ${amount}`, tone: 'owe' as const };
}

/**
 * A friend: what's between us across every group we share (each group's active view, D4), and
 * where it comes from. Each group links to its "Why?" sheet for this friend.
 */
export function FriendScreen({
  directGroup,
  initialFriends,
}: {
  directGroup: GroupDetail;
  initialFriends: FriendsResponse;
}) {
  const { data } = useFriends(initialFriends);
  const friend = data.friends.find((f) => f.groupId === directGroup.id);
  const gid = directGroup.id;
  if (!friend) {
    return (
      <AppShell title="Friend" back={{ href: '/', label: 'Home' }}>
        <Card className="p-4 font-semibold">This friend isn’t in your list any more.</Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={friend.name}
      back={{ href: '/', label: 'Home' }}
      actions={<FriendLinkButton group={directGroup} />}
    >
      <div className="grid gap-5">
        <Card className="grid gap-1 p-4" aria-label="Your balance with this friend">
          {friend.balances.length === 0 ? (
            <p className="text-lg font-semibold">All settled up with {friend.name}</p>
          ) : (
            friend.balances.map((b) => {
              const l = friendLine(b, friend.name);
              return (
                <p
                  key={b.currency}
                  className={cn('tabular text-lg font-semibold', toneClass[l.tone])}
                >
                  {l.text}
                </p>
              );
            })
          )}
          <p className="text-sm text-muted-foreground">Across every group you share</p>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/g/${gid}/add`} className={buttonVariants({ variant: 'default' })}>
            <Plus /> Add expense
          </Link>
          <Link href={`/g/${gid}`} className={buttonVariants({ variant: 'outline' })}>
            1:1 expenses
          </Link>
        </div>

        <section aria-labelledby="between-heading" className="grid gap-1">
          <h2
            id="between-heading"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Where it comes from
          </h2>
          <ul className="grid">
            {friend.groups.map((g) => (
              <li key={g.groupId}>
                <Link
                  href={`/g/${g.groupId}?explain=${g.friendMemberId}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UsersRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-medium">{g.name ?? 'Just the two of you'}</span>
                  </span>
                  <span className="tabular text-right text-sm">
                    {g.balances.length === 0 ? (
                      <span className={toneClass.settled}>settled up</span>
                    ) : (
                      g.balances.map((b) => {
                        const l = friendLine(b, friend.name);
                        return (
                          <span key={b.currency} className={cn('block', toneClass[l.tone])}>
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
          <p className="px-2 text-xs text-muted-foreground">
            Each group counts the way it settles: with simplify debts on, a group may route money
            through someone else, so its share here follows its suggested payments.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
