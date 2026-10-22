import { describe, expect, it } from 'vitest';
import { createGame, createSeededRng, makeSettings, type SeatInit } from '../src/index';
import { diceRng, dubai, myanmar, setup } from './helpers';

const seats = (n: number): SeatInit[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    token: 't',
    color: '#000000',
    kind: 'human',
  }));

describe('7.1 Setup', () => {
  it('R-001 everyone starts with startingCash scaled to the map currency', () => {
    expect(setup({ map: dubai, players: 3 }).state.players.map((p) => p.cash)).toEqual([
      1500, 1500, 1500,
    ]);
    expect(setup({ map: myanmar }).state.players[0]?.cash).toBe(1_500_000);
    expect(setup({ house: { startingCash: 2000 } }).state.players[0]?.cash).toBe(2000);
  });

  it('R-001 a game needs 2-6 players', () => {
    const rng = createSeededRng(1);
    expect(() => createGame(dubai, makeSettings('official'), seats(1), rng, 0)).toThrow();
    expect(() => createGame(dubai, makeSettings('official'), seats(7), rng, 0)).toThrow();
    expect(
      createGame(dubai, makeSettings('official'), seats(6), rng, 0).state.players,
    ).toHaveLength(6);
  });

  it('R-002 properties start unowned; bank holds 32 houses and 12 hotels', () => {
    const { state } = setup();
    expect(Object.keys(state.properties)).toHaveLength(28);
    expect(Object.values(state.properties).every((p) => p.owner === null && !p.mortgaged)).toBe(
      true,
    );
    expect(state.bank).toEqual({ houses: 32, hotels: 12 });
  });

  it('R-003 decks are shuffled by the rng, hidden in secrets, and reproducible by seed', () => {
    const a = setup({ seed: 7 });
    const b = setup({ seed: 7 });
    const c = setup({ seed: 8 });
    expect(a.secrets).toEqual(b.secrets);
    expect(a.secrets.chanceOrder).not.toEqual(c.secrets.chanceOrder);
    expect([...a.secrets.chanceOrder].sort()).toEqual([...dubai.decks.chance.cardIds].sort());
    expect(a.state.deckCounts).toEqual({ chance: 16, chest: 16 });
    expect(JSON.stringify(a.state)).not.toContain('chance01');
  });

  it('R-004 highest roll-off goes first; tied leaders re-roll', () => {
    // p0 rolls 6, p1 and p2 tie on 12, then p1 rolls 2 and p2 rolls 4.
    const rng = diceRng([3, 3, 6, 6, 6, 6, 1, 1, 2, 2], 99);
    const { state, events } = createGame(dubai, makeSettings('official'), seats(3), rng, 0);
    expect(state.current).toBe('p2');
    expect(state.firstPlayer).toBe('p2');
    const order = events[0];
    expect(order?.type === 'turn_order' && order.rolls).toHaveLength(2);
  });
});
