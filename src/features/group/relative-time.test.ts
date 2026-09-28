import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  it('reads naturally', () => {
    expect(relativeTime('2026-09-28T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-09-28T11:55:00Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-09-28T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-09-27T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toBe('1 Sept 2026');
  });
});
