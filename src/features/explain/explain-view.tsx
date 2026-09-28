import Link from 'next/link';
import type { ExplainResponse, TransferDto } from '@/lib/contracts/balances';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { dayLabel } from '@/features/group/dates';

export type ExplainRow = {
  entryId: string;
  description: string;
  date: string;
  currency: string;
  amount: number;
};

/** Normalises either explain shape into signed rows (+ = gets money back / is owed). */
export function explainRows(data: ExplainResponse): ExplainRow[] {
  return data.view === 'pair'
    ? data.rows.map((r) => ({
        entryId: r.entryId,
        description: r.description,
        date: r.date,
        currency: r.currency,
        amount: r.amount,
      }))
    : data.rows.map((r) => ({
        entryId: r.entryId,
        description: r.description,
        date: r.date,
        currency: r.currency,
        amount: r.net,
      }));
}

export function totalsOf(rows: ExplainRow[]): { currency: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  return [...m].filter(([, v]) => v !== 0).map(([currency, amount]) => ({ currency, amount }));
}

/** D4: in the simplified view, say where this person's balance is routed. */
export function routingLines(
  memberId: string,
  suggestions: TransferDto[],
  name: (id: string) => string,
): string[] {
  return suggestions
    .filter((t) => t.from === memberId || t.to === memberId)
    .map((t) => {
      const amt = formatMoney(t.amount, t.currency, { trimZeros: true });
      return `${name(t.from)} ${name(t.from) === 'You' ? 'pay' : 'pays'} ${name(t.to)} ${amt}`;
    });
}

export function ExplainView({
  gid,
  data,
  simplified,
  routing,
  subject,
}: {
  gid: string;
  data: ExplainResponse;
  simplified: boolean;
  routing: string[];
  /** "you" or a name, for the empty and routing sentences. */
  subject: string;
}) {
  const rows = explainRows(data);
  const totals = totalsOf(rows);
  return (
    <div className="grid gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing between you yet.</p>
      ) : (
        <ul className="grid">
          {rows.map((r) => (
            <li key={r.entryId}>
              <Link
                href={`/g/${gid}/e/${r.entryId}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate">{r.description}</span>
                  <span className="block text-xs text-muted-foreground">{dayLabel(r.date)}</span>
                </span>
                <span
                  className={cn('tabular font-medium', r.amount > 0 ? 'text-owed' : 'text-owe')}
                >
                  {formatMoney(r.amount, r.currency, { signDisplay: 'always' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {totals.length > 0 ? (
        <div className="grid gap-1 border-t pt-2">
          {totals.map((t) => (
            <p key={t.currency} className="tabular flex justify-between font-semibold">
              <span>Total</span>
              <span className={t.amount > 0 ? 'text-owed' : 'text-owe'}>
                {formatMoney(t.amount, t.currency, { signDisplay: 'always' })}
              </span>
            </p>
          ))}
        </div>
      ) : null}
      {simplified && routing.length > 0 ? (
        <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          Simplify debts routes {subject === 'you' ? 'your' : `${subject}’s`} balance so the group
          needs fewer payments: {routing.join('; ')}.
        </p>
      ) : null}
    </div>
  );
}
