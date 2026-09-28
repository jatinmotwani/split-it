'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { AppShell } from '@/components/app-shell';
import { ErrorText } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { categoryLabel } from '@/lib/categories';
import type { CommentDto } from '@/lib/contracts/comments';
import type { EntryDto, RevisionDto } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';
import { cn } from '@/lib/cn';
import { uuidv7 } from '@/lib/ids';
import { formatMoney } from '@/lib/money/currency';
import { CategoryIcon } from '@/features/expense/category-icon';
import { dayLabel } from '@/features/group/dates';
import { relativeTime } from '@/features/group/relative-time';
import { useEntryWrite } from '@/features/group/entry-writes';
import { groupTitle } from '@/features/groups/title';
import { nameMap } from '@/features/group/use-group-data';
import { Comments } from './comments';
import { buildHistory } from './history';

const METHOD: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  other: 'Other',
};

export function EntryDetail({
  group,
  initialEntry,
  initialRevisions,
  initialComments,
}: {
  group: GroupDetail;
  initialEntry: EntryDto;
  initialRevisions: RevisionDto[];
  initialComments: CommentDto[];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const gid = group.id;
  const eid = initialEntry.id;
  const name = nameMap(group);
  const { data: entry } = useQuery({
    queryKey: qk.entry(gid, eid),
    queryFn: () => api<EntryDto>(`/groups/${gid}/entries/${eid}`),
    initialData: initialEntry,
  });
  const { data: revisions } = useQuery({
    queryKey: qk.revisions(gid, eid),
    queryFn: () =>
      api<{ revisions: RevisionDto[] }>(`/groups/${gid}/entries/${eid}/revisions`).then(
        (r) => r.revisions,
      ),
    initialData: initialRevisions,
  });

  const refresh = () => {
    for (const key of [
      qk.entry(gid, eid),
      qk.revisions(gid, eid),
      qk.entries(gid),
      qk.balances(gid),
      qk.groups,
      qk.activity(gid),
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const restore = useMutation({
    scope: { id: `entry:${eid}` },
    mutationFn: (version?: number) =>
      sendMutation<EntryDto>({
        method: 'POST',
        path: `/groups/${gid}/entries/${eid}/restore${version ? `?version=${version}` : ''}`,
      }),
    onSuccess: (e) => {
      qc.setQueryData(qk.entry(gid, eid), e);
      refresh();
    },
  });
  // Delete is optimistic: back to the group at once, with Undo. Same scope as the form, so
  // Undo waits for the delete to land.
  const write = useEntryWrite(gid, `entry:${eid}`);
  const remove = () => {
    const path = `/groups/${gid}/entries/${eid}`;
    write.mutate({
      optimistic: { ...entry, deletedAt: new Date().toISOString() },
      request: { id: uuidv7(), method: 'DELETE', path },
    });
    router.push(`/g/${gid}`);
    toast({
      message: `Deleted “${entry.description}”`,
      action: {
        label: 'Undo',
        onClick: () =>
          write.mutate({
            optimistic: { ...entry, deletedAt: null },
            request: { id: uuidv7(), method: 'POST', path: `${path}/restore` },
          }),
      },
    });
  };

  const isSettlement = entry.kind === 'settlement';
  const title = isSettlement
    ? `${name(entry.payers[0]!.memberId)} paid ${name(entry.shares[0]!.memberId)}`
    : entry.description;
  const money = (n: number) => formatMoney(n, entry.currency);
  const history = buildHistory(entry, revisions);
  const error = restore.error;

  return (
    <AppShell
      title={isSettlement ? 'Payment' : 'Expense'}
      back={{ href: `/g/${gid}`, label: `Back to ${groupTitle(group)}` }}
    >
      <div className="grid gap-5">
        {entry.deletedAt ? (
          <Card className="flex items-center justify-between gap-3 border-warn bg-warn-soft p-3">
            <p className="text-sm font-medium text-warn">
              This was deleted. It doesn’t count in balances.
            </p>
            <Button
              size="sm"
              onClick={() => restore.mutate(undefined)}
              disabled={restore.isPending}
            >
              <RotateCcw /> Restore
            </Button>
          </Card>
        ) : null}

        <div className="flex items-start gap-3">
          <span
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary"
            aria-hidden
          >
            <CategoryIcon category={entry.category} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className={cn('text-xl font-semibold break-words', entry.deletedAt && 'line-through')}
            >
              {title}
            </h2>
            <p className="tabular text-3xl font-bold">{money(entry.amount)}</p>
            <p className="text-sm text-muted-foreground">
              {dayLabel(entry.date)}
              {categoryLabel(entry.category) ? ` · ${categoryLabel(entry.category)}` : ''}
              {entry.settlementMethod ? ` · ${METHOD[entry.settlementMethod]}` : ''}
            </p>
          </div>
        </div>

        <Card className="grid gap-3 p-4">
          <section aria-labelledby="paid-heading" className="grid gap-1">
            <h3 id="paid-heading" className="text-sm font-semibold text-muted-foreground">
              Paid by
            </h3>
            {entry.payers.map((p) => (
              <p key={p.memberId} className="tabular flex justify-between">
                <span>{name(p.memberId)}</span>
                <span className="font-medium">{money(p.amount)}</span>
              </p>
            ))}
          </section>
          <section aria-labelledby="split-heading" className="grid gap-1 border-t pt-3">
            <h3 id="split-heading" className="text-sm font-semibold text-muted-foreground">
              {isSettlement
                ? 'Received by'
                : `Split ${entry.split.type === 'equal' ? 'equally' : `by ${entry.split.type}`}`}
            </h3>
            {entry.shares.map((s) => (
              <p
                key={s.memberId}
                className={cn(
                  'tabular flex justify-between',
                  s.memberId === group.myMemberId && 'font-semibold',
                )}
              >
                <span>{name(s.memberId)}</span>
                <span>{money(s.amount)}</span>
              </p>
            ))}
          </section>
        </Card>

        {!entry.deletedAt ? (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/g/${gid}/e/${eid}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Pencil /> Edit
            </Link>
            <Button
              variant="outline"
              onClick={remove}
              disabled={write.isPending}
              className="text-destructive"
            >
              <Trash2 /> Delete
            </Button>
          </div>
        ) : null}
        {error ? (
          <ErrorText>
            {error instanceof ApiError ? error.message : 'Something went wrong. Try again.'}
          </ErrorText>
        ) : null}

        <Comments group={group} entryId={eid} initial={initialComments} />

        <section aria-labelledby="history-heading" className="grid gap-2">
          <h3
            id="history-heading"
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
          >
            <History className="size-4" /> History
          </h3>
          <ol className="grid gap-2">
            {history.map((h) => (
              <li key={h.version} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {h.reason === 'created'
                      ? 'Added'
                      : h.reason === 'delete'
                        ? 'Deleted'
                        : h.reason === 'restore'
                          ? 'Restored'
                          : 'Edited'}{' '}
                    by {h.actorMemberId ? name(h.actorMemberId) : 'someone'}
                  </span>
                  <span className="text-muted-foreground">{relativeTime(h.at)}</span>
                  {h.reason === 'conflict' ? (
                    <Badge variant="warn">edited at the same time</Badge>
                  ) : null}
                </div>
                {h.changes.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {h.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                {h.restorable !== null && h.version === entry.version ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => restore.mutate(h.restorable!)}
                  >
                    Undo this change
                  </Button>
                ) : h.restorable !== null ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => restore.mutate(h.restorable!)}
                  >
                    Restore how it was before
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
