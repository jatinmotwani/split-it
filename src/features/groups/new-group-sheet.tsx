'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { CurrencySelect } from '@/components/currency-select';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { DEFAULT_CURRENCY } from '@/config/app';
import type { GroupDetail, GroupType } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { cn } from '@/lib/cn';
import { GROUP_TYPE_OPTIONS } from './group-types';

export function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [id] = useState(() => uuidv7());

  const create = useMutation({
    mutationFn: () =>
      sendMutation<GroupDetail>({
        id,
        method: 'POST',
        path: '/groups',
        body: { id, name: name.trim(), type, defaultCurrency: currency },
      }),
    onSuccess: (g) => {
      qc.setQueryData(qk.group(g.id), g);
      void qc.invalidateQueries({ queryKey: qk.groups });
      router.push(`/g/${g.id}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <form onSubmit={submit} className="grid gap-4">
        <Field>
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            required
            maxLength={60}
            placeholder="Goa trip, Flat 4B…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Type</legend>
          <div className="grid grid-cols-4 gap-2">
            {GROUP_TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={type === t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'h-11 rounded-lg border text-sm font-semibold',
                  type === t.value
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-input bg-card',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <Field>
          <Label htmlFor="group-currency">Currency</Label>
          <CurrencySelect id="group-currency" value={currency} onChange={setCurrency} />
        </Field>
        {create.error ? (
          <ErrorText>
            {create.error instanceof ApiError ? create.error.message : 'Couldn’t create the group.'}
          </ErrorText>
        ) : null}
        <Button type="submit" size="lg" block disabled={create.isPending || !name.trim()}>
          {create.isPending ? 'Creating…' : 'Create group'}
        </Button>
      </form>
    </Sheet>
  );
}
