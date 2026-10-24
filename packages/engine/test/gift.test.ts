import { describe, expect, it } from 'vitest';
import { ActionSchema, canClaimGift, getLegalActions } from '../src/index';
import { act, dubai, myanmar, P, setup, tryAct } from './helpers';

describe('R-900 Ko Ko Naw gift (house fun)', () => {
  it('R-900 the player named Thae Thae Lay gets the map gift from the bank, any time, unlimited', () => {
    const g = setup({ map: myanmar });
    P(g, 'p1').name = '  thae   THAE lay ';
    const before = P(g, 'p1').cash;
    // Not her turn (p0 moves first) and pressed twice: both work.
    act(g, 'p1', { type: 'ko_ko_naw' });
    act(g, 'p1', { type: 'ko_ko_naw' });
    expect(P(g, 'p1').cash - before).toBe(2_000_000);
    expect(g.events.at(-1)).toMatchObject({ type: 'money_transfer', from: 'bank', reason: 'gift' });
  });

  it('R-900 the amount comes from the map: AED 10,000 on Dubai', () => {
    const g = setup({ map: dubai });
    P(g, 'p0').name = 'Thae Thae Lay';
    const before = P(g, 'p0').cash;
    act(g, 'p0', { type: 'ko_ko_naw' });
    expect(P(g, 'p0').cash - before).toBe(10_000);
  });

  it('R-900 nobody else can claim it, and never a bot', () => {
    const g = setup();
    P(g, 'p1').name = 'Thae Thae';
    expect(tryAct(g, 'p1', { type: 'ko_ko_naw' }).ok).toBe(false);
    expect(getLegalActions(g.map, g.state, 'p1')).not.toContainEqual({ type: 'ko_ko_naw' });
    P(g, 'p1').name = 'Thae Thae Lay';
    P(g, 'p1').controlledBy = 'bot'; // a stand-in bot plays her seat
    expect(canClaimGift(g.map, g.state, 'p1')).toBe(false);
    P(g, 'p1').controlledBy = 'human';
    P(g, 'p1').kind = 'bot';
    expect(canClaimGift(g.map, g.state, 'p1')).toBe(false);
  });

  it('R-900 is accepted from clients (strict schema)', () => {
    expect(ActionSchema.safeParse({ type: 'ko_ko_naw' }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: 'ko_ko_naw', amount: 5 }).success).toBe(false);
  });
});
