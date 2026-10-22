import { describe, expect, it } from 'vitest';
import { getLegalActions, netWorth } from '../src/index';
import { act, actAt, own, P, rollFrom, setup, tryAct } from './helpers';

describe('7.11 End of game', () => {
  it('R-100 last player standing wins', () => {
    const g = setup();
    P(g, 'p0').cash = 10;
    rollFrom(g, 'p0', 0, 1, 3);
    act(g, 'p0', { type: 'declare_bankruptcy' });
    expect(g.state).toMatchObject({ phase: 'game_over', winner: 'p1', endReason: 'last_standing' });
  });

  it('R-101 at the time limit the round is finished, then the highest net worth wins', () => {
    const g = setup({ players: 3, house: { timeLimitMin: 30 } });
    expect(g.state.endsAt).toBe(30 * 60_000);
    own(g, 'p2', 'p22');
    const late = 31 * 60_000;
    rollFrom(g, 'p0', 0, 1, 3);
    actAt(g, late, 'p0', { type: 'end_turn' });
    expect(g.state.lastRoundPending).toBe(true);
    expect(g.state.current).toBe('p1');
    rollFrom(g, 'p1', 0, 1, 3); // p1 pays 200 tax
    actAt(g, late, 'p1', { type: 'end_turn' });
    expect(g.state.phase).toBe('pre_roll'); // p2 still gets a turn
    rollFrom(g, 'p2', 0, 1, 3);
    actAt(g, late, 'p2', { type: 'end_turn' });
    expect(g.state).toMatchObject({ phase: 'game_over', endReason: 'time_limit' });
    // p2: 1300 + 400 property = 1700 beats p0 (1300) and p1 (1300).
    expect(netWorth(g.map, g.state, 'p2')).toBe(1700);
    expect(g.state.winner).toBe('p2');
    expect(g.events.at(-1)).toEqual({ type: 'game_over', winner: 'p2', reason: 'time_limit' });
  });

  it('R-101 ties go to cash, then to more properties', () => {
    const g = setup({ house: { timeLimitMin: 30 } });
    own(g, 'p0', 'p01'); // net worth 1560, cash 1500
    P(g, 'p1').cash = 1560; // net worth 1560, more cash
    g.state.lastRoundPending = true;
    rollFrom(g, 'p0', 0, 2, 4);
    act(g, 'p0', { type: 'decline_buy' });
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p1', { type: 'auction_withdraw' });
    act(g, 'p0', { type: 'end_turn' });
    rollFrom(g, 'p1', 0, 1, 3);
    P(g, 'p1').cash = 1560;
    act(g, 'p1', { type: 'end_turn' });
    expect(g.state.winner).toBe('p1');
  });

  it('R-101 the time limit can also be reached by a clock tick between turns', () => {
    const g = setup({ house: { timeLimitMin: 30 } });
    actAt(g, 30 * 60_000, 'system', { type: 'system_timeout' });
    expect(g.state.lastRoundPending).toBe(true);
    expect(g.events).toEqual([{ type: 'last_round', endsAt: 30 * 60_000 }]);
  });
});

describe('7.13 Timers', () => {
  it('R-110 a timed-out human gets the default action; three in a row hand the seat to a bot', () => {
    const g = setup({ house: { turnTimerSec: 30 } });
    rollFrom(g, 'p0', 0, 1, 3); // tax, post_roll
    expect(g.state.turnDeadline).toBe(30_000);
    expect(tryAct(g, 'system', { type: 'system_timeout' }).ok).toBe(false);
    actAt(g, 30_000, 'system', { type: 'system_timeout' }); // end turn for p0
    expect(g.state.current).toBe('p1');
    expect(P(g, 'p0').timeouts).toBe(1);
    expect(g.events).toContainEqual({ type: 'timed_out', player: 'p0', action: 'end_turn' });

    P(g, 'p0').timeouts = 2;
    g.state.current = 'p0';
    g.state.phase = 'pre_roll';
    actAt(g, 90_000, 'system', { type: 'system_timeout' }, 1, 3); // auto roll
    expect(P(g, 'p0')).toMatchObject({ timeouts: 3, controlledBy: 'bot' });
  });

  it('R-110 a timed-out buy decision is declined; a real action resets the streak', () => {
    const g = setup({ house: { turnTimerSec: 30, auctionOnDecline: false } });
    rollFrom(g, 'p0', 0, 1, 2);
    expect(g.state.pending?.kind).toBe('buy');
    actAt(g, 30_000, 'system', { type: 'system_timeout' });
    expect(g.state.pending).toBeNull();
    expect(P(g, 'p0').timeouts).toBe(1);
    act(g, 'p0', { type: 'end_turn' });
    expect(P(g, 'p0').timeouts).toBe(0);
  });

  it('clients cannot send system timeouts', () => {
    const g = setup();
    expect(tryAct(g, 'p0', { type: 'system_timeout' }).ok).toBe(false);
    expect(getLegalActions(g.map, g.state, 'p0').map((a) => a.type)).not.toContain(
      'system_timeout',
    );
  });
});

describe('7.12 House rules', () => {
  it('Official preset locks every toggle to its default', async () => {
    const { makeSettings, OFFICIAL_SETTINGS } = await import('../src/index');
    expect(makeSettings('official')).toEqual(OFFICIAL_SETTINGS);
    expect(makeSettings('house', { freeParkingPot: true }).freeParkingPot).toBe(true);
    expect(makeSettings('house', { freeParkingPot: true }).preset).toBe('house');
  });

  it('goSalary and jailFine toggles change the amounts', () => {
    const g = setup({ house: { goSalary: 400, jailFine: 100 } });
    rollFrom(g, 'p0', 38, 1, 2);
    expect(P(g, 'p0').cash).toBe(1900);
    act(g, 'p0', { type: 'decline_buy' });
    act(g, 'p0', { type: 'auction_withdraw' });
    act(g, 'p1', { type: 'auction_withdraw' });
    act(g, 'p0', { type: 'end_turn' });
    Object.assign(P(g, 'p1'), { inJail: true, position: 10 });
    act(g, 'p1', { type: 'pay_jail_fine' });
    expect(P(g, 'p1').cash).toBe(1400);
  });
});

describe('online seat control (spec 10.7)', () => {
  it('a bot can take over a human seat and hand it back; bots and bankrupt seats are untouched', async () => {
    const { setControlledBy } = await import('../src/index');
    const g = setup();
    const taken = setControlledBy(g.state, 'p1', 'bot');
    expect(taken.state.players[1]).toMatchObject({ controlledBy: 'bot', connected: false });
    expect(taken.events).toEqual([{ type: 'control_changed', player: 'p1', controlledBy: 'bot' }]);
    expect(g.state.players[1]?.controlledBy).toBe('human'); // input not mutated
    const back = setControlledBy(taken.state, 'p1', 'human');
    expect(back.state.players[1]).toMatchObject({ controlledBy: 'human', connected: true });
    expect(setControlledBy(back.state, 'p1', 'human').events).toEqual([]);
  });
});
