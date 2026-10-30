import { describe, expect, it } from 'vitest';
import { applyAction, createSeededRng, type PlayerId } from '../src/index';
import { act, build, idx, myanmar, own, P, setup, stack, type G } from './helpers';

// R-901 house luck (secret). Dice tests run many seeded rolls and check the odds.

function koKoGame(): G {
  const g = setup({ map: myanmar });
  P(g, 'p0').name = 'Ko Ko';
  P(g, 'p1').name = 'Thae Thae Lay';
  return g;
}

/** Roll once for `player` from `from` with a seeded rng; returns the game after the roll. */
function rollSeeded(base: G, player: PlayerId, from: number, seed: number): G {
  const g = JSON.parse(JSON.stringify(base)) as G;
  g.state.current = player;
  P(g, player).position = from;
  const res = applyAction(
    { map: g.map, rng: createSeededRng(seed), now: 0 },
    g.state,
    g.secrets,
    player,
    { type: 'roll' },
  );
  if (!res.ok) throw new Error(res.error.message);
  return { ...g, state: res.state, secrets: res.secrets, events: res.events };
}

function landings(base: G, player: PlayerId, from: number, tile: string, n = 600): number {
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const g = rollSeeded(base, player, from, seed);
    if (g.events.some((e) => e.type === 'landed' && e.tile === tile)) hits++;
  }
  return hits;
}

describe('R-901 house luck (secret)', () => {
  it('R-901 Ko Ko always rolls doubles in Jail', () => {
    const base = koKoGame();
    P(base, 'p0').inJail = true;
    for (let seed = 1; seed <= 100; seed++) {
      const g = rollSeeded(base, 'p0', idx(base, 'jail'), seed);
      expect(P(g, 'p0').inJail).toBe(false);
    }
  });

  it('R-901 Ko Ko lands exactly on GO about 40% of the time when it is within reach', () => {
    const base = koKoGame();
    // 40% forced + 60% of the plain 4-in-36 chance of a 9 = ~47%.
    const hits = landings(base, 'p0', 31, 'go', 1000);
    expect(hits).toBeGreaterThan(400);
    expect(hits).toBeLessThan(540);
  });

  it('R-901 Ko Ko never lands on rent he cannot pay, but may when he can', () => {
    const base = koKoGame();
    own(base, 'p1', 'p03', 'p04', 'p05');
    build(base, 'p04', 5); // 7 steps from p01 (index 1 -> 8)
    P(base, 'p0').cash = 1000;
    expect(landings(base, 'p0', 1, 'p04')).toBe(0);
    P(base, 'p0').cash = 100_000_000;
    expect(landings(base, 'p0', 1, 'p04')).toBeGreaterThan(20);
  });

  it('R-901 Ko Ko keeps the better of two rolls about half the time', () => {
    const base = koKoGame();
    // Go To Jail is 7 steps away: plain dice ~100 of 600, with the luck ~58.
    const hits = landings(base, 'p0', 23, 'gotojail');
    expect(hits).toBeGreaterThan(30);
    expect(hits).toBeLessThan(80);
  });

  it('R-901 rent Ko Ko can pay is not avoided: he lands on her hotel at the plain rate', () => {
    const base = koKoGame();
    own(base, 'p1', 'p03', 'p04', 'p05');
    build(base, 'p04', 5);
    P(base, 'p0').cash = 100_000_000;
    // Plain dice: a 7 is one roll in six (~100 of 600).
    expect(landings(base, 'p0', 1, 'p04')).toBeGreaterThan(75);
  });

  it('R-901 Thae Thae Lay drifts onto Ko Ko properties; other names roll plain dice', () => {
    const base = koKoGame();
    own(base, 'p0', 'p04');
    const drift = landings(base, 'p1', 1, 'p04', 3000);
    P(base, 'p1').name = 'Someone';
    const plain = landings(base, 'p1', 1, 'p04', 3000);
    expect(plain).toBeGreaterThan(420); // ~500 = 1 in 6
    expect(plain).toBeLessThan(580);
    expect(drift).toBeGreaterThan(plain + 70); // ~640: +1/3 of 5/6 of 1/6
  });

  it('R-901 nobody else gets luck: another player in Jail can fail', () => {
    const base = koKoGame();
    P(base, 'p0').name = 'Ko Ko Naw';
    P(base, 'p0').inJail = true;
    let stayed = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (P(rollSeeded(base, 'p0', idx(base, 'jail'), seed), 'p0').inJail) stayed++;
    }
    expect(stayed).toBeGreaterThan(50);
  });

  it('R-901 Ko Ko skips bad Chance / Community Chest cards (they go to the bottom)', () => {
    const g = koKoGame();
    stack(g, 'chance', 'chance10', 'chance12', 'chance07');
    P(g, 'p0').position = 0;
    // 3+4 -> chance1 (7); the luck coin (6) asks for a second roll, also 3+4.
    act(g, 'p0', { type: 'roll' }, 3, 4, 6, 3, 4);
    expect(g.events).toContainEqual(
      expect.objectContaining({ type: 'card_drawn', card: 'chance07' }),
    );
    expect(P(g, 'p0').inJail).toBe(false);
    expect(g.secrets.chanceOrder.slice(-3)).toEqual(['chance10', 'chance12', 'chance07']);
  });
});
