'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, UserRound, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { AppShell } from '@/components/app-shell';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import type { EntryDefaults } from '@/lib/contracts/balances';
import type { EntryDto, SaveEntryResponse } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { formatMoney } from '@/lib/money/currency';
import { cn } from '@/lib/cn';
import { dayLabel, todayIso } from '@/features/group/dates';
import { nameMap } from '@/features/group/use-group-data';
import { AmountKeypad, pressKey } from './amount-keypad';
import { buildPayers, buildSplit, useExpenseForm, type ExpenseFormState } from './use-expense-form';

export type ExpenseFormProps = {
  group: GroupDetail;
  defaults: EntryDefaults;
  /** Present when editing. */
  entry?: EntryDto;
  /** Extra chips/sections (split editor, category, currency) from later features. */
  renderExtras?: (form: {
    state: ExpenseFormState;
    update: (p: Partial<ExpenseFormState>) => void;
    amount: number | null;
  }) => ReactNode;
};

function Chip({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

const KEY_MAP: Record<string, string> = {
  '-': '−',
  '*': '×',
  x: '×',
  '/': '÷',
  '+': '+',
  '.': '.',
  Backspace: 'back',
};

function errorText(err: unknown, currency: string): string {
  if (!(err instanceof ApiError)) return 'Couldn’t save. Check your connection and try again.';
  const d = err.details as { remainder?: number } | undefined;
  if (d && typeof d.remainder === 'number' && d.remainder !== 0) {
    const amt = formatMoney(Math.abs(d.remainder), currency);
    return d.remainder > 0
      ? `${err.message} ${amt} is still unassigned.`
      : `${err.message} That’s ${amt} too much.`;
  }
  return err.message;
}

export function ExpenseForm({ group, defaults, entry, renderExtras }: ExpenseFormProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const { state, update, amount } = useExpenseForm(group, defaults, entry);
  const [entryId] = useState(() => entry?.id ?? uuidv7());
  const [sheet, setSheet] = useState<'payer' | 'date' | null>(null);
  const name = nameMap(group);
  const active = group.members.filter((m) => m.active);
  const back = entry ? `/g/${group.id}/e/${entry.id}` : `/g/${group.id}`;

  const save = useMutation({
    mutationFn: () => {
      const total = amount!;
      return sendMutation<SaveEntryResponse>({
        method: 'PUT',
        path: `/groups/${group.id}/entries/${entryId}`,
        body: {
          kind: 'expense',
          description: state.description.trim() || 'Expense',
          category: state.category,
          amount: total,
          currency: state.currency,
          date: state.date,
          payers: buildPayers(state, total),
          split: buildSplit(state),
          ...(entry ? { baseVersion: entry.version } : {}),
        },
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(qk.entry(group.id, entryId), res.entry);
      for (const key of [
        qk.entries(group.id),
        qk.balances(group.id),
        qk.groups,
        qk.defaults(group.id),
        qk.activity(group.id),
        qk.revisions(group.id, entryId),
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      router.push(back);
    },
  });

  const canSave = amount !== null && amount > 0 && !save.isPending;
  const submit = useCallback(() => {
    if (canSave) save.mutate();
  }, [canSave, save]);

  const onKey = useCallback(
    (k: string) => update({ expr: pressKey(state.expr, k) }),
    [state.expr, update],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') return submit();
      const k = /^[0-9]$/.test(e.key) ? e.key : KEY_MAP[e.key];
      if (k) {
        e.preventDefault();
        onKey(k);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKey, submit]);

  const hasOp = /[+−×÷]/.test(state.expr);
  const payerLabel =
    state.payerMode === 'multiple'
      ? `Paid by ${Object.values(state.payerAmounts).filter(Boolean).length} people`
      : `Paid by ${state.payerId === group.myMemberId ? 'you' : name(state.payerId)}`;

  return (
    <AppShell
      title={entry ? 'Edit expense' : 'Add expense'}
      back={{ href: back, label: 'Cancel' }}
      className="pb-[calc(22rem+env(safe-area-inset-bottom))]"
    >
      <div className="grid gap-4">
        <div className="grid gap-1 pt-2 text-center" aria-live="polite">
          <p className="text-sm text-muted-foreground">{group.name}</p>
          <output
            aria-label="Amount"
            className={cn(
              'tabular block min-h-12 text-4xl font-bold break-all',
              !state.expr && 'text-muted-foreground',
            )}
          >
            {state.expr ? state.expr : formatMoney(0, state.currency)}
          </output>
          <p className="tabular min-h-5 text-sm text-muted-foreground">
            {hasOp && amount !== null
              ? `= ${formatMoney(amount, state.currency)}`
              : !hasOp && amount !== null && amount > 0
                ? formatMoney(amount, state.currency)
                : ''}
          </p>
        </div>

        <Input
          aria-label="Description"
          placeholder="What was it for?"
          maxLength={120}
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Chip
            icon={<UserRound className="size-4" />}
            label={payerLabel}
            onClick={() => setSheet('payer')}
          />
          {renderExtras ? null : (
            <Chip
              icon={<Users className="size-4" />}
              label={`Split equally · ${state.participants.length} ${state.participants.length === 1 ? 'person' : 'people'}`}
              onClick={() => {}}
            />
          )}
          <Chip
            icon={<CalendarDays className="size-4" />}
            label={dayLabel(state.date)}
            onClick={() => setSheet('date')}
          />
        </div>

        {renderExtras?.({ state, update, amount })}

        {save.error ? <ErrorText>{errorText(save.error, state.currency)}</ErrorText> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto grid max-w-lg gap-2">
          <AmountKeypad onKey={onKey} />
          <Button size="lg" block disabled={!canSave} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Sheet open={sheet === 'payer'} onClose={() => setSheet(null)} title="Who paid?">
        <ul className="grid gap-1" role="radiogroup" aria-label="Who paid">
          {active.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="radio"
                aria-checked={state.payerMode === 'single' && state.payerId === m.id}
                onClick={() => {
                  update({ payerMode: 'single', payerId: m.id });
                  setSheet(null);
                }}
                className={cn(
                  'flex min-h-12 w-full items-center rounded-lg px-3 text-left',
                  state.payerMode === 'single' && state.payerId === m.id
                    ? 'bg-accent font-semibold text-accent-foreground'
                    : 'hover:bg-muted',
                )}
              >
                {m.isMe ? 'You' : m.displayName}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'date'} onClose={() => setSheet(null)} title="When?">
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                update({ date: todayIso() });
                setSheet(null);
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const d = new Date();
                update({
                  date: todayIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)),
                });
                setSheet(null);
              }}
            >
              Yesterday
            </Button>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
            Pick a date
            <Input
              type="date"
              value={state.date}
              max="2099-12-31"
              onChange={(e) => e.target.value && update({ date: e.target.value })}
            />
          </label>
        </div>
      </Sheet>
    </AppShell>
  );
}
