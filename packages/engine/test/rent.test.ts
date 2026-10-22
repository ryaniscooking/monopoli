import { describe, expect, it } from 'vitest';
import { rentFor } from '../src/index';
import { act, build, idx, myanmar, own, P, rollFrom, setup, stack } from './helpers';

describe('7.4 Rent', () => {
  it('R-030 base rent doubles when the owner has the whole unmortgaged set', () => {
    const g = setup();
    own(g, 'p1', 'p01');
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(2);
    own(g, 'p1', 'p02');
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(4);
    rollFrom(g, 'p0', 0, 1, 2); // p02 base 4 -> 8
    expect(P(g, 'p0').cash).toBe(1492);
  });

  it('R-030 / R-063 a mortgaged tile in the set removes the double-rent bonus', () => {
    const g = setup();
    own(g, 'p1', 'p01', 'p02');
    g.state.properties.p02!.mortgaged = true;
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(2);
    expect(rentFor(g.map, g.state, 'p02', 7)).toBe(0);
  });

  it('R-030 doubleRentOnSet off: no bonus', () => {
    const g = setup({ house: { doubleRentOnSet: false } });
    own(g, 'p1', 'p01', 'p02');
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(2);
  });

  it('R-031 rent with buildings comes from the house/hotel table', () => {
    const g = setup();
    own(g, 'p1', 'p01', 'p02');
    build(g, 'p01', 3);
    build(g, 'p02', 5);
    expect(rentFor(g.map, g.state, 'p01', 7)).toBe(90);
    expect(rentFor(g.map, g.state, 'p02', 7)).toBe(450);
  });

  it('R-032 transports pay 25 / 50 / 100 / 200 for 1-4 owned', () => {
    const g = setup();
    const expected = [25, 50, 100, 200];
    ['t1', 't2', 't3', 't4'].forEach((t, i) => {
      own(g, 'p1', t);
      expect(rentFor(g.map, g.state, 't1', 7)).toBe(expected[i]);
    });
    g.state.properties.t4!.mortgaged = true;
    expect(rentFor(g.map, g.state, 't1', 7)).toBe(100);
  });

  it('R-032 transport rent is scaled (Myanmar)', () => {
    const g = setup({ map: myanmar });
    own(g, 'p1', 't1');
    expect(rentFor(g.map, g.state, 't1', 7)).toBe(25_000);
  });

  it('R-033 utilities pay 4x the dice with one, 10x with both', () => {
    const g = setup();
    own(g, 'p1', 'u1');
    rollFrom(g, 'p0', 9, 1, 2); // -> 12 Electricity, dice 3
    expect(P(g, 'p0').cash).toBe(1488);
    own(g, 'p1', 'u2');
    expect(rentFor(g.map, g.state, 'u1', 7)).toBe(70);
  });

  it('R-034 "nearest transport" card pays double rent', () => {
    const g = setup();
    own(g, 'p1', 't2');
    stack(g, 'chance', 'chance05');
    rollFrom(g, 'p0', 4, 1, 2); // -> 7 Chance -> t2 (15)
    expect(P(g, 'p0').position).toBe(idx(g, 't2'));
    expect(P(g, 'p0').cash).toBe(1450);
  });

  it('R-034 "nearest utility" card pays 10x a fresh roll', () => {
    const g = setup();
    own(g, 'p1', 'u1');
    stack(g, 'chance', 'chance04');
    rollFrom(g, 'p0', 4, 1, 2, 3, 3); // -> 7 Chance -> u1, fresh roll 6
    expect(P(g, 'p0').position).toBe(idx(g, 'u1'));
    expect(P(g, 'p0').cash).toBe(1440);
    expect(g.events.filter((e) => e.type === 'dice_rolled')).toHaveLength(2);
  });

  it('R-035 rent is collected while the owner is in Jail, unless noRentInJail', () => {
    const g = setup();
    own(g, 'p1', 'p03');
    P(g, 'p1').inJail = true;
    P(g, 'p1').position = 10;
    rollFrom(g, 'p0', 0, 2, 4);
    expect(P(g, 'p1').cash).toBe(1506);

    const h = setup({ house: { noRentInJail: true } });
    own(h, 'p1', 'p03');
    P(h, 'p1').inJail = true;
    P(h, 'p1').position = 10;
    rollFrom(h, 'p0', 0, 2, 4);
    expect(P(h, 'p1').cash).toBe(1500);
    act(h, 'p0', { type: 'end_turn' });
  });
});
