import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@/lib/contracts/activity';
import { describeActivity } from './describe';

const names: Record<string, string> = { a: 'You', r: 'Ravi', n: 'Neel' };
const name = (id: string) => names[id] ?? 'Someone';
const item = (kind: string, data: Record<string, unknown> = {}, actor = 'r', entryId?: string) =>
  ({
    id: '1',
    kind,
    actorMemberId: actor,
    entryId: entryId ?? null,
    data,
    createdAt: '2026-09-28T10:00:00Z',
  }) satisfies ActivityDto;
const say = (a: ActivityDto) => describeActivity(a, name).text;

describe('describeActivity', () => {
  it('describes expenses and edits with amounts', () => {
    expect(
      say(item('entry_created', { description: 'Dinner', amount: 120_000, currency: 'INR' })),
    ).toBe('Ravi added Dinner: ₹1,200');
    expect(
      say(
        item('entry_updated', {
          description: 'Dinner',
          from: { amount: 120_000, currency: 'INR', description: 'Dinner' },
          to: { amount: 150_000, currency: 'INR' },
        }),
      ),
    ).toBe('Ravi changed Dinner: ₹1,200 → ₹1,500');
    expect(
      say(
        item('entry_updated', {
          description: 'Team dinner',
          from: { amount: 120_000, currency: 'INR', description: 'Dinner' },
          to: { amount: 120_000, currency: 'INR' },
        }),
      ),
    ).toBe('Ravi renamed Dinner to Team dinner');
    expect(
      say(
        item('entry_updated', {
          description: 'Dinner',
          from: { amount: 1, currency: 'INR', description: 'Dinner' },
          to: { amount: 1, currency: 'INR' },
          conflict: true,
        }),
      ),
    ).toBe('Ravi edited Dinner (replacing an edit made at the same time)');
    expect(
      say(
        item('entry_updated', {
          description: 'Dinner',
          restoredFrom: 1,
          from: { amount: 150_000, currency: 'INR' },
          to: { amount: 120_000, currency: 'INR' },
        }),
      ),
    ).toBe('Ravi restored an earlier version of Dinner: ₹1,500 → ₹1,200');
    expect(
      say(item('entry_deleted', { description: 'Cab', amount: 45_000, currency: 'INR' }, 'a')),
    ).toBe('You deleted Cab (₹450)');
    expect(say(item('entry_restored', { description: 'Cab' }))).toBe('Ravi restored Cab');
    expect(
      say(
        item('settlement_recorded', {
          description: 'Ravi paid Asha',
          amount: 50_000,
          currency: 'INR',
        }),
      ),
    ).toBe('Ravi recorded a payment: Ravi paid Asha, ₹500');
    expect(say(item('comment_added', { description: 'Dinner' }))).toBe('Ravi commented on Dinner');
  });

  it('links entry activity to the entry', () => {
    expect(
      describeActivity(item('entry_restored', { description: 'Cab' }, 'r', 'e1'), name).entryId,
    ).toBe('e1');
    expect(describeActivity(item('member_left', { name: 'Neel' }, 'n'), name).entryId).toBeNull();
  });

  it('describes people and group changes', () => {
    expect(say(item('group_created', {}, 'a'))).toBe('You created the group');
    expect(say(item('member_added', { name: 'Neel' }))).toBe('Ravi added Neel');
    expect(say(item('member_joined', { name: 'Ravi' }))).toBe('Ravi joined');
    expect(say(item('member_claimed', { name: 'Neel' }, 'n'))).toBe('Neel claimed their spot');
    expect(say(item('member_reclaimed', { name: 'Neel' }, 'n'))).toBe(
      'Neel’s spot was claimed on a new device',
    );
    expect(say(item('member_reclaimed', { name: 'Asha' }, 'a'))).toBe(
      'Your spot was claimed on a new device',
    );
    expect(say(item('member_unlinked', { name: 'Neel' }, 'a'))).toBe(
      'You unlinked Neel; their spot is waiting to be claimed',
    );
    expect(say(item('member_unlinked', { reason: 'account_link_collision' }))).toBe(
      'A guest spot became a placeholder when its owner signed in',
    );
    expect(say(item('member_removed', { name: 'Neel' }, 'a'))).toBe('You removed Neel');
    expect(say(item('member_left', { name: 'Neel' }, 'n'))).toBe('Neel left the group');
    expect(say(item('invite_rotated', {}, 'a'))).toBe('You reset the invite link');
    expect(say(item('group_updated', { changed: { name: 'Goa 2026' } }))).toBe(
      'Ravi renamed the group to Goa 2026',
    );
    expect(
      say(item('group_updated', { changed: { simplifyDebts: false, defaultCurrency: 'USD' } })),
    ).toBe('Ravi set the default currency to USD and turned simplify debts off');
    expect(say(item('group_updated', { changed: { type: 'home' } }))).toBe(
      'Ravi changed the group type to home',
    );
    expect(say(item('something_new', {}, 'x'))).toBe('Someone made a change');
    expect(describeActivity({ ...item('group_created'), actorMemberId: null }, name).text).toBe(
      'Someone created the group',
    );
  });
});
