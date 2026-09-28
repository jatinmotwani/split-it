import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './ids';

describe('uuidv7', () => {
  it('produces valid version-7 UUIDs', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]!);
  });

  it('sorts by creation time', () => {
    const a = uuidv7(1_727_000_000_000);
    const b = uuidv7(1_727_000_000_001);
    const c = uuidv7(1_800_000_000_000);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    expect(uuidv7(0x0192_8f3a_6c10).slice(0, 13)).toBe('01928f3a-6c10');
  });

  it('rejects non-UUIDs', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('01928f3a-6c10-0b21-9a4e-1f5a2c3d4e01')).toBe(false); // version 0
  });
});
