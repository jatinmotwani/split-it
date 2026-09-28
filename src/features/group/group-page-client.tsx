'use client';

import { useState } from 'react';
import { ExplainSheet } from '@/features/explain/explain-sheet';
import { InviteButton } from '@/features/invite/invite-sheet';
import { GroupScreen, type GroupScreenProps } from './group-screen';
import { useBalances, useGroup } from './use-group-data';

/** Wires the group screen's slots: invite sheet and the Explain sheet on every balance. */
export function GroupPageClient(props: Pick<GroupScreenProps, 'gid' | 'initial'>) {
  const { data: group } = useGroup(props.gid, props.initial.group);
  const { data: balances } = useBalances(props.gid, props.initial.balances);
  const [explaining, setExplaining] = useState<string | null>(null);
  return (
    <>
      <GroupScreen
        {...props}
        inviteAction={<InviteButton group={group} />}
        onBalanceTap={setExplaining}
      />
      <ExplainSheet
        group={group}
        balances={balances}
        memberId={explaining}
        onClose={() => setExplaining(null)}
      />
    </>
  );
}
