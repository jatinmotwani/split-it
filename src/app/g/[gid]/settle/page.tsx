import type { Metadata } from 'next';
import { SettleScreen } from '@/features/settle/settle-screen';
import { isUuid } from '@/lib/ids';
import { getDb } from '@/server/db';
import { requirePageMembership } from '@/server/pages';
import { getBalances } from '@/server/services/core/balances';
import { loadEntry } from '@/server/services/core/entries';
import { getGroupDetail } from '@/server/services/core/groups';

export const metadata: Metadata = { title: 'Settle up' };

export default async function SettlePage({
  params,
  searchParams,
}: {
  params: Promise<{ gid: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ gid }, { edit }] = await Promise.all([params, searchParams]);
  const { user, membership } = await requirePageMembership(gid, `/g/${gid}/settle`);
  const [group, balances, editing] = await Promise.all([
    getGroupDetail(membership, user.id),
    getBalances(membership),
    edit && isUuid(edit) ? loadEntry(getDb(), gid, edit).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <SettleScreen
      gid={gid}
      initialGroup={group}
      initialBalances={balances}
      editing={editing && editing.kind === 'settlement' ? editing : undefined}
    />
  );
}
