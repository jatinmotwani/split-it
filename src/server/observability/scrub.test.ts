import { describe, expect, it } from 'vitest';
import { scrubEvent } from './scrub';

describe('scrubEvent', () => {
  it('drops cookies, bodies, query strings, unsafe headers and user PII', () => {
    const event = scrubEvent({
      request: {
        cookies: { 'better-auth.session_token': 'secret' },
        data: '{"description":"Dinner with Ravi"}',
        query_string: 'email=a@b.in',
        headers: {
          'User-Agent': 'Chrome',
          cookie: 'x',
          'x-forwarded-for': '1.2.3.4',
          'content-type': 'application/json',
        },
      },
      user: { id: 'u_1', email: 'asha@example.in', ip_address: '1.2.3.4', username: 'Asha' },
    });
    expect(event).toEqual({
      request: { headers: { 'User-Agent': 'Chrome', 'content-type': 'application/json' } },
      user: { id: 'u_1' },
    });
  });

  it('leaves events without request or user alone', () => {
    expect(scrubEvent({ extra: { a: 1 } })).toEqual({ extra: { a: 1 } });
    expect(scrubEvent({ user: { email: 'x@y.in' } })).toEqual({ user: {} });
  });
});
