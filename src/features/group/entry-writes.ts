'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/client/api';
import { sendMutation, type Mutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { useToast } from '@/components/ui/toast';
import type { EntriesPage, EntryDto, SaveEntryResponse } from '@/lib/contracts/entries';

/** A save, delete or restore of one entry, with what the entry will look like afterwards. */
export type EntryWrite = {
  optimistic: EntryDto;
  /** Its `id` is the Idempotency-Key, so a retry of the same write never applies twice. */
  request: Mutation & { id: string };
};

const writeKey = (gid: string) => ['entry-write', gid] as const;

/** The server's order: newest date first, then newest id (UUIDv7) first. */
function newestFirst(a: EntryDto, b: EntryDto): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Applies entries (saved or still pending) on top of a list; deleted ones drop out. */
export function mergeEntries(list: EntryDto[], overlay: EntryDto[]): EntryDto[] {
  if (overlay.length === 0) return list;
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const e of overlay) byId.set(e.id, e);
  return [...byId.values()].filter((e) => !e.deletedAt).sort(newestFirst);
}

function describe(e: EntryDto): string {
  return e.kind === 'settlement' ? 'the payment' : `“${e.description}”`;
}

/**
 * Every entry write goes through here: the UI moves on at once (the entry shows as pending,
 * see `usePendingEntries`), and the server's answer replaces it. Writes in the same `scope` run
 * one after another, so "Delete" then "Undo" can't race.
 */
export function useEntryWrite(gid: string, scope?: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useMutation({
    mutationKey: writeKey(gid),
    ...(scope ? { scope: { id: scope } } : {}),
    mutationFn: async (w: EntryWrite) => {
      const res = await sendMutation<SaveEntryResponse | EntryDto>(w.request);
      return 'entry' in res ? res.entry : res;
    },
    onMutate: (w) => {
      const key = qk.entry(gid, w.optimistic.id);
      const previous = qc.getQueryData<EntryDto>(key);
      qc.setQueryData(key, w.optimistic);
      return { previous };
    },
    onError: (err, w, ctx) => {
      const key = qk.entry(gid, w.optimistic.id);
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      else qc.removeQueries({ queryKey: key });
      const retryable = !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
      toast({
        message: `Couldn’t save ${describe(w.optimistic)}. ${err.message}`,
        ...(retryable ? { action: { label: 'Retry', onClick: () => m.mutate(w) } } : {}),
      });
    },
    onSuccess: async (saved) => {
      // Stop an in-flight refetch from overwriting the list with a copy from before this write.
      await qc.cancelQueries({ queryKey: qk.entries(gid) });
      qc.setQueryData<EntriesPage>(
        qk.entries(gid),
        (page) => page && { ...page, entries: mergeEntries(page.entries, [saved]) },
      );
      qc.setQueryData(qk.entry(gid, saved.id), saved);
      for (const key of [
        qk.entries(gid),
        qk.balances(gid),
        qk.groups,
        qk.friends,
        qk.defaults(gid),
        qk.activity(gid),
        qk.revisions(gid, saved.id),
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
  return m;
}

/** Entries whose write hasn't been answered yet, for the list to show as "Saving…". */
export function usePendingEntries(gid: string): EntryDto[] {
  return useMutationState({
    filters: { mutationKey: writeKey(gid), status: 'pending' },
    select: (mutation) => (mutation.state.variables as EntryWrite).optimistic,
  });
}
