import { describe, expect, it } from 'vitest';
import type { Action, TradeBundle } from '../src/index';
import { act, actAt, build, own, P, rollFrom, setup, tryAct, transfers } from './helpers';

const none: TradeBundle = { cash: 0, tiles: [], jailCards: 0 };
const offer = (
  to: 'p0' | 'p1' | 'p2',
  give: Partial<TradeBundle>,
  get: Partial<TradeBundle>,
): Action => ({
  type: 'propose_trade',
  to,
  give: { ...none, ...give },
  get: { ...none, ...get },
});

describe('7.10 Trading', () => {
  it('R-090 / R-091 a trade swaps exactly the listed assets', () => {
    const g = setup();
    own(g, 'p0', 'p01');
    own(g, 'p1', 'p02', 't1');
    act(g, 'p0', offer('p1', { tiles: ['p01'], cash: 100 }, { tiles: ['p02'] }));
    const id = g.state.trades[0]!.id;
    act(g, 'p1', { type: 'accept_trade', id });
    expect(g.state.properties.p01?.owner).toBe('p1');
    expect(g.state.properties.p02?.owner).toBe('p0');
    expect(g.state.properties.t1?.owner).toBe('p1');
    expect(P(g, 'p0').cash).toBe(1400);
    expect(P(g, 'p1').cash).toBe(1600);
    expect(g.state.trades).toEqual([]);
  });

  it('R-090 off-turn trading only with offTurnManagement', () => {
    const on = setup();
    expect(tryAct(on, 'p1', offer('p0', { cash: 10 }, {})).ok).toBe(true);
    const off = setup({ house: { offTurnManagement: false } });
    expect(tryAct(off, 'p1', offer('p0', { cash: 10 }, {})).ok).toBe(false);
    expect(tryAct(off, 'p0', offer('p1', { cash: 10 }, {})).ok).toBe(true);
  });

  it('R-090 no trading while a debt is open', () => {
    const g = setup();
    P(g, 'p0').cash = 10;
    rollFrom(g, 'p0', 0, 1, 3);
    expect(g.state.pending?.kind).toBe('debt');
    expect(tryAct(g, 'p1', offer('p0', { cash: 10 }, {})).ok).toBe(false);
  });

  it('R-090 / R-046 tiles in a group with buildings cannot be traded', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p02', 1);
    expect(tryAct(g, 'p0', offer('p1', { tiles: ['p01'] }, {})).ok).toBe(false);
  });

  it('R-090 jail cards can be traded', () => {
    const g = setup();
    P(g, 'p0').jailCardIds = ['chance08'];
    P(g, 'p0').jailCards = 1;
    g.secrets.chanceOrder = g.secrets.chanceOrder.filter((c) => c !== 'chance08');
    g.state.deckCounts.chance = 15;
    act(g, 'p0', offer('p1', { jailCards: 1 }, { cash: 50 }));
    act(g, 'p1', { type: 'accept_trade', id: g.state.trades[0]!.id });
    expect(P(g, 'p1').jailCardIds).toEqual(['chance08']);
    expect(P(g, 'p0').cash).toBe(1550);
  });

  it('R-091 no loans: you cannot offer more than you hold', () => {
    const g = setup();
    expect(tryAct(g, 'p0', offer('p1', { cash: 1501 }, {})).ok).toBe(false);
    expect(tryAct(g, 'p0', offer('p1', {}, { tiles: ['p01'] })).ok).toBe(false); // p1 doesn't own it
    expect(tryAct(g, 'p0', offer('p1', {}, {})).ok).toBe(false); // empty
    expect(tryAct(g, 'p0', offer('p0', { cash: 1 }, {})).ok).toBe(false); // self
  });

  it('R-092 an offer that became invalid is cancelled at acceptance', () => {
    const g = setup();
    act(g, 'p0', offer('p1', { cash: 1000 }, {}));
    P(g, 'p0').cash = 900; // spent elsewhere
    P(g, 'p1').cash += 600; // keep totals plausible for the ledger-free test
    const id = g.state.trades[0]!.id;
    act(g, 'p1', { type: 'accept_trade', id });
    expect(g.state.trades).toEqual([]);
    expect(g.events.at(-1)).toEqual({ type: 'trade_cancelled', id, reason: 'invalid' });
    expect(P(g, 'p0').cash).toBe(900);
  });

  it('R-093 one open outgoing offer per player; offers expire after 60 seconds', () => {
    const g = setup({ players: 3 });
    act(g, 'p0', offer('p1', { cash: 10 }, {}));
    expect(tryAct(g, 'p0', offer('p2', { cash: 10 }, {})).ok).toBe(false);
    expect(g.state.trades[0]!.expiresAt).toBe(60_000);
    actAt(g, 60_000, 'system', { type: 'system_timeout' });
    expect(g.state.trades).toEqual([]);
    expect(g.events).toContainEqual({ type: 'trade_cancelled', id: 't1', reason: 'expired' });
  });

  it('R-093 the proposer may cancel; the receiver may decline', () => {
    const g = setup();
    act(g, 'p0', offer('p1', { cash: 10 }, {}));
    act(g, 'p0', { type: 'cancel_trade', id: 't1' });
    expect(g.state.trades).toEqual([]);
    act(g, 'p0', offer('p1', { cash: 10 }, {}));
    act(g, 'p1', { type: 'decline_trade', id: 't2' });
    expect(g.state.trades).toEqual([]);
    expect(tryAct(g, 'p0', { type: 'accept_trade', id: 't2' }).ok).toBe(false);
  });

  it('R-094 / R-064 receiving a mortgaged property costs 10% of its mortgage value', () => {
    const g = setup();
    own(g, 'p0', 'p22');
    g.state.properties.p22!.mortgaged = true; // mortgage 200 -> 20
    act(g, 'p0', offer('p1', { tiles: ['p22'] }, { cash: 100 }));
    const ev = act(g, 'p1', { type: 'accept_trade', id: 't1' });
    expect(g.state.properties.p22).toMatchObject({ owner: 'p1', mortgaged: true });
    expect(P(g, 'p1').cash).toBe(1500 - 100 - 20);
    expect(transfers(ev).at(-1)).toMatchObject({ from: 'p1', to: 'bank', amount: 20 });
  });

  it('anti-spam: at most 3 proposals per player per turn', () => {
    const g = setup();
    for (let i = 0; i < 3; i++) {
      act(g, 'p1', offer('p0', { cash: 1 }, {}));
      act(g, 'p1', { type: 'cancel_trade', id: g.state.trades[0]!.id });
    }
    expect(tryAct(g, 'p1', offer('p0', { cash: 1 }, {})).ok).toBe(false);
  });

  it('a bankrupt player’s offers are cancelled', () => {
    const g = setup({ players: 3 });
    act(g, 'p2', offer('p1', { cash: 1 }, {}));
    P(g, 'p0').cash = 10;
    rollFrom(g, 'p0', 0, 1, 3);
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state.trades.map((t) => t.from)).toEqual(['p2']);
  });
});
