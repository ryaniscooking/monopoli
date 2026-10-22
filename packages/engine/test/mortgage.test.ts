import { describe, expect, it } from 'vitest';
import { canMortgage, getLegalActions, unmortgageCost } from '../src/index';
import { act, build, myanmar, own, P, setup, tryAct } from './helpers';

describe('7.7 Mortgages', () => {
  it('R-060 only unimproved properties in a group without buildings can be mortgaged', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'p02');
    expect(canMortgage(g.map, g.state, 'p0', 'p01')).toBe(true);
    build(g, 'p02', 1);
    expect(canMortgage(g.map, g.state, 'p0', 'p01')).toBe(false);
    expect(canMortgage(g.map, g.state, 'p0', 'p02')).toBe(false);
    expect(canMortgage(g.map, g.state, 'p1', 'p01')).toBe(false);
  });

  it('R-061 mortgaging pays the mortgage value', () => {
    const g = setup();
    own(g, 'p0', 'p01', 'u1');
    act(g, 'p0', { type: 'mortgage', tile: 'p01' });
    act(g, 'p0', { type: 'mortgage', tile: 'u1' });
    expect(P(g, 'p0').cash).toBe(1500 + 30 + 75);
    expect(tryAct(g, 'p0', { type: 'mortgage', tile: 'p01' }).ok).toBe(false);
  });

  it('R-062 unmortgaging costs the mortgage value + 10%, rounded half up', () => {
    const g = setup();
    expect(unmortgageCost(g.map, 'p01')).toBe(33);
    expect(unmortgageCost(g.map, 'u1')).toBe(83); // 75 + 7.5 -> 8
    expect(unmortgageCost(myanmar, 'u1')).toBe(82_500);
    own(g, 'p0', 'u1');
    act(g, 'p0', { type: 'mortgage', tile: 'u1' });
    act(g, 'p0', { type: 'unmortgage', tile: 'u1' });
    expect(P(g, 'p0').cash).toBe(1500 + 75 - 83);
    expect(g.state.properties.u1?.mortgaged).toBe(false);
  });

  it('R-062 unmortgaging needs enough cash', () => {
    const g = setup();
    own(g, 'p0', 'p01');
    g.state.properties.p01!.mortgaged = true;
    P(g, 'p0').cash = 32;
    expect(getLegalActions(g.map, g.state, 'p0').some((a) => a.type === 'unmortgage')).toBe(false);
  });

  it('management is allowed off-turn only with offTurnManagement', () => {
    const on = setup();
    own(on, 'p1', 'p01');
    expect(tryAct(on, 'p1', { type: 'mortgage', tile: 'p01' }).ok).toBe(true);
    const off = setup({ house: { offTurnManagement: false } });
    own(off, 'p1', 'p01');
    expect(tryAct(off, 'p1', { type: 'mortgage', tile: 'p01' }).ok).toBe(false);
  });
});
