import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/index';
import { act, own, P, rollFrom, setup, stack, type G } from './helpers';

function jailP0(g: G, turns = 0) {
  Object.assign(P(g, 'p0'), { inJail: true, position: 10, jailTurns: turns });
}

describe('7.8 Jail', () => {
  it('R-070 three ways in: Go To Jail tile, a card, three doubles', () => {
    const tile = setup();
    rollFrom(tile, 'p0', 27, 1, 2);
    expect(P(tile, 'p0').inJail).toBe(true);

    const card = setup();
    stack(card, 'chance', 'chance10');
    rollFrom(card, 'p0', 4, 1, 2);
    expect(P(card, 'p0')).toMatchObject({ inJail: true, position: 10, cash: 1500 });
    expect(card.state.current).toBe('p1');

    const doubles = setup();
    rollFrom(doubles, 'p0', 0, 2, 2);
    act(doubles, 'p0', { type: 'roll' }, 3, 3);
    act(doubles, 'p0', { type: 'roll' }, 1, 1);
    expect(P(doubles, 'p0').inJail).toBe(true);
  });

  it('R-071 before rolling in Jail you may pay the fine, use a card, or roll', () => {
    const g = setup();
    jailP0(g);
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).toEqual([
      'roll',
      'pay_jail_fine',
    ]);
    P(g, 'p0').jailCardIds = ['chance08'];
    P(g, 'p0').jailCards = 1;
    g.secrets.chanceOrder = g.secrets.chanceOrder.filter((c) => c !== 'chance08');
    g.state.deckCounts.chance = 15;
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).toEqual([
      'roll',
      'pay_jail_fine',
      'use_jail_card',
    ]);
  });

  it('R-072 rolling doubles frees you and you move, but you do not roll again', () => {
    const g = setup();
    jailP0(g);
    act(g, 'p0', { type: 'roll' }, 3, 3); // -> 16 p09
    expect(P(g, 'p0')).toMatchObject({ inJail: false, position: 16 });
    act(g, 'p0', { type: 'decline_buy' });
    expect(g.state.phase).toBe('post_roll');
  });

  it('R-073 a failed roll keeps you in; the third failure pays the fine and moves', () => {
    const g = setup();
    jailP0(g);
    act(g, 'p0', { type: 'roll' }, 1, 2);
    expect(P(g, 'p0')).toMatchObject({ inJail: true, jailTurns: 1, position: 10 });

    const h = setup();
    jailP0(h, 2);
    act(h, 'p0', { type: 'roll' }, 1, 2); // fine 50, move 3 -> 13 p07
    expect(P(h, 'p0')).toMatchObject({ inJail: false, position: 13, cash: 1450 });
  });

  it('R-073 if the fine cannot be paid, a debt opens and the move happens after paying', () => {
    const g = setup();
    jailP0(g, 2);
    P(g, 'p0').cash = 20;
    P(g, 'p1').cash += 1480; // keep money totals realistic; not required by the rules
    own(g, 'p0', 'p01');
    act(g, 'p0', { type: 'roll' }, 1, 2);
    expect(g.state.pending).toMatchObject({
      kind: 'debt',
      debtor: 'p0',
      creditor: 'bank',
      amount: 50,
    });
    expect(P(g, 'p0').position).toBe(10);
    act(g, 'p0', { type: 'mortgage', tile: 'p01' }); // +30
    act(g, 'p0', { type: 'pay_debt' });
    expect(P(g, 'p0')).toMatchObject({ inJail: false, position: 13, cash: 0 });
    expect(g.state.pending).toMatchObject({ kind: 'buy', tile: 'p07' });
  });

  it('R-074 in Jail you still collect rent and may manage property', () => {
    const g = setup();
    Object.assign(P(g, 'p1'), { inJail: true, position: 10 });
    own(g, 'p1', 'p03', 'p05');
    rollFrom(g, 'p0', 0, 2, 4);
    expect(P(g, 'p1').cash).toBe(1506);
    act(g, 'p1', { type: 'mortgage', tile: 'p05' });
    expect(g.state.properties.p05?.mortgaged).toBe(true);
  });

  it('R-075 the fine goes to the bank (or the pot); a used card returns to its deck bottom', () => {
    const g = setup();
    jailP0(g);
    act(g, 'p0', { type: 'pay_jail_fine' });
    expect(P(g, 'p0')).toMatchObject({ inJail: false, cash: 1450 });
    expect(g.state.phase).toBe('pre_roll');

    const pot = setup({ house: { freeParkingPot: true } });
    jailP0(pot);
    act(pot, 'p0', { type: 'pay_jail_fine' });
    expect(pot.state.parkingPot).toBe(50);

    const card = setup();
    jailP0(card);
    P(card, 'p0').jailCardIds = ['chest05'];
    P(card, 'p0').jailCards = 1;
    card.secrets.chestOrder = card.secrets.chestOrder.filter((c) => c !== 'chest05');
    card.state.deckCounts.chest = 15;
    act(card, 'p0', { type: 'use_jail_card' });
    expect(P(card, 'p0')).toMatchObject({ inJail: false, jailCards: 0, cash: 1500 });
    expect(card.secrets.chestOrder.at(-1)).toBe('chest05');
    expect(card.state.deckCounts.chest).toBe(16);
  });
});
