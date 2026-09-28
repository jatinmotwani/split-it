'use client';

import { Check as CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import type { MemberDto } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money/currency';
import { checkForm, prefill, type ExpenseFormState, type SplitMode } from './use-expense-form';

const MODES: { mode: SplitMode; label: string }[] = [
  { mode: 'equal', label: 'Equally' },
  { mode: 'exact', label: 'Exact' },
  { mode: 'percentage', label: '%' },
  { mode: 'shares', label: 'Shares' },
];

export function splitSummary(state: ExpenseFormState): string {
  const count = (rec: Record<string, string>) =>
    Object.values(rec).filter((v) => v && Number(v) !== 0).length;
  const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
  switch (state.splitMode) {
    case 'equal':
      return `Split equally · ${people(state.participants.length)}`;
    case 'exact':
      return `Exact amounts · ${people(count(state.exact))}`;
    case 'percentage':
      return `By percentage · ${people(count(state.percent))}`;
    case 'shares':
      return `By shares · ${people(count(state.shares))}`;
  }
}

export function SplitSheet({
  open,
  onClose,
  state,
  update,
  amount,
  members,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  state: ExpenseFormState;
  update: (p: Partial<ExpenseFormState>) => void;
  amount: number | null;
  members: MemberDto[];
  seed: string;
}) {
  const check = checkForm({ ...state, payerMode: 'single' }, amount, seed);
  const shareOf = new Map((check.shares ?? []).map((l) => [l.memberId, l.amount]));
  const label = (m: MemberDto) => (m.isMe ? 'You' : m.displayName);
  const money = (n: number) => formatMoney(n, state.currency);

  function setMode(mode: SplitMode) {
    if (mode === state.splitMode) return;
    update({ splitMode: mode, ...prefill(mode, state, amount, seed) });
  }

  function toggle(id: string) {
    const set = new Set(state.participants);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ participants: members.filter((m) => set.has(m.id)).map((m) => m.id) });
  }

  const field =
    state.splitMode === 'exact' ? 'exact' : state.splitMode === 'percentage' ? 'percent' : 'shares';

  return (
    <Sheet open={open} onClose={onClose} title="Split">
      <div className="grid gap-4">
        <div
          className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1"
          role="group"
          aria-label="Split method"
        >
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={state.splitMode === m.mode}
              onClick={() => setMode(m.mode)}
              className={cn(
                'h-11 rounded-lg text-sm font-semibold',
                state.splitMode === m.mode ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <ul className="grid gap-1">
          {members.map((m) =>
            state.splitMode === 'equal' ? (
              <li key={m.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={state.participants.includes(m.id)}
                  onClick={() => toggle(m.id)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-muted"
                >
                  <span
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-md border',
                      state.participants.includes(m.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input',
                    )}
                    aria-hidden
                  >
                    {state.participants.includes(m.id) ? <CheckIcon className="size-4" /> : null}
                  </span>
                  <span className="flex-1 truncate">{label(m)}</span>
                  <span className="tabular text-sm text-muted-foreground">
                    {shareOf.has(m.id) ? money(shareOf.get(m.id)!) : ''}
                  </span>
                </button>
              </li>
            ) : (
              <li key={m.id} className="flex min-h-12 items-center gap-3 px-2">
                <label htmlFor={`split-${m.id}`} className="flex-1 truncate">
                  {label(m)}
                </label>
                {state.splitMode === 'shares' && shareOf.has(m.id) ? (
                  <span className="tabular text-sm text-muted-foreground">
                    {money(shareOf.get(m.id)!)}
                  </span>
                ) : null}
                <div className="relative w-28">
                  <Input
                    id={`split-${m.id}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular pr-8 text-right"
                    value={state[field][m.id] ?? ''}
                    onChange={(e) =>
                      update({
                        [field]: { ...state[field], [m.id]: e.target.value },
                      } as Partial<ExpenseFormState>)
                    }
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                    {state.splitMode === 'exact'
                      ? ''
                      : state.splitMode === 'percentage'
                        ? '%'
                        : '×'}
                  </span>
                </div>
              </li>
            ),
          )}
        </ul>

        <p
          className={cn('text-sm font-medium', check.shares ? 'text-owed' : 'text-warn')}
          aria-live="polite"
        >
          {check.shares
            ? amount
              ? `Adds up to ${money(amount)}`
              : 'Enter an amount first.'
            : 'reason' in check
              ? check.reason
              : ''}
        </p>
        <Button size="lg" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
