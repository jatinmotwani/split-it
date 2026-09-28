import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../test/db';
import { jsonRequest, readJson, signInGuest } from '../../../test/helpers';
import { POST as postEvent } from '../../app/api/events/route';
import { setAnalyticsClientForTesting, track, type AnalyticsClient } from './track';

function fakeClient() {
  const captured: unknown[] = [];
  const client: AnalyticsClient = {
    capture: (m) => void captured.push(m),
    flush: async () => {},
  };
  return { client, captured };
}

describe('track()', () => {
  afterEach(() => setAnalyticsClientForTesting(undefined));

  it('captures an allow-listed event with valid props', () => {
    const { client, captured } = fakeClient();
    setAnalyticsClientForTesting(client);
    expect(track('group_created', { groupType: 'trip', currency: 'INR' }, 'u_1')).toBe(true);
    expect(captured).toEqual([
      {
        distinctId: 'u_1',
        event: 'group_created',
        properties: { groupType: 'trip', currency: 'INR', $process_person_profile: false },
      },
    ]);
  });

  it('drops events with unknown or free-text properties', () => {
    const { client, captured } = fakeClient();
    setAnalyticsClientForTesting(client);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      track('group_created', { groupType: 'trip', currency: 'INR', name: 'Goa' } as never, 'u_1'),
    ).toBe(false);
    expect(track('nope' as never, {} as never, 'u_1')).toBe(false);
    expect(captured).toEqual([]);
    warn.mockRestore();
  });

  it('does nothing without a PostHog key', () => {
    setAnalyticsClientForTesting(null);
    expect(track('wrapped_viewed', {}, 'u_1')).toBe(false);
  });
});

describe('POST /api/events', () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ close } = await useTestDb());
  });
  afterAll(async () => close());
  afterEach(() => setAnalyticsClientForTesting(undefined));

  it('accepts client events from signed-out visitors with an anonymous id', async () => {
    const { client, captured } = fakeClient();
    setAnalyticsClientForTesting(client);
    const anonymousId = crypto.randomUUID();
    const res = await postEvent(
      jsonRequest('/api/events', {
        method: 'POST',
        body: { event: 'wrapped_viewed', anonymousId },
      }),
    );
    expect(res.status).toBe(202);
    expect(captured).toMatchObject([{ distinctId: anonymousId, event: 'wrapped_viewed' }]);
  });

  it('uses the user id when signed in, and rejects server-only events', async () => {
    const { client, captured } = fakeClient();
    setAnalyticsClientForTesting(client);
    const guest = await signInGuest('Kabir');
    await postEvent(
      jsonRequest('/api/events', {
        method: 'POST',
        body: { event: 'install_prompt_shown' },
        cookie: guest.cookie,
      }),
    );
    expect(captured).toMatchObject([{ distinctId: guest.id }]);

    const res = await postEvent(
      jsonRequest('/api/events', {
        method: 'POST',
        body: { event: 'expense_added', props: {} },
        cookie: guest.cookie,
      }),
    );
    expect(res.status).toBe(400);
    expect((await readJson<{ error: { message: string } }>(res)).error.message).toBe(
      'Unknown event.',
    );
  });
});
