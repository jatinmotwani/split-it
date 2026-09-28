'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/api';
import { qk } from '@/client/query-keys';
import { wroteRecently } from '@/client/recent-writes';
import type { BalancesResponse } from '@/lib/contracts/balances';
import type { EntriesPage } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';

/**
 * Server-rendered data is fresh unless this tab just wrote to the group: then the render may
 * have raced the write, so it counts as stale and refetches once on mount.
 */
function initialFreshness(gid: string) {
  return wroteRecently(gid) ? { initialDataUpdatedAt: 0 } : {};
}

export function useGroup(gid: string, initial: GroupDetail) {
  return useQuery({
    queryKey: qk.group(gid),
    queryFn: () => api<GroupDetail>(`/groups/${gid}`),
    initialData: initial,
    ...initialFreshness(gid),
  });
}

export function useBalances(gid: string, initial: BalancesResponse) {
  return useQuery({
    queryKey: qk.balances(gid),
    queryFn: () => api<BalancesResponse>(`/groups/${gid}/balances`),
    initialData: initial,
    ...initialFreshness(gid),
  });
}

export function useEntries(gid: string, initial: EntriesPage) {
  return useQuery({
    queryKey: qk.entries(gid),
    queryFn: () => api<EntriesPage>(`/groups/${gid}/entries?limit=50`),
    initialData: initial,
    ...initialFreshness(gid),
  });
}

/** Display name lookup, including people who have left. */
export function nameMap(group: GroupDetail | undefined): (id: string) => string {
  const names = new Map(group?.members.map((m) => [m.id, m.isMe ? 'You' : m.displayName]) ?? []);
  return (id) => names.get(id) ?? 'Someone';
}
