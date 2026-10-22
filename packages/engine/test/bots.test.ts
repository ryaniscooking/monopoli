import { describe, expect, it } from 'vitest';
import { createSeededRng, decide } from '../src/index';
import { act, own, P, setup } from './helpers';

describe('bots (spec 9)', () => {
  it('a declined offer is not repeated for 5 rounds', () => {
    const g = setup();
    // p1 (a Hard bot) owns 2 of 3 orange tiles; p0 owns the third and has said no before.
    P(g, 'p1').kind = 'bot';
    P(g, 'p1').controlledBy = 'bot';
    own(g, 'p1', 'p09', 'p10');
    own(g, 'p0', 'p11');
    g.state.current = 'p1';
    const rng = createSeededRng(1);
    const first = decide({ map: g.map, state: g.state }, 'p1', 'hard', rng);
    expect(first).toMatchObject({ type: 'propose_trade', to: 'p0', get: { tiles: ['p11'] } });
    act(g, 'p1', first);
    act(g, 'p0', { type: 'decline_trade', id: g.state.trades[0]!.id });
    expect(g.state.declinedOffers).toEqual([{ from: 'p1', to: 'p0', tile: 'p11', round: 1 }]);

    // Next turns within 5 rounds: no repeat offer for p11.
    g.state.proposalsThisTurn = {};
    g.state.round = 4;
    const again = decide({ map: g.map, state: g.state }, 'p1', 'hard', rng);
    expect(again.type).not.toBe('propose_trade');

    // After 5 rounds the bot may ask again.
    g.state.round = 6;
    const later = decide({ map: g.map, state: g.state }, 'p1', 'hard', rng);
    expect(later).toMatchObject({ type: 'propose_trade', get: { tiles: ['p11'] } });
  });
});
