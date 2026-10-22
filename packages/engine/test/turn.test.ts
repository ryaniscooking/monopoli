import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/index';
import { act, idx, P, rollFrom, setup, transfers, tryAct } from './helpers';

describe('7.2 Turn flow', () => {
  it('R-010 rolling two dice moves clockwise by the total', () => {
    const g = setup();
    const ev = rollFrom(g, 'p0', idx(g, 'p01'), 2, 3); // 1 -> 6
    expect(P(g, 'p0').position).toBe(6);
    expect(ev.find((e) => e.type === 'moved')).toMatchObject({ path: [2, 3, 4, 5, 6] });
  });

  it('R-011 doubles grant another roll once the landing is resolved', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 3, 3); // lands on p03, unowned
    expect(g.state.pending?.kind).toBe('buy');
    expect(tryAct(g, 'p0', { type: 'roll' }).ok).toBe(false);
    act(g, 'p0', { type: 'decline_buy' }); // starts an auction (R-050)
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p1', { type: 'auction_withdraw' });
    expect(g.state.phase).toBe('pre_roll');
    expect(g.state.current).toBe('p0');
    act(g, 'p0', { type: 'roll' }, 1, 2);
    expect(g.state.phase).toBe('post_roll');
  });

  it('R-012 three doubles in a row go straight to Jail without moving', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 2, 2); // -> 4 income tax
    act(g, 'p0', { type: 'roll' }, 3, 3); // -> 10 just visiting
    const ev = act(g, 'p0', { type: 'roll' }, 4, 4);
    expect(P(g, 'p0')).toMatchObject({ position: 10, inJail: true });
    expect(ev.some((e) => e.type === 'moved' && e.mode === 'walk')).toBe(false);
    expect(g.state.current).toBe('p1');
  });

  it('R-013 passing GO pays the salary', () => {
    const g = setup();
    rollFrom(g, 'p0', 38, 1, 2); // 38 -> 1
    expect(P(g, 'p0').cash).toBe(1700);
  });

  it('R-013 landing exactly on GO pays the salary (double with doubleGoBonus)', () => {
    const g = setup();
    rollFrom(g, 'p0', 37, 1, 2);
    expect(P(g, 'p0').cash).toBe(1700);
    const h = setup({ house: { doubleGoBonus: true } });
    rollFrom(h, 'p0', 37, 1, 2);
    expect(P(h, 'p0').cash).toBe(1900);
  });

  it('R-013 GO salary scales with the map (Myanmar)', async () => {
    const { myanmar } = await import('./helpers');
    const g = setup({ map: myanmar });
    rollFrom(g, 'p0', 38, 1, 2);
    expect(P(g, 'p0').cash).toBe(1_700_000);
  });

  it('R-013 being sent to Jail pays no salary', () => {
    const g = setup();
    const ev = rollFrom(g, 'p0', 27, 1, 2); // -> 30 Go To Jail
    expect(P(g, 'p0')).toMatchObject({ position: 10, inJail: true, cash: 1500 });
    expect(transfers(ev)).toEqual([]);
  });

  it('R-014 the turn ends only when ended, after all decisions are resolved', () => {
    const g = setup();
    rollFrom(g, 'p0', 0, 1, 2); // -> 3 p02
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).not.toContain('end_turn');
    act(g, 'p0', { type: 'decline_buy' });
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p1', { type: 'auction_withdraw' });
    expect(g.state.current).toBe('p0');
    act(g, 'p0', { type: 'end_turn' });
    expect(g.state.current).toBe('p1');
    expect(g.state.phase).toBe('pre_roll');
  });

  it('R-014 being sent to Jail ends the turn immediately', () => {
    const g = setup();
    rollFrom(g, 'p0', 26, 2, 2); // doubles onto Go To Jail: no extra roll
    expect(g.state.current).toBe('p1');
  });

  it('R-014 rounds count up when play returns to the first player; bankrupt seats are skipped', () => {
    const g = setup({ players: 3 });
    P(g, 'p1').bankrupt = true;
    P(g, 'p1').cash = 0;
    rollFrom(g, 'p0', 0, 1, 3); // -> 4 income tax, no decision
    act(g, 'p0', { type: 'end_turn' });
    expect(g.state.current).toBe('p2');
    expect(g.state.round).toBe(1);
    rollFrom(g, 'p2', 0, 1, 3);
    act(g, 'p2', { type: 'end_turn' });
    expect(g.state.current).toBe('p0');
    expect(g.state.round).toBe(2);
  });

  it('only the current player may roll', () => {
    const g = setup();
    expect(tryAct(g, 'p1', { type: 'roll' }, 1, 2)).toMatchObject({ ok: false });
  });
});
