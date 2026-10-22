import { describe, expect, it } from 'vitest';
import { getLegalActions, netWorth } from '../src/index';
import { act, build, own, P, rollFrom, setup, stack, transfers } from './helpers';

describe('7.9 Debt and bankruptcy', () => {
  it('R-080 owing more than your cash opens a debt; raise cash, then pay', () => {
    const g = setup();
    own(g, 'p1', 'p03');
    build(g, 'p03', 2); // rent 90
    own(g, 'p0', 'p01', 'p02');
    P(g, 'p0').cash = 40;
    rollFrom(g, 'p0', 0, 2, 4);
    expect(g.state.pending).toMatchObject({
      kind: 'debt',
      debtor: 'p0',
      creditor: 'p1',
      amount: 90,
    });
    const types = getLegalActions(g.map, g.state, 'p0').map((a) => a.type);
    expect(types).toContain('declare_bankruptcy');
    expect(types).not.toContain('pay_debt');
    expect(types).not.toContain('end_turn');
    act(g, 'p0', { type: 'mortgage', tile: 'p01' }); // 70
    act(g, 'p0', { type: 'mortgage', tile: 'p02' }); // 100
    act(g, 'p0', { type: 'pay_debt' });
    expect(P(g, 'p0').cash).toBe(10);
    expect(P(g, 'p1').cash).toBe(1590);
    expect(g.state.pending).toBeNull();
    act(g, 'p0', { type: 'end_turn' });
  });

  it('R-081 / R-064 bankruptcy to a player hands over everything; mortgaged tiles cost 10%', () => {
    const g = setup({ players: 3 });
    own(g, 'p1', 'p03');
    build(g, 'p03', 2);
    own(g, 'p0', 'p05', 'p06');
    g.state.properties.p05!.mortgaged = true; // mortgage 60 -> interest 6
    P(g, 'p0').cash = 30;
    P(g, 'p0').jailCardIds = ['chance08'];
    P(g, 'p0').jailCards = 1;
    g.secrets.chanceOrder = g.secrets.chanceOrder.filter((c) => c !== 'chance08');
    g.state.deckCounts.chance = 15;

    rollFrom(g, 'p0', 0, 2, 4);
    const ev = act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(P(g, 'p0')).toMatchObject({ bankrupt: true, cash: 0, jailCards: 0 });
    expect(g.state.properties.p05).toMatchObject({ owner: 'p1', mortgaged: true });
    expect(g.state.properties.p06?.owner).toBe('p1');
    expect(P(g, 'p1').jailCards).toBe(1);
    expect(P(g, 'p1').cash).toBe(1500 + 30 - 6);
    expect(transfers(ev).map((t) => t.reason)).toEqual(['bankruptcy', 'mortgage_interest:p05']);
    expect(g.state.current).toBe('p1');
  });

  it('R-082 bankruptcy to the bank returns properties unmortgaged and jail cards to the deck', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p02');
    g.state.properties.p01!.mortgaged = true;
    P(g, 'p0').cash = 10;
    P(g, 'p0').jailCardIds = ['chest05'];
    P(g, 'p0').jailCards = 1;
    g.secrets.chestOrder = g.secrets.chestOrder.filter((c) => c !== 'chest05');
    g.state.deckCounts.chest = 15;

    rollFrom(g, 'p0', 0, 1, 3); // Income Tax 200
    act(g, 'p0', { type: 'mortgage', tile: 'p02' });
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state.properties.p01).toEqual({ owner: null, mortgaged: false, buildings: 0 });
    expect(g.state.properties.p02).toEqual({ owner: null, mortgaged: false, buildings: 0 });
    expect(g.secrets.chestOrder.at(-1)).toBe('chest05');
    expect(g.state.deckCounts.chest).toBe(16);
    expect(g.state.current).toBe('p1');
  });

  it('R-083 bankruptcy can be declared at any point during a debt', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01');
    P(g, 'p0').cash = 100;
    rollFrom(g, 'p0', 0, 1, 3); // owes 200
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).toContain(
      'declare_bankruptcy',
    );
    act(g, 'p0', { type: 'mortgage', tile: 'p01' });
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(P(g, 'p0').bankrupt).toBe(true);
  });

  it('R-084 "pay each player" debts are settled in seat order', () => {
    const g = setup({ players: 3 });
    P(g, 'p0').cash = 60;
    stack(g, 'chance', 'chance15'); // pay each 50
    rollFrom(g, 'p0', 4, 1, 2);
    expect(P(g, 'p1').cash).toBe(1550);
    expect(g.state.pending).toMatchObject({
      kind: 'debt',
      debtor: 'p0',
      creditor: 'p2',
      amount: 50,
    });
  });

  it('R-084 "collect from each player" queues debts from every other player', () => {
    const g = setup({ players: 3 });
    P(g, 'p1').cash = 5;
    stack(g, 'chest', 'chest09'); // birthday: 10 from each
    rollFrom(g, 'p0', 0, 1, 1); // -> 2 Community Chest
    expect(g.state.pending).toMatchObject({
      kind: 'debt',
      debtor: 'p1',
      creditor: 'p0',
      amount: 10,
    });
    act(g, 'p1', { type: 'declare_bankruptcy' }); // p1 goes bankrupt to p0; queue continues
    expect(P(g, 'p0').cash).toBe(1500 + 5 + 10);
    expect(P(g, 'p2').cash).toBe(1490);
    expect(g.state.current).toBe('p0');
    expect(g.state.phase).toBe('pre_roll'); // p0 rolled doubles and keeps the turn
  });

  it('R-085 the last player standing wins', () => {
    const g = setup();
    P(g, 'p0').cash = 10;
    rollFrom(g, 'p0', 0, 1, 3);
    const ev = act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state).toMatchObject({ phase: 'game_over', winner: 'p1' });
    expect(ev.at(-1)).toEqual({ type: 'game_over', winner: 'p1', reason: 'last_standing' });
    expect(getLegalActions(g.map, g.state, 'p1')).toEqual([]);
  });

  it('net worth = cash + prices (mortgaged at mortgage value) + buildings', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02', 't1');
    g.state.properties.t1!.mortgaged = true;
    build(g, 'p01', 2);
    expect(netWorth(g.map, g.state, 'p0')).toBe(1500 + 60 + 60 + 100 + 2 * 50);
  });
});
