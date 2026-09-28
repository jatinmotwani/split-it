'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { GroupDetail, MemberDto } from '@/lib/contracts/groups';
import { canSendClaimLink, ClaimLink } from './claim-link';

export function statusText(m: MemberDto): string {
  if (m.isMe) return 'you';
  if (m.status === 'placeholder') return 'not joined yet';
  return m.status === 'guest' ? 'joined as guest' : 'joined';
}

/**
 * Everyone in the group. Placeholders are first-class: "Ravi — not joined yet · Send claim link"
 * (SPEC §10). `actions` adds per-person controls (settings: remove, unlink).
 */
export function PeopleList({
  group,
  actions,
}: {
  group: GroupDetail;
  actions?: (m: MemberDto) => ReactNode;
}) {
  const active = group.members.filter((m) => m.active);
  return (
    <section aria-labelledby="people-heading" className="grid gap-1">
      <h3 id="people-heading" className="text-sm font-semibold text-muted-foreground">
        People ({active.length})
      </h3>
      <ul className="grid divide-y">
        {active.map((m) => (
          <li key={m.id} className="grid gap-1 py-1">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{m.displayName}</span>
                <Badge variant={m.status === 'placeholder' ? 'warn' : 'muted'}>
                  {statusText(m)}
                </Badge>
                {m.role === 'owner' ? <Badge variant="muted">owner</Badge> : null}
              </span>
              {actions?.(m)}
            </div>
            {canSendClaimLink(m) ? <ClaimLink group={group} member={m} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
