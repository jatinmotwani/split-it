import type { ActivityDto } from '@/lib/contracts/activity';
import { formatMoney } from '@/lib/money/currency';

export type ActivityLine = { text: string; entryId: string | null };

type Money = { amount?: number; currency?: string };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const money = (m: Money | undefined) =>
  m && typeof m.amount === 'number' && typeof m.currency === 'string'
    ? formatMoney(m.amount, m.currency, { trimZeros: true })
    : '';

function groupChanges(changed: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('name' in changed) parts.push(`renamed the group to ${str(changed.name)}`);
  if ('type' in changed) parts.push(`changed the group type to ${str(changed.type)}`);
  if ('defaultCurrency' in changed)
    parts.push(`set the default currency to ${str(changed.defaultCurrency)}`);
  if ('simplifyDebts' in changed)
    parts.push(`turned simplify debts ${changed.simplifyDebts ? 'on' : 'off'}`);
  return parts.length > 0 ? parts.join(' and ') : 'changed the group settings';
}

/**
 * One activity row as a sentence ("Asha changed Dinner: ₹1,200 → ₹1,500"). `name` gives "You"
 * for the viewer, so sentences read naturally from each person's phone.
 */
export function describeActivity(a: ActivityDto, name: (memberId: string) => string): ActivityLine {
  const who = a.actorMemberId ? name(a.actorMemberId) : 'Someone';
  const me = who === 'You';
  const d = a.data;
  const desc = str(d.description);
  const entryId = a.entryId;
  const line = (text: string) => ({ text, entryId });

  switch (a.kind) {
    case 'entry_created':
      return line(`${who} added ${desc}: ${money(d as Money)}`);
    case 'settlement_recorded':
      return line(`${who} recorded a payment: ${desc}, ${money(d as Money)}`);
    case 'entry_updated': {
      const from = d.from as (Money & { description?: string }) | undefined;
      const to = d.to as Money | undefined;
      const amountChanged =
        from && to && (from.amount !== to.amount || from.currency !== to.currency);
      if (d.restoredFrom !== undefined) {
        return line(
          `${who} restored an earlier version of ${desc}${amountChanged ? `: ${money(from)} → ${money(to)}` : ''}`,
        );
      }
      const clash = d.conflict ? ' (replacing an edit made at the same time)' : '';
      if (amountChanged)
        return line(`${who} changed ${desc}: ${money(from)} → ${money(to)}${clash}`);
      if (from?.description && from.description !== desc)
        return line(`${who} renamed ${from.description} to ${desc}${clash}`);
      return line(`${who} edited ${desc}${clash}`);
    }
    case 'entry_deleted':
      return line(`${who} deleted ${desc} (${money(d as Money)})`);
    case 'entry_restored':
      return line(`${who} restored ${desc}`);
    case 'comment_added':
      return line(`${who} commented on ${desc}`);
    case 'group_created':
      return line(`${who} created the group`);
    case 'group_updated':
      return line(`${who} ${groupChanges((d.changed as Record<string, unknown>) ?? {})}`);
    case 'member_added':
      return line(`${who} added ${str(d.name)}`);
    case 'member_joined':
      return line(`${who} joined`);
    case 'member_claimed':
      return line(`${who} claimed ${me ? 'your' : 'their'} spot`);
    case 'member_reclaimed':
      return line(`${me ? 'Your' : `${who}’s`} spot was claimed on a new device`);
    case 'member_unlinked':
      return line(
        d.reason === 'account_link_collision'
          ? 'A guest spot became a placeholder when its owner signed in'
          : `${who} unlinked ${str(d.name)}; their spot is waiting to be claimed`,
      );
    case 'member_removed':
      return line(`${who} removed ${str(d.name)}`);
    case 'member_left':
      return line(`${who} left the group`);
    case 'invite_rotated':
      return line(`${who} reset the invite link`);
    default:
      return line(`${who} made a change`);
  }
}
