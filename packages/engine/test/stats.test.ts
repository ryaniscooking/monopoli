import { describe, expect, it } from 'vitest';
import { tallyStats } from '../src/index';
import { act, own, rollFrom, setup } from './helpers';

describe('Game-over stats (spec 12.1.5)', () => {
  it('counts rent, turns and jail visits from the events', () => {
    const g = setup();
    expect(g.state.stats?.p0?.turns).toBe(1);
    own(g, 'p1', 'p01', 'p02');
    rollFrom(g, 'p0', 0, 1, 2); // p02 with the set: 8 rent
    act(g, 'p0', { type: 'end_turn' });
    expect(g.state.stats?.p0).toMatchObject({ rentPaid: 8, turns: 1 });
    expect(g.state.stats?.p1).toMatchObject({ rentCollected: 8, turns: 1 });
    rollFrom(g, 'p1', 20, 4, 6); // Go To Jail (30)
    expect(g.state.stats?.p1?.timesJailed).toBe(1);
  });

  it('never mutates the previous totals', () => {
    const before = {
      p0: {
        rentCollected: 1,
        rentPaid: 0,
        turns: 0,
        timesJailed: 0,
        buildingsBuilt: 0,
        passedGo: 0,
      },
    };
    const after = tallyStats(before, [{ type: 'passed_go', player: 'p0', amount: 200 }]);
    expect(after.p0?.passedGo).toBe(1);
    expect(before.p0.passedGo).toBe(0);
  });
});
