'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/client/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import type { BalancesResponse, ExplainResponse } from '@/lib/contracts/balances';
import type { GroupDetail } from '@/lib/contracts/groups';
import { balanceLabel } from '@/features/money/balance';
import { nameMap } from '@/features/group/use-group-data';
import { ExplainView, routingLines } from './explain-view';

/**
 * "Why?" for any balance. Simplified view: the person's net with its entries plus the routing
 * line (D4). Raw view: for someone else, the entries between you and them.
 */
export function ExplainSheet({
  group,
  balances,
  memberId,
  onClose,
}: {
  group: GroupDetail;
  balances: BalancesResponse;
  memberId: string | null;
  onClose: () => void;
}) {
  const me = group.myMemberId;
  const name = nameMap(group);
  const simplified = balances.simplifyDebts;
  const pair = !simplified && memberId !== null && memberId !== me;
  const query = pair ? `a=${me}&b=${memberId}` : `member=${memberId}`;
  const { data, isLoading } = useQuery({
    queryKey: ['explain', group.id, query],
    queryFn: () => api<ExplainResponse>(`/groups/${group.id}/explain?${query}`),
    enabled: memberId !== null,
  });

  const bal = balances.members.find((m) => m.memberId === memberId)?.balances ?? [];
  const who = memberId === me ? 'you' : memberId ? name(memberId) : '';
  const title = pair
    ? `You and ${who}`
    : bal.length === 0
      ? `${who === 'you' ? 'You' : who}: settled up`
      : `Why ${bal.map((b) => balanceLabel(b.net, b.currency, who).text).join(' and ')}`;

  return (
    <Sheet
      open={memberId !== null}
      onClose={onClose}
      title={title.replace(/^./, (c) => c.toUpperCase())}
    >
      {isLoading || !data ? (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ExplainView
          gid={group.id}
          data={data}
          simplified={simplified}
          subject={who}
          routing={memberId ? routingLines(memberId, balances.suggestions, name) : []}
        />
      )}
    </Sheet>
  );
}
