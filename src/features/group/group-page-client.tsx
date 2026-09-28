'use client';

import { useState } from 'react';
import { SaveAccountCard } from '@/features/auth/save-account-card';
import { ExplainSheet } from '@/features/explain/explain-sheet';
import { InviteButton } from '@/features/invite/invite-sheet';
import { GroupScreen, type GroupScreenProps } from './group-screen';
import { useBalances, useEntries, useGroup } from './use-group-data';

/** Wires the group screen's slots: invite sheet, Explain sheet, and the guest save-account card. */
export function GroupPageClient(props: Pick<GroupScreenProps, 'gid' | 'initial'>) {
  const { data: group } = useGroup(props.gid, props.initial.group);
  const { data: balances } = useBalances(props.gid, props.initial.balances);
  const { data: page } = useEntries(props.gid, props.initial.entries);
  const [explaining, setExplaining] = useState<string | null>(null);
  const me = group.members.find((m) => m.isMe);
  const alone = !group.members.some((m) => !m.isMe && m.active && m.status !== 'placeholder');
  return (
    <>
      <GroupScreen
        {...props}
        inviteAction={<InviteButton group={group} />}
        onBalanceTap={setExplaining}
        notice={
          me?.status === 'guest' && page.entries.length > 0 ? (
            <SaveAccountCard next={`/g/${props.gid}`} alone={alone} />
          ) : null
        }
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
