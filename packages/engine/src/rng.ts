// Randomness is always injected (engine purity). Two sources:
// - seeded sfc32 for solo play, tests and simulations (state is serializable for saves)
// - a crypto-backed adapter for the online server (caller supplies getRandomValues)

export interface Rng {
  /** Uniform unsigned 32-bit integer. */
  nextUint32(): number;
}

export interface SeededRng extends Rng {
  getState(): [number, number, number, number];
}

export function createSeededRng(seed: number): SeededRng {
  // splitmix32 expands one seed into the four sfc32 state words.
  let s = seed >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  return rngFromState([split(), split(), split(), split()]);
}

export function rngFromState(state: readonly [number, number, number, number]): SeededRng {
  let [a, b, c, d] = state;
  return {
    nextUint32() {
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = ((c << 21) | (c >>> 11)) >>> 0;
      c = (c + t) >>> 0;
      return t;
    },
    getState: () => [a, b, c, d],
  };
}

/** Adapter for a cryptographic source, e.g. `(buf) => crypto.getRandomValues(buf)`. */
export function createCryptoRng(fill: (buf: Uint32Array) => void): Rng {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return {
    nextUint32() {
      if (i >= buf.length) {
        fill(buf);
        i = 0;
      }
      return buf[i++] as number;
    },
  };
}

/** Unbiased integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  const limit = 0x100000000 - (0x100000000 % n);
  for (;;) {
    const x = rng.nextUint32();
    if (x < limit) return x % n;
  }
}

export function rollDie(rng: Rng): number {
  return randomInt(rng, 6) + 1;
}

/** True with probability p. */
export function chance(rng: Rng, p: number): boolean {
  return rng.nextUint32() / 0x100000000 < p;
}

/** Fisher-Yates shuffle, returns a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
