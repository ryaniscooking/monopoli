import { describe, expect, it } from 'vitest';
import { getLegalActions, minimumBid } from '../src/index';
import { act, actAt, own, P, rollFrom, setup, tryAct } from './helpers';

function auctionFor(tile = 'p02', players = 3) {
  const g = setup({ players });
  rollFrom(g, 'p0', 0, 1, 2); // p02, price 60
  act(g, 'p0', { type: 'decline_buy' });
  expect(g.state.pending).toMatchObject({ kind: 'auction', item: { type: 'property', tile } });
  return g;
}

describe('7.6 Auctions', () => {
  it('R-050 declining to buy starts an auction', () => {
    const g = auctionFor();
    expect(g.events.some((e) => e.type === 'auction_started')).toBe(true);
  });

  it('R-051 everyone may bid, including the decliner; bids start at 1 classic unit', () => {
    const g = auctionFor();
    expect(g.state.pending?.kind === 'auction' && g.state.pending.active).toEqual([
      'p0',
      'p1',
      'p2',
    ]);
    expect(minimumBid(g.map, g.state)).toBe(1);
    act(g, 'p0', { type: 'auction_bid', amount: 5 });
    expect(minimumBid(g.map, g.state)).toBe(6);
    expect(tryAct(g, 'p1', { type: 'auction_bid', amount: 5 }).ok).toBe(false);
    expect(tryAct(g, 'p1', { type: 'auction_bid', amount: 2000 }).ok).toBe(false);
  });

  it('R-051 the minimum bid scales with the map (Myanmar: 1,000 Ks)', async () => {
    const { myanmar } = await import('./helpers');
    const g = setup({ map: myanmar });
    rollFrom(g, 'p0', 0, 1, 2);
    act(g, 'p0', { type: 'decline_buy' });
    expect(minimumBid(g.map, g.state)).toBe(1000);
  });

  it('R-052 ends when all but the high bidder withdraw; the high bidder pays', () => {
    const g = auctionFor();
    act(g, 'p1', { type: 'auction_bid', amount: 40 });
    expect(getLegalActions(g.map, g.state, 'p1').map((a) => a.type)).not.toContain(
      'auction_withdraw',
    );
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p2', { type: 'auction_withdraw' });
    expect(g.state.pending).toBeNull();
    expect(g.state.properties.p02?.owner).toBe('p1');
    expect(P(g, 'p1').cash).toBe(1460);
  });

  it('R-052 the timer ends the auction; each bid resets it', () => {
    const g = auctionFor();
    const first = g.state.pending?.kind === 'auction' ? g.state.pending.deadline : 0;
    expect(first).toBe(15_000);
    actAt(g, 10_000, 'p2', { type: 'auction_bid', amount: 30 });
    expect(g.state.pending?.kind === 'auction' && g.state.pending.deadline).toBe(25_000);
    expect(tryAct(g, 'system', { type: 'system_timeout' }).ok).toBe(false); // not due at t=0
    actAt(g, 25_000, 'system', { type: 'system_timeout' });
    expect(g.state.properties.p02?.owner).toBe('p2');
  });

  it('R-052 no bids: the property stays with the bank', () => {
    const g = auctionFor();
    actAt(g, 15_000, 'system', { type: 'system_timeout' });
    expect(g.state.pending).toBeNull();
    expect(g.state.properties.p02?.owner).toBeNull();
    expect(g.events.at(-1)).toMatchObject({ type: 'auction_ended', winner: null });
  });

  it('R-053 bids are cash only and capped at the bidder’s cash', () => {
    const g = auctionFor();
    P(g, 'p1').cash = 20;
    expect(tryAct(g, 'p1', { type: 'auction_bid', amount: 21 }).ok).toBe(false);
    expect(tryAct(g, 'p1', { type: 'auction_bid', amount: 20 }).ok).toBe(true);
    expect(tryAct(g, 'p1', { type: 'auction_bid', amount: 20.5 }).ok).toBe(false);
  });

  it('R-082 bankruptcy to the bank auctions the properties one by one', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p03');
    P(g, 'p0').cash = 10;
    rollFrom(g, 'p0', 0, 1, 3); // Income Tax 200
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state.pending).toMatchObject({ kind: 'auction', item: { tile: 'p01' } });
    expect(g.state.auctionQueue).toEqual(['p03']);
    expect(g.state.pending?.kind === 'auction' && g.state.pending.active).toEqual(['p1', 'p2']);
    act(g, 'p1', { type: 'auction_withdraw' });
    act(g, 'p2', { type: 'auction_withdraw' });
    expect(g.state.pending).toMatchObject({ kind: 'auction', item: { tile: 'p03' } });
    expect(g.state.current).toBe('p1');
  });

  it('nothing else happens while an auction runs (no roll, no trades, no building)', () => {
    const g = auctionFor();
    own(g, 'p1', 'p03', 'p04', 'p05');
    const types = getLegalActions(g.map, g.state, 'p1').map((a) => a.type);
    expect(types).not.toContain('build');
    expect(types).toContain('mortgage'); // raising cash for a bid is fine
    expect(
      tryAct(g, 'p1', {
        type: 'propose_trade',
        to: 'p2',
        give: { cash: 10, tiles: [], jailCards: 0 },
        get: { cash: 0, tiles: [], jailCards: 0 },
      }).ok,
    ).toBe(false);
  });
});
