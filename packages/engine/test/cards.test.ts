import { describe, expect, it } from 'vitest';
import { cardText, makeSettings } from '../src/index';
import { build, dubai, idx, myanmar, own, P, rollFrom, setup, stack } from './helpers';

// Chance tiles: 7, 22, 36. Community Chest tiles: 2, 17, 33.
describe('Card effects (R-024)', () => {
  it('advance_to GO collects the salary', () => {
    const g = setup();
    stack(g, 'chance', 'chance01');
    rollFrom(g, 'p0', 4, 1, 2);
    expect(P(g, 'p0')).toMatchObject({ position: 0, cash: 1700 });
  });

  it('advance_to a tile collects GO only if passed', () => {
    const g = setup();
    stack(g, 'chance', 'chance02'); // -> p14 (24)
    rollFrom(g, 'p0', 4, 1, 2); // from 7: no GO
    expect(P(g, 'p0')).toMatchObject({ position: idx(g, 'p14'), cash: 1500 });
    expect(g.state.pending).toMatchObject({ kind: 'buy', tile: 'p14' });

    const h = setup();
    stack(h, 'chance', 'chance02');
    rollFrom(h, 'p0', 33, 1, 2); // from 36: passes GO
    expect(P(h, 'p0')).toMatchObject({ position: idx(h, 'p14'), cash: 1700 });
  });

  it('collect and pay', () => {
    const g = setup();
    stack(g, 'chest', 'chest02'); // collect 200
    rollFrom(g, 'p0', 0, 1, 1);
    expect(P(g, 'p0').cash).toBe(1700);
    const h = setup();
    stack(h, 'chance', 'chance12'); // pay 15
    rollFrom(h, 'p0', 4, 1, 2);
    expect(P(h, 'p0').cash).toBe(1485);
  });

  it('pay goes to the pot with freeParkingPot', () => {
    const g = setup({ house: { freeParkingPot: true } });
    stack(g, 'chest', 'chest11'); // pay 100
    rollFrom(g, 'p0', 0, 1, 1);
    expect(g.state.parkingPot).toBe(100);
  });

  it('repairs charge per house and per hotel', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 3);
    build(g, 'p02', 5);
    stack(g, 'chest', 'chest14'); // 40 per house, 115 per hotel
    rollFrom(g, 'p0', 0, 1, 1);
    expect(P(g, 'p0').cash).toBe(1500 - 3 * 40 - 115);
  });

  it('move_back 3 lands on the new tile', () => {
    const g = setup();
    stack(g, 'chance', 'chance09');
    rollFrom(g, 'p0', 4, 1, 2); // 7 -> back to 4 Income Tax
    expect(P(g, 'p0')).toMatchObject({ position: 4, cash: 1300 });
  });

  it('go_to_jail does not pass GO', () => {
    const g = setup();
    stack(g, 'chance', 'chance10');
    rollFrom(g, 'p0', 33, 1, 2); // 36
    expect(P(g, 'p0')).toMatchObject({ position: 10, inJail: true, cash: 1500 });
  });

  it('advance_nearest wraps around the board', () => {
    const g = setup();
    stack(g, 'chance', 'chance05');
    rollFrom(g, 'p0', 33, 1, 2); // 36 -> nearest transport is t1 (5), passing GO
    expect(P(g, 'p0')).toMatchObject({ position: 5, cash: 1700 });
  });

  it('card text fills placeholders with formatted map money', () => {
    const settings = makeSettings('official');
    const go = myanmar.cards.chance01;
    const pay = myanmar.cards.chance12;
    const repairs = dubai.cards.chest14;
    if (!go || !pay || !repairs) throw new Error('missing cards');
    expect(cardText(myanmar, go, settings)).toContain('200,000 Ks');
    expect(cardText(myanmar, pay, settings)).toBe('A traffic police fine. Pay 15,000 Ks.');
    expect(cardText(dubai, repairs, settings)).toBe(
      'Street repairs: pay AED 40 per house and AED 115 per hotel.',
    );
  });
});
