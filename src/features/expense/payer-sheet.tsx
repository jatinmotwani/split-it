'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import type { MemberDto } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { parseTyped, type ExpenseFormState } from './use-expense-form';

export function PayerSheet({
  open,
  onClose,
  state,
  update,
  amount,
  members,
}: {
  open: boolean;
  onClose: () => void;
  state: ExpenseFormState;
  update: (p: Partial<ExpenseFormState>) => void;
  amount: number | null;
  members: MemberDto[];
}) {
  const label = (m: MemberDto) => (m.isMe ? 'You' : m.displayName);
  const paid = Object.values(state.payerAmounts).reduce(
    (s, t) => s + (parseTyped(t, state.currency) ?? 0),
    0,
  );
  const left = (amount ?? 0) - paid;

  return (
    <Sheet open={open} onClose={onClose} title="Who paid?">
      <div className="grid gap-3">
        {state.payerMode === 'single' ? (
          <ul className="grid gap-1" role="radiogroup" aria-label="Who paid">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={state.payerId === m.id}
                  onClick={() => {
                    update({ payerId: m.id });
                    onClose();
                  }}
                  className={cn(
                    'flex min-h-12 w-full items-center rounded-lg px-3 text-left',
                    state.payerId === m.id
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {label(m)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-1">
            {members.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 px-2">
                <label htmlFor={`paid-${m.id}`} className="flex-1 truncate">
                  {label(m)}
                </label>
                <Input
                  id={`paid-${m.id}`}
                  inputMode="decimal"
                  placeholder="0"
                  className="tabular w-32 text-right"
                  value={state.payerAmounts[m.id] ?? ''}
                  onChange={(e) =>
                    update({ payerAmounts: { ...state.payerAmounts, [m.id]: e.target.value } })
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {state.payerMode === 'multiple' ? (
          <p
            className={cn('text-sm font-medium', left === 0 ? 'text-owed' : 'text-warn')}
            aria-live="polite"
          >
            {left === 0
              ? `Adds up to ${formatMoney(amount ?? 0, state.currency)}`
              : left > 0
                ? `${formatMoney(left, state.currency)} left to assign`
                : `${formatMoney(-left, state.currency)} too much`}
          </p>
        ) : null}

        <Button
          variant="outline"
          onClick={() =>
            update(
              state.payerMode === 'single'
                ? { payerMode: 'multiple', payerAmounts: {} }
                : { payerMode: 'single' },
            )
          }
        >
          {state.payerMode === 'single' ? 'Several people paid' : 'One person paid'}
        </Button>
        {state.payerMode === 'multiple' ? (
          <Button size="lg" block onClick={onClose}>
            Done
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
