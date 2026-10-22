/**
 * Deterministic pseudo-random value in [0, 1) from the given parts (FNV-1a hash).
 * Used where a bot needs a stable random-looking choice (e.g. its maximum bid for one auction)
 * that must not change each time it is asked, and must not depend on who is asked first.
 */
export function stableNoise(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h = (h ^ ch.charCodeAt(0)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // MurmurHash3 finalizer: spread small input differences across all bits.
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}

/** Bots raise by at least 10 classic units so auctions against bots finish quickly. */
export function botBid(min: number, max: number, m: number, cash: number): number | null {
  if (min > max || min > cash) return null;
  return Math.min(Math.floor(max), cash, min + 9 * m);
}
