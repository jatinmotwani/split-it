'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { AppShell } from '@/components/app-shell';
import { CurrencySelect } from '@/components/currency-select';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APP_NAME } from '@/config/app';
import { Input, Select } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { BalancesResponse, TransferDto } from '@/lib/contracts/balances';
import { SETTLEMENT_METHODS, type EntryDto, type SaveEntryResponse } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { formatMoney, toDecimalString } from '@/lib/money/currency';
import { cn } from '@/lib/cn';
import { todayIso } from '@/features/group/dates';
import { nameMap, useBalances, useGroup } from '@/features/group/use-group-data';
import { parseTyped } from '@/features/expense/use-expense-form';
import { SimplifySwitch } from './simplify-switch';

const METHOD_LABEL: Record<(typeof SETTLEMENT_METHODS)[number], string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank',
  other: 'Other',
};

type Draft = {
  from: string;
  to: string;
  amount: string;
  currency: string;
  method: (typeof SETTLEMENT_METHODS)[number];
  date: string;
};

export function SettleScreen({
  gid,
  initialGroup,
  initialBalances,
  editing,
}: {
  gid: string;
  initialGroup: GroupDetail;
  initialBalances: BalancesResponse;
  editing?: EntryDto;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: group } = useGroup(gid, initialGroup);
  const { data: balances } = useBalances(gid, initialBalances);
  const name = nameMap(group);
  const active = group.members.filter((m) => m.active);
  const label = (id: string) => (id === group.myMemberId ? 'You' : name(id));
  // Stored text is read by everyone, so it uses real names, never "You".
  const realName = (id: string) => group.members.find((m) => m.id === id)?.displayName ?? 'Someone';

  const [draft, setDraft] = useState<Draft | null>(() =>
    editing
      ? {
          from: editing.payers[0]!.memberId,
          to: editing.shares[0]!.memberId,
          amount: toDecimalString(editing.amount, editing.currency),
          currency: editing.currency,
          method: editing.settlementMethod ?? 'upi',
          date: editing.date,
        }
      : null,
  );

  const invalidate = () => {
    for (const key of [qk.entries(gid), qk.balances(gid), qk.groups, qk.friends, qk.activity(gid)])
      void qc.invalidateQueries({ queryKey: key });
  };

  const record = useMutation({
    mutationFn: (d: Draft) => {
      const amount = parseTyped(d.amount, d.currency);
      if (!amount) throw new ApiError(400, 'invalid_amount', 'Enter an amount.');
      const id = editing?.id ?? uuidv7();
      return sendMutation<SaveEntryResponse>({
        method: 'PUT',
        path: `/groups/${gid}/entries/${id}`,
        body: {
          kind: 'settlement',
          description: `${realName(d.from)} paid ${realName(d.to)}`,
          amount,
          currency: d.currency,
          date: d.date,
          payers: [{ memberId: d.from, amount }],
          split: { type: 'exact', amounts: { [d.to]: amount } },
          settlementMethod: d.method,
          ...(editing ? { baseVersion: editing.version } : {}),
        },
      });
    },
    onSuccess: (res, d) => {
      invalidate();
      toast({
        message: `Recorded ${formatMoney(res.entry.amount, d.currency, { trimZeros: true })} from ${label(d.from)} to ${label(d.to)}`,
      });
      setDraft(null);
      if (editing) router.push(`/g/${gid}/e/${editing.id}`);
    },
  });

  const startFrom = (t: TransferDto) =>
    setDraft({
      from: t.from,
      to: t.to,
      amount: toDecimalString(t.amount, t.currency),
      currency: t.currency,
      method: 'upi',
      date: todayIso(),
    });

  return (
    <AppShell
      title={editing ? 'Edit payment' : 'Settle up'}
      back={{ href: editing ? `/g/${gid}/e/${editing.id}` : `/g/${gid}`, label: 'Back' }}
    >
      <div className="grid gap-5">
        {!editing ? (
          <>
            <p className="text-sm text-muted-foreground">
              Pay each other however you like (cash, UPI, bank), then record it here so balances
              update. No money moves through {APP_NAME}.
            </p>
            <section aria-labelledby="suggested-heading" className="grid gap-2">
              <h2
                id="suggested-heading"
                className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Suggested payments
              </h2>
              {balances.suggestions.length === 0 ? (
                <Card className="flex items-center gap-2 p-4 font-semibold">
                  <Check className="size-5 text-owed" /> Everyone is settled up
                </Card>
              ) : (
                <ul className="grid gap-2">
                  {balances.suggestions.map((t) => (
                    <li key={`${t.currency}-${t.from}-${t.to}`}>
                      <Card className="flex items-center gap-3 p-3">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                          <span className="font-medium">{label(t.from)}</span>
                          <ArrowRight className="size-4 text-muted-foreground" aria-label="pays" />
                          <span className="font-medium">{label(t.to)}</span>
                          <span className="tabular w-full text-lg font-semibold">
                            {formatMoney(t.amount, t.currency)}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          aria-label={`Record ${label(t.from)} paying ${label(t.to)} ${formatMoney(t.amount, t.currency)}`}
                          onClick={() => startFrom(t)}
                        >
                          Record
                        </Button>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({
                    from: group.myMemberId,
                    to: active.find((m) => m.id !== group.myMemberId)?.id ?? group.myMemberId,
                    amount: '',
                    currency: group.defaultCurrency,
                    method: 'upi',
                    date: todayIso(),
                  })
                }
              >
                Record a different payment
              </Button>
            </section>

            <SimplifySwitch group={group} />
          </>
        ) : null}

        {draft ? (
          <Card className="grid gap-3 p-4" aria-label="Record a payment">
            <h2 className="font-semibold">{editing ? 'Payment' : 'Record a payment'}</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label htmlFor="settle-from">From</Label>
                <Select
                  id="settle-from"
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                >
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>
                      {label(m.id)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="settle-to">To</Label>
                <Select
                  id="settle-to"
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                >
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>
                      {label(m.id)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <Field>
                <Label htmlFor="settle-amount">Amount</Label>
                <Input
                  id="settle-amount"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </Field>
              <Field>
                <Label htmlFor="settle-currency">Currency</Label>
                <CurrencySelect
                  id="settle-currency"
                  value={draft.currency}
                  onChange={(currency) => setDraft({ ...draft, currency })}
                />
              </Field>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Paid by</legend>
              <div className="grid grid-cols-4 gap-2">
                {SETTLEMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={draft.method === m}
                    onClick={() => setDraft({ ...draft, method: m })}
                    className={cn(
                      'h-11 rounded-lg border text-sm font-semibold',
                      draft.method === m
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-input bg-card',
                    )}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field>
              <Label htmlFor="settle-date">Date</Label>
              <Input
                id="settle-date"
                type="date"
                value={draft.date}
                onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            {draft.from === draft.to ? <ErrorText>Pick two different people.</ErrorText> : null}
            {record.error ? (
              <ErrorText>
                {record.error instanceof ApiError
                  ? record.error.message
                  : 'Couldn’t record it. Try again.'}
              </ErrorText>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {!editing ? (
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              ) : (
                <span />
              )}
              <Button
                disabled={
                  record.isPending ||
                  draft.from === draft.to ||
                  !parseTyped(draft.amount, draft.currency)
                }
                onClick={() => record.mutate(draft)}
              >
                {record.isPending ? 'Saving…' : 'Save payment'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
