import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/index';
import { act, idx, myanmar, own, P, rollFrom, setup, stack, transfers } from './helpers';

describe('7.3 Landing outcomes', () => {
  it('R-020 an unowned property can be bought at list price', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 1, 2); // p02, price 60
    expect(g.state.pending).toEqual({ kind: 'buy', player: 'p0', tile: 'p02', price: 60 });
    act(g, 'p0', { type: 'buy' });
    expect(g.state.properties.p02?.owner).toBe('p0');
    expect(P(g, 'p0').cash).toBe(1440);
    expect(g.state.pending).toBeNull();
  });

  it('R-020 declining starts an auction; without auctionOnDecline the tile stays with the bank', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 1, 2);
    act(g, 'p0', { type: 'decline_buy' });
    expect(g.state.pending).toMatchObject({
      kind: 'auction',
      item: { type: 'property', tile: 'p02' },
    });

    const h = setup({ house: { auctionOnDecline: false } });
    rollFrom(h, 'p0', 0, 1, 2);
    act(h, 'p0', { type: 'decline_buy' });
    expect(h.state.pending).toBeNull();
    expect(h.state.properties.p02?.owner).toBeNull();
    expect(P(h, 'p0').cash).toBe(1500);
  });

  it('R-020 buying is not offered without enough cash', () => {
    const g = setup();
    P(g, 'p0').cash = 50;
    rollFrom(g, 'p0', 0, 1, 2);
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).toEqual(['decline_buy']);
  });

  it('R-020 prices are scaled by the map multiplier (Myanmar)', () => {
    const g = setup({ map: myanmar });
    rollFrom(g, 'p0', 0, 1, 2);
    expect(g.state.pending).toMatchObject({ price: 60_000 });
  });

  it('R-021 landing on another player’s property pays rent; not when mortgaged', () => {
    const g = setup();
    own(g, 'p1', 'p03');
    rollFrom(g, 'p0', 0, 2, 4); // p03, base rent 6
    expect(P(g, 'p0').cash).toBe(1494);
    expect(P(g, 'p1').cash).toBe(1506);

    const h = setup();
    own(h, 'p1', 'p03');
    h.state.properties.p03!.mortgaged = true;
    rollFrom(h, 'p0', 0, 2, 4);
    expect(P(h, 'p0').cash).toBe(1500);
  });

  it('R-022 landing on your own property does nothing', () => {
    const g = setup();
    own(g, 'p0', 'p03');
    const ev = rollFrom(g, 'p0', 0, 2, 4);
    expect(transfers(ev)).toEqual([]);
    expect(g.state.pending).toBeNull();
  });

  it('R-023 Income Tax 200 and Luxury Tax 100 go to the bank', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 1, 3);
    expect(P(g, 'p0').cash).toBe(1300);
    act(g, 'p0', { type: 'end_turn' });
    rollFrom(g, 'p1', 35, 1, 2);
    expect(P(g, 'p1').cash).toBe(1400);
  });

  it('R-023 taxes are scaled (Myanmar) and feed the pot with freeParkingPot', () => {
    const g = setup({ map: myanmar });
    rollFrom(g, 'p0', 0, 1, 3);
    expect(P(g, 'p0').cash).toBe(1_300_000);
    const h = setup({ house: { freeParkingPot: true } });
    rollFrom(h, 'p0', 0, 1, 3);
    expect(h.state.parkingPot).toBe(200);
  });

  it('R-024 a drawn card goes to the bottom of its deck', () => {
    const g = setup();
    stack(g, 'chance', 'chance07'); // collect 50
    rollFrom(g, 'p0', 0, 3, 4); // -> 7 Chance
    expect(P(g, 'p0').cash).toBe(1550);
    expect(g.secrets.chanceOrder.at(-1)).toBe('chance07');
    expect(g.state.deckCounts.chance).toBe(16);
  });

  it('R-024 Get Out of Jail Free is kept by the player', () => {
    const g = setup();
    stack(g, 'chance', 'chance08');
    rollFrom(g, 'p0', 0, 3, 4);
    expect(P(g, 'p0').jailCards).toBe(1);
    expect(g.secrets.chanceOrder).not.toContain('chance08');
    expect(g.state.deckCounts.chance).toBe(15);
  });

  it('R-025 Go To Jail sends you to Jail without passing GO', () => {
    const g = setup();
    rollFrom(g, 'p0', 27, 1, 2);
    expect(P(g, 'p0')).toMatchObject({ position: idx(g, 'jail'), inJail: true });
  });

  it('R-026 Free Parking does nothing (official); with the pot rule you collect the pot', () => {
    const g = setup();
    const ev = rollFrom(g, 'p0', 17, 1, 2);
    expect(transfers(ev)).toEqual([]);

    const h = setup({ house: { freeParkingPot: true } });
    h.state.parkingPot = 300;
    P(h, 'p1').cash -= 300; // keep total money consistent with the pot
    rollFrom(h, 'p0', 17, 1, 2);
    expect(P(h, 'p0').cash).toBe(1800);
    expect(h.state.parkingPot).toBe(0);
  });

  it('R-027 Jail tile is just visiting', () => {
    const g = setup();
    rollFrom(g, 'p0', 7, 1, 2);
    expect(P(g, 'p0')).toMatchObject({ position: 10, inJail: false });
  });
});
