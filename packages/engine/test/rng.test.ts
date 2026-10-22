import { describe, expect, it } from 'vitest';
import {
  createCryptoRng,
  createSeededRng,
  randomInt,
  rngFromState,
  rollDie,
  shuffle,
} from '../src/index';

describe('rng', () => {
  it('seeded rng is deterministic and resumable from its state', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 5 }, () => a.nextUint32());
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(seqA);
    const resumed = rngFromState(a.getState());
    expect(resumed.nextUint32()).toBe(a.nextUint32());
  });

  it('dice are 1-6 and roughly uniform', () => {
    const rng = createSeededRng(1);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[rollDie(rng) - 1]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(9_500);
  });

  it('randomInt stays in range; shuffle keeps every item', () => {
    const rng = createSeededRng(2);
    for (let i = 0; i < 1000; i++) expect(randomInt(rng, 7)).toBeLessThan(7);
    const items = Array.from({ length: 16 }, (_, i) => i);
    expect(shuffle(rng, items).sort((x, y) => x - y)).toEqual(items);
  });

  it('crypto adapter draws from the supplied source', () => {
    let n = 0;
    const rng = createCryptoRng((buf) => buf.fill(++n));
    expect(rng.nextUint32()).toBe(1);
  });
});
