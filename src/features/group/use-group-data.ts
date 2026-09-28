'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/api';
import { qk } from '@/client/query-keys';
import type { BalancesResponse } from '@/lib/contracts/balances';
import type { EntriesPage } from '@/lib/contracts/entries';
import type { GroupDetail } from '@/lib/contracts/groups';

export function useGroup(gid: string, initial: GroupDetail) {
  return useQuery({
    queryKey: qk.group(gid),
    queryFn: () => api<GroupDetail>(`/groups/${gid}`),
    initialData: initial,
  });
}

export function useBalances(gid: string, initial: BalancesResponse) {
  return useQuery({
    queryKey: qk.balances(gid),
    queryFn: () => api<BalancesResponse>(`/groups/${gid}/balances`),
    initialData: initial,
  });
}

export function useEntries(gid: string, initial: EntriesPage) {
  return useQuery({
    queryKey: qk.entries(gid),
    queryFn: () => api<EntriesPage>(`/groups/${gid}/entries?limit=50`),
    initialData: initial,
  });
}

/** Display name lookup, including people who have left. */
export function nameMap(group: GroupDetail | undefined): (id: string) => string {
  const names = new Map(group?.members.map((m) => [m.id, m.isMe ? 'You' : m.displayName]) ?? []);
  return (id) => names.get(id) ?? 'Someone';
}
