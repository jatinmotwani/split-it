'use client';

import { CalendarDays, Coins, UserRound, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { CurrencySelect } from '@/components/currency-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { categoryLabel, suggestCategory } from '@/lib/categories';
import type { EntryDefaults } from '@/lib/contracts/balances';
import type { EntryDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { formatMoney } from '@/lib/money/currency';
import { cn } from '@/lib/cn';
import { dayLabel, todayIso } from '@/features/group/dates';
import { useEntryWrite } from '@/features/group/entry-writes';
import { nameMap } from '@/features/group/use-group-data';
import { AmountKeypad, pressKey } from './amount-keypad';
import { CategoryIcon } from './category-icon';
import { CategorySheet } from './category-sheet';
import { PayerSheet } from './payer-sheet';
import { SplitSheet, splitSummary } from './split-sheet';
import { buildSplit, checkForm, useExpenseForm, type ExpenseFormState } from './use-expense-form';

export type ExpenseFormProps = {
  group: GroupDetail;
  defaults: EntryDefaults;
  /** Present when editing. */
  entry?: EntryDto;
  /** Extra chips from later features (currency picker). */
  extraChips?: (form: {
    state: ExpenseFormState;
    update: (p: Partial<ExpenseFormState>) => void;
  }) => ReactNode;
};

export function Chip({
  icon,
  label,
  onClick,
  warn,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-11 max-w-full items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium hover:bg-muted',
        warn ? 'border-warn text-warn' : 'border-input',
      )}
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

type SheetName = 'payer' | 'split' | 'date' | 'category' | 'currency' | null;

export function ExpenseForm({ group, defaults, entry, extraChips }: ExpenseFormProps) {
  const router = useRouter();
  const { state, update, amount } = useExpenseForm(group, defaults, entry);
  const [entryId] = useState(() => entry?.id ?? uuidv7());
  const [sheet, setSheet] = useState<SheetName>(null);
  const name = nameMap(group);
  const active = group.members.filter((m) => m.active);
  const back = entry ? `/g/${group.id}/e/${entry.id}` : `/g/${group.id}`;
  const check = checkForm(state, amount, entryId);

  const write = useEntryWrite(group.id, `entry:${entryId}`);
  const [submitted, setSubmitted] = useState(false);

  const canSave = check.ok && !submitted;
  const submit = useCallback(() => {
    if (!check.ok || submitted) return;
    const now = new Date().toISOString();
    const body = {
      kind: 'expense' as const,
      description: state.description.trim() || categoryLabel(state.category) || 'Expense',
      category: state.category,
      amount: amount!,
      currency: state.currency,
      date: state.date,
      payers: check.payers,
      split: buildSplit(state),
      ...(entry ? { baseVersion: entry.version } : {}),
    };
    setSubmitted(true);
    // Optimistic: show it in the group right away; the server's answer replaces it.
    write.mutate({
      optimistic: {
        id: entryId,
        groupId: group.id,
        notes: entry?.notes ?? null,
        settlementMethod: null,
        ...body,
        shares: check.shares,
        version: (entry?.version ?? 0) + 1,
        createdByMemberId: entry?.createdByMemberId ?? group.myMemberId,
        updatedByMemberId: entry ? group.myMemberId : null,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
        deletedAt: entry?.deletedAt ?? null,
      },
      request: {
        id: uuidv7(),
        method: 'PUT',
        path: `/groups/${group.id}/entries/${entryId}`,
        body,
      },
    });
    router.push(back);
  }, [check, submitted, state, amount, entry, entryId, group, write, router, back]);

  const onKey = useCallback(
    (k: string) => update({ expr: pressKey(state.expr, k) }),
    [state.expr, update],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (sheet) return;
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
  }, [onKey, submit, sheet]);

  const hasOp = /[+−×÷]/.test(state.expr);
  const payerCount = Object.values(state.payerAmounts).filter((t) => t && Number(t) !== 0).length;
  const payerLabel =
    state.payerMode === 'multiple'
      ? `Paid by ${payerCount} ${payerCount === 1 ? 'person' : 'people'}`
      : `Paid by ${state.payerId === group.myMemberId ? 'you' : name(state.payerId)}`;
  const splitBroken = !check.ok && check.shares === null && amount !== null && amount > 0;
  const payersBroken = !check.ok && check.shares !== null;

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
            {amount !== null && (hasOp || amount > 0)
              ? `${hasOp ? '= ' : ''}${formatMoney(amount, state.currency)}`
              : ''}
          </p>
        </div>

        <Input
          aria-label="Description"
          placeholder="What was it for?"
          maxLength={120}
          value={state.description}
          onChange={(e) =>
            update({
              description: e.target.value,
              // A suggestion only: once someone picks a category, typing leaves it alone.
              ...(state.categoryPicked ? {} : { category: suggestCategory(e.target.value) }),
            })
          }
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
            warn={payersBroken}
            onClick={() => setSheet('payer')}
          />
          <Chip
            icon={<Users className="size-4" />}
            label={splitSummary(state)}
            warn={splitBroken}
            onClick={() => setSheet('split')}
          />
          <Chip
            icon={<CalendarDays className="size-4" />}
            label={dayLabel(state.date)}
            onClick={() => setSheet('date')}
          />
          <Chip
            icon={<CategoryIcon category={state.category} className="size-4" />}
            label={categoryLabel(state.category) ?? 'Category'}
            onClick={() => setSheet('category')}
          />
          <Chip
            icon={<Coins className="size-4" />}
            label={state.currency}
            onClick={() => setSheet('currency')}
          />
          {extraChips?.({ state, update })}
        </div>

        {!check.ok && amount !== null && amount > 0 ? (
          <p className="text-sm font-medium text-warn" aria-live="polite">
            {check.reason}
          </p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto grid max-w-lg gap-2">
          <AmountKeypad onKey={onKey} />
          <Button size="lg" block disabled={!canSave} onClick={submit}>
            Save
          </Button>
        </div>
      </div>

      <PayerSheet
        open={sheet === 'payer'}
        onClose={() => setSheet(null)}
        state={state}
        update={update}
        amount={amount}
        members={active}
      />
      <SplitSheet
        open={sheet === 'split'}
        onClose={() => setSheet(null)}
        state={state}
        update={update}
        amount={amount}
        members={active}
        seed={entryId}
      />
      <CategorySheet
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        value={state.category}
        onChange={(category) => update({ category, categoryPicked: true })}
      />

      <Sheet
        open={sheet === 'currency'}
        onClose={() => setSheet(null)}
        title="Currency"
        description={`Balances stay separate per currency. This group uses ${group.defaultCurrency}.`}
      >
        <div className="grid gap-3">
          <CurrencySelect
            id="expense-currency"
            value={state.currency}
            onChange={(currency) => update({ currency })}
          />
          <Button size="lg" block onClick={() => setSheet(null)}>
            Done
          </Button>
        </div>
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
