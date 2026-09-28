import { ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';
import type { EntryDto } from '@/lib/contracts/entries';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { CategoryIcon } from '@/features/expense/category-icon';

/** How an entry affects me: positive = I lent / got back, negative = I borrowed / paid back. */
export function myImpact(e: EntryDto, myId: string): number {
  const paid = e.payers.filter((p) => p.memberId === myId).reduce((s, p) => s + p.amount, 0);
  const owed = e.shares.filter((s) => s.memberId === myId).reduce((t, s) => t + s.amount, 0);
  return paid - owed;
}

export function EntryRow({
  entry,
  gid,
  myId,
  name,
  pending = false,
}: {
  entry: EntryDto;
  gid: string;
  myId: string;
  name: (id: string) => string;
  /** Sent but not yet confirmed by the server. */
  pending?: boolean;
}) {
  const money = (n: number) => formatMoney(n, entry.currency, { trimZeros: true });
  const impact = myImpact(entry, myId);
  const involved = [...entry.payers, ...entry.shares].some((l) => l.memberId === myId);
  const payerText =
    entry.payers.length === 1
      ? `${name(entry.payers[0]!.memberId)} paid ${money(entry.amount)}`
      : `${entry.payers.length} people paid ${money(entry.amount)}`;

  const isSettlement = entry.kind === 'settlement';
  const title = isSettlement
    ? `${name(entry.payers[0]!.memberId)} paid ${name(entry.shares[0]!.memberId)}`
    : entry.description;

  return (
    <Link
      href={`/g/${gid}/e/${entry.id}`}
      className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted"
      aria-busy={pending || undefined}
    >
      <span
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-lg',
          isSettlement ? 'bg-owed-soft text-owed' : 'bg-secondary text-secondary-foreground',
        )}
        aria-hidden
      >
        {isSettlement ? (
          <ArrowRightLeft className="size-5" />
        ) : (
          <CategoryIcon category={entry.category} className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {pending ? 'Saving… · ' : ''}
          {isSettlement ? money(entry.amount) : payerText}
        </span>
      </span>
      <span className="tabular text-right text-sm">
        {!involved ? (
          <span className="text-muted-foreground">not involved</span>
        ) : impact > 0 ? (
          <span className="text-owed">
            <span className="block text-xs">{isSettlement ? 'you paid' : 'you lent'}</span>
            <span className="font-semibold">{money(impact)}</span>
          </span>
        ) : impact < 0 ? (
          <span className="text-owe">
            <span className="block text-xs">{isSettlement ? 'you received' : 'you borrowed'}</span>
            <span className="font-semibold">{money(-impact)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">even</span>
        )}
      </span>
    </Link>
  );
}
