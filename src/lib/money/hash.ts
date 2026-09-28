/**
 * Deterministic, synchronous 32-bit hashing used to order rounding tie-breaks.
 * Not for security. Identical results in the browser and Node.
 */

/** FNV-1a over UTF-16 code units. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** MurmurHash3 32-bit finalizer. Spreads FNV-1a's output so similar inputs don't cluster. */
export function fmix32(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Sort key for "who gets the leftover unit" (ARCHITECTURE §6.2).
 * Plain FNV-1a is measurably unfair when ids share a prefix; the finalizer fixes that.
 */
export function tieBreakKey(seed: string, memberId: string): number {
  return fmix32(fnv1a(`${seed}:${memberId}`));
}
