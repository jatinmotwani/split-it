import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteWrite, wroteRecently } from './recent-writes';

const gid = '01928f3e-0000-7000-8000-000000000001';

describe('recent writes', () => {
  afterEach(() => vi.useRealTimers());

  // Runs first: the module keeps state between tests.
  it('ignores writes that are not about a group', () => {
    noteWrite('/claims/abc');
    noteWrite('/groups');
    expect(wroteRecently()).toBe(false);
  });

  it('remembers group writes for 30 seconds', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(wroteRecently(gid)).toBe(false);
    noteWrite(`/groups/${gid}/entries/x`);
    expect(wroteRecently(gid)).toBe(true);
    expect(wroteRecently()).toBe(true);
    vi.advanceTimersByTime(30_001);
    expect(wroteRecently(gid)).toBe(false);
    expect(wroteRecently()).toBe(false);
  });
});
