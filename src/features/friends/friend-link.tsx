'use client';

import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import type { GroupDetail } from '@/lib/contracts/groups';
import { friendOf } from '@/features/groups/title';
import { ClaimLink } from '@/features/members/claim-link';

/** In a 1:1 group: send the friend a claim link (they have no invite link to use). */
export function FriendLinkButton({ group }: { group: GroupDetail }) {
  const [open, setOpen] = useState(false);
  const friend = friendOf(group);
  if (!friend || friend.status === 'account' || !friend.active) return null;
  const joined = friend.status === 'guest';
  return (
    <>
      <button
        type="button"
        aria-label={`Send ${friend.displayName} a link`}
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
      >
        <Link2 className="size-5" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Send ${friend.displayName} a link`}
        description={
          joined
            ? `If ${friend.displayName} lost access on their phone, this link gets them back in.`
            : `${friend.displayName} can see what’s between you and add expenses too. No sign-up needed.`
        }
      >
        <ClaimLink group={group} member={friend} />
      </Sheet>
    </>
  );
}
