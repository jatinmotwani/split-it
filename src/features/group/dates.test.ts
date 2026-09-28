import { describe, expect, it } from 'vitest';
import { dayLabel, todayIso } from './dates';

describe('dayLabel', () => {
  const now = new Date(2026, 8, 28, 15, 0); // 28 Sep 2026, local time
  it('names today and yesterday', () => {
    expect(todayIso(now)).toBe('2026-09-28');
    expect(dayLabel('2026-09-28', now)).toBe('Today');
    expect(dayLabel('2026-09-27', now)).toBe('Yesterday');
  });
  it('uses a short weekday date this year and the year otherwise', () => {
    expect(dayLabel('2026-09-21', now)).toBe('Mon, 21 Sept');
    expect(dayLabel('2025-12-31', now)).toBe('31 Dec 2025');
  });
});
