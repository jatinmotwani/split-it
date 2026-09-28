'use client';

import { HandCoins, Plus, Settings, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { BalancesResponse } from '@/lib/contracts/balances';
import type { EntriesPage, EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { balanceLabel, toneClass } from '@/features/money/balance';
import { dayLabel } from './dates';
import { EntryRow } from './entry-row';
import { mergeEntries, usePendingEntries } from './entry-writes';
import { nameMap, useBalances, useEntries, useGroup } from './use-group-data';

export type GroupScreenProps = {
  gid: string;
  initial: { group: GroupDetail; balances: BalancesResponse; entries: EntriesPage };
  /** Slots filled by later features (invite sheet, explain sheet). */
  inviteAction?: ReactNode;
  onBalanceTap?: (memberId: string) => void;
  /** Shown above the balances (the guest "Save your account" card). */
  notice?: ReactNode;
};

export function GroupScreen({
  gid,
  initial,
  inviteAction,
  onBalanceTap,
  notice,
}: GroupScreenProps) {
  const { data: group } = useGroup(gid, initial.group);
  const { data: balances } = useBalances(gid, initial.balances);
  const { data: page } = useEntries(gid, initial.entries);
  const name = nameMap(group);
  const myId = group.myMemberId;

  const myBalances = balances.members.find((m) => m.memberId === myId)?.balances ?? [];
  const others = balances.members.filter((m) => m.memberId !== myId && m.balances.length > 0);
  const pending = usePendingEntries(gid);
  const pendingIds = new Set(pending.map((e) => e.id));
  const byDay = useMemo(() => {
    const days = new Map<string, EntryDto[]>();
    for (const e of mergeEntries(page.entries, pending))
      days.set(e.date, [...(days.get(e.date) ?? []), e]);
    return [...days];
  }, [page.entries, pending]);
  const [showAllBalances, setShowAllBalances] = useState(false);
  const visibleOthers = showAllBalances ? others : others.slice(0, 5);

  return (
    <AppShell
      title={group.name}
      back={{ href: '/', label: 'Back to groups' }}
      actions={
        <>
          {inviteAction ?? (
            <span className="inline-flex size-11 items-center justify-center" aria-hidden>
              <UserPlus className="size-5 opacity-40" />
            </span>
          )}
          <Link
            href={`/g/${gid}/settings`}
            aria-label="Group settings"
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
          >
            <Settings className="size-5" />
          </Link>
        </>
      }
    >
      <div className="grid gap-5">
        {notice}
        <Card className="grid gap-3 p-4">
          <div aria-label="Your balance in this group">
            {myBalances.length === 0 ? (
              <p className="text-lg font-semibold">You’re all settled up</p>
            ) : (
              myBalances.map((b) => {
                const l = balanceLabel(b.net, b.currency);
                return (
                  <button
                    key={b.currency}
                    type="button"
                    onClick={() => onBalanceTap?.(myId)}
                    className={cn(
                      'tabular block min-h-11 text-left text-lg font-semibold',
                      toneClass[l.tone],
                    )}
                  >
                    {l.text.replace(/^./, (c) => c.toUpperCase())}
                  </button>
                );
              })
            )}
          </div>
          {balances.suggestions.length > 0 ? (
            <Link
              href={`/g/${gid}/settle`}
              className={buttonVariants({ variant: 'secondary', block: true })}
            >
              <HandCoins /> Settle up
            </Link>
          ) : null}
        </Card>

        {others.length > 0 ? (
          <section aria-labelledby="balances-heading" className="grid gap-1">
            <h2
              id="balances-heading"
              className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Balances
            </h2>
            <ul className="grid">
              {visibleOthers.map((m) => (
                <li key={m.memberId}>
                  <button
                    type="button"
                    onClick={() => onBalanceTap?.(m.memberId)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-muted"
                  >
                    <span className="truncate font-medium">{name(m.memberId)}</span>
                    <span className="tabular text-right text-sm">
                      {m.balances.map((b) => {
                        const l = balanceLabel(b.net, b.currency, name(m.memberId));
                        return (
                          <span key={b.currency} className={cn('block', toneClass[l.tone])}>
                            {b.net > 0 ? 'gets back' : 'owes'} {l.amount}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {others.length > 5 ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAllBalances((v) => !v)}>
                {showAllBalances ? 'Show fewer' : `Show all ${others.length}`}
              </Button>
            ) : null}
            {balances.suggestions.length > 0 ? (
              <p className="px-2 text-sm text-muted-foreground">
                Suggested:{' '}
                {balances.suggestions.slice(0, 3).map((t, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    {name(t.from)} → {name(t.to)}{' '}
                    {formatMoney(t.amount, t.currency, { trimZeros: true })}
                  </span>
                ))}
                {balances.suggestions.length > 3
                  ? ` · +${balances.suggestions.length - 3} more`
                  : ''}
              </p>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="expenses-heading" className="grid gap-2">
          <h2
            id="expenses-heading"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Expenses
          </h2>
          {byDay.length === 0 ? (
            <Card className="grid justify-items-center gap-2 p-6 text-center">
              <p className="font-semibold">No expenses yet</p>
              <p className="text-sm text-muted-foreground">Tap + to add the first one.</p>
            </Card>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day} className="grid gap-1">
                <h3 className="px-2 text-sm font-medium text-muted-foreground">{dayLabel(day)}</h3>
                <ul className="grid">
                  {list.map((e) => (
                    <li key={e.id}>
                      <EntryRow
                        entry={e}
                        gid={gid}
                        myId={myId}
                        name={name}
                        pending={pendingIds.has(e.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>

      <Link
        href={`/g/${gid}/add`}
        aria-label="Add an expense"
        className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        <Plus className="size-7" />
      </Link>
    </AppShell>
  );
}
