import { describe, expect, it } from 'vitest';
import { getLegalActions, rentFor, sellValue } from '../src/index';
import { act, build, own, P, setup, tryAct, type G } from './helpers';

const builds = (g: G, p: 'p0' | 'p1' | 'p2') =>
  getLegalActions(g.map, g.state, p)
    .filter((a) => a.type === 'build')
    .map((a) => ('tile' in a ? a.tile : ''));

describe('7.5 Buying and building', () => {
  it('R-040 building needs the whole color set with nothing mortgaged', () => {
    const g = setup();
    own(g, 'p0', 'p01');
    expect(builds(g, 'p0')).toEqual([]);
    own(g, 'p0', 'p02');
    expect(builds(g, 'p0')).toEqual(['p01', 'p02']);
    g.state.properties.p02!.mortgaged = true;
    expect(builds(g, 'p0')).toEqual([]);
  });

  it('R-040 off-turn building only with offTurnManagement', () => {
    const on = setup();
    own(on, 'p1', 'p01', 'p02');
    expect(tryAct(on, 'p1', { type: 'build', tile: 'p01' }).ok).toBe(true);
    const off = setup({ house: { offTurnManagement: false } });
    own(off, 'p1', 'p01', 'p02');
    expect(tryAct(off, 'p1', { type: 'build', tile: 'p01' }).ok).toBe(false);
  });

  it('R-041 build evenly across the group (toggle evenBuild)', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    act(g, 'p0', { type: 'build', tile: 'p01' });
    expect(builds(g, 'p0')).toEqual(['p02']);
    const h = setup({ house: { evenBuild: false } });
    own(h, 'p0', 'p01', 'p02');
    act(h, 'p0', { type: 'build', tile: 'p01' });
    act(h, 'p0', { type: 'build', tile: 'p01' });
    expect(h.state.properties.p01?.buildings).toBe(2);
  });

  it('R-042 four houses, then a hotel that returns the houses to the bank', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 4);
    build(g, 'p02', 4);
    expect(g.state.bank.houses).toBe(24);
    act(g, 'p0', { type: 'build', tile: 'p01' });
    expect(g.state.properties.p01?.buildings).toBe(5);
    expect(g.state.bank).toEqual({ houses: 28, hotels: 11 });
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(250);
    expect(builds(g, 'p0')).toEqual(['p02']);
  });

  it('R-043 a house costs the group house cost; a hotel costs one more house', () => {
    const g = setup();
    own(g, 'p0', 'p21', 'p22');
    act(g, 'p0', { type: 'build', tile: 'p21' });
    expect(P(g, 'p0').cash).toBe(1300);
    build(g, 'p21', 4);
    build(g, 'p22', 4);
    act(g, 'p0', { type: 'build', tile: 'p22' });
    expect(P(g, 'p0').cash).toBe(1100);
  });

  it('R-043 no build without enough cash', () => {
    const g = setup();
    own(g, 'p0', 'p21', 'p22');
    P(g, 'p0').cash = 199;
    expect(builds(g, 'p0')).toEqual([]);
  });

  it('R-044 buildings sell back evenly for half their cost', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 2);
    build(g, 'p02', 1);
    expect(tryAct(g, 'p0', { type: 'sell_building', tile: 'p02' }).ok).toBe(false);
    act(g, 'p0', { type: 'sell_building', tile: 'p01' });
    expect(P(g, 'p0').cash).toBe(1525);
    expect(g.state.properties.p01?.buildings).toBe(1);
  });

  it('R-044 sellValue matches what a sale pays (hotel with and without 4 bank houses)', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 5);
    build(g, 'p02', 4);
    expect(sellValue(g.map, g.state, 'p01')).toBe(25); // brown house cost 50, half
    expect(sellValue(g.map, g.state, 'p03' as never)).toBe(0);
    own(g, 'p2', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17');
    for (const t of ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'] as const) build(g, t, 4);
    expect(g.state.bank.houses).toBe(0);
    expect(sellValue(g.map, g.state, 'p01')).toBe(125); // whole hotel: 5 x 25
    const before = P(g, 'p0').cash;
    act(g, 'p0', { type: 'sell_building', tile: 'p01' });
    expect(P(g, 'p0').cash - before).toBe(125);
  });

  it('R-080 selling buildings is allowed while raising cash for a debt', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 1);
    build(g, 'p02', 1);
    P(g, 'p0').cash = 0;
    g.state.phase = 'post_roll';
    g.state.pending = {
      kind: 'debt',
      debtor: 'p0',
      creditor: 'p1',
      amount: 40,
      reason: 'rent',
      queue: [],
      then: null,
    };
    const legal = getLegalActions(g.map, g.state, 'p0');
    expect(legal).toContainEqual({ type: 'sell_building', tile: 'p01' });
    expect(legal.some((a) => a.type === 'mortgage')).toBe(false); // set has buildings (R-060)
  });

  it('R-044 a hotel sells back to 4 houses, or to nothing when the bank has no 4 houses', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 5);
    build(g, 'p02', 4);
    act(g, 'p0', { type: 'sell_building', tile: 'p01' });
    expect(g.state.properties.p01?.buildings).toBe(4);
    expect(P(g, 'p0').cash).toBe(1525);

    const h = setup({ players: 3 });
    own(h, 'p0', 'p01', 'p02');
    build(h, 'p01', 5);
    build(h, 'p02', 4);
    own(h, 'p2', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17');
    for (const t of ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'] as const) build(h, t, 4);
    expect(h.state.bank.houses).toBe(0);
    act(h, 'p0', { type: 'sell_building', tile: 'p01' });
    expect(h.state.properties.p01?.buildings).toBe(0);
    expect(P(h, 'p0').cash).toBe(1500 + 5 * 25);
  });

  it('R-045 no houses left in the bank: nobody can build a house', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p02');
    own(g, 'p2', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17');
    for (const t of ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16'] as const)
      build(g, t, 4);
    expect(g.state.bank.houses).toBe(0);
    expect(builds(g, 'p0')).toEqual([]);
    const h = setup({ house: { unlimitedBuildings: true } });
    own(h, 'p0', 'p01', 'p02');
    h.state.bank.houses = 0;
    expect(builds(h, 'p0')).toEqual(['p01', 'p02']);
  });

  it('R-045 a shortage sends the house to auction among the players who want one', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p02');
    own(g, 'p1', 'p03', 'p04', 'p05');
    own(g, 'p2', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17');
    for (const t of ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'] as const) build(g, t, 4);
    build(g, 'p16', 3);
    expect(g.state.bank.houses).toBe(1);

    act(g, 'p0', { type: 'build', tile: 'p01' });
    expect(g.state.pending).toMatchObject({
      kind: 'auction',
      item: { type: 'building', building: 'house', requestedBy: 'p0', tile: 'p01' },
      minBid: 50,
    });
    expect(g.state.pending?.kind === 'auction' && g.state.pending.active).toEqual([
      'p0',
      'p1',
      'p2',
    ]);
    act(g, 'p1', { type: 'auction_bid', amount: 60 });
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p2', { type: 'auction_withdraw' });
    expect(P(g, 'p1').cash).toBe(1440);
    expect(g.state.properties.p05?.buildings).toBe(1); // placed on p1's own set
    expect(g.state.bank.houses).toBe(0);
  });

  it('R-046 buildings are not trade assets (covered in trade tests); mortgaging needs an empty group', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 1);
    expect(tryAct(g, 'p0', { type: 'mortgage', tile: 'p02' }).ok).toBe(false);
  });

  it('R-081 bankruptcy sells buildings to the bank first; proceeds go to the creditor', () => {
    const g = setup({ players: 3 });
    own(g, 'p0', 'p01', 'p02');
    build(g, 'p01', 2);
    build(g, 'p02', 2);
    own(g, 'p1', 'p03', 'p04', 'p05');
    build(g, 'p03', 3);
    build(g, 'p04', 3);
    build(g, 'p05', 3);
    P(g, 'p0').cash = 0;
    P(g, 'p0').position = 0;
    act(g, 'p0', { type: 'roll' }, 2, 4); // p03 with 3 houses: rent 270
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state.properties.p01).toEqual({ owner: 'p1', mortgaged: false, buildings: 0 });
    expect(g.state.bank.houses).toBe(32 - 9);
    expect(P(g, 'p1').cash).toBe(1500 + 4 * 25);
  });
});
