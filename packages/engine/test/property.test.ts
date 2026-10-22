// Property-based tests (spec 15.2): random legal play never breaks an invariant.
import { RAW_MAPS } from '@monopoli/maps';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ActionSchema,
  applyAction,
  checkInvariants,
  createGame,
  createSeededRng,
  decide,
  getActingPlayer,
  getLegalActions,
  makeSettings,
  MoneyLedger,
  randomInt,
  resolveMap,
  type RuleSettings,
} from '../src/index';

const maps = { dubai: resolveMap(RAW_MAPS.dubai), myanmar: resolveMap(RAW_MAPS.myanmar) };

const houseRules = fc.record({
  doubleGoBonus: fc.boolean(),
  freeParkingPot: fc.boolean(),
  doubleRentOnSet: fc.boolean(),
  noRentInJail: fc.boolean(),
  offTurnManagement: fc.boolean(),
  startingCash: fc.constantFrom(300, 1500, 3000),
}) as fc.Arbitrary<Partial<RuleSettings>>;

describe('invariants under random legal play', () => {
  it('random legal actions by any player keep every invariant and the money ledger', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        fc.integer({ min: 2, max: 6 }),
        fc.constantFrom('dubai' as const, 'myanmar' as const),
        houseRules,
        (seed, players, mapId, house) => {
          const map = maps[mapId];
          const rng = createSeededRng(seed);
          const seats = Array.from({ length: players }, (_, i) => ({
            name: `P${i}`,
            token: 't',
            color: '#000000',
            kind: 'human' as const,
          }));
          let { state, secrets } = createGame(map, makeSettings('house', house), seats, rng, 0);
          const ledger = new MoneyLedger(state);
          for (let step = 0; step < 400 && state.phase !== 'game_over'; step++) {
            // Mostly the player who must act; sometimes anyone (off-turn mortgaging).
            const acting = getActingPlayer(state);
            const anyone = state.players[randomInt(rng, state.players.length)]?.id;
            const who = randomInt(rng, 5) === 0 && anyone ? anyone : acting;
            if (!who) break;
            const legal = getLegalActions(map, state, who);
            if (legal.length === 0) continue;
            const action = legal[randomInt(rng, legal.length)]!;
            expect(ActionSchema.safeParse(action).success).toBe(true);
            const res = applyAction({ map, rng, now: 0 }, state, secrets, who, action);
            if (!res.ok) throw new Error(`legal action rejected: ${res.error.message}`);
            state = res.state;
            secrets = res.secrets;
            ledger.apply(res.events);
            const errors = [...checkInvariants(map, state, secrets), ...ledger.check(state)];
            if (errors.length) throw new Error(`step ${step}: ${errors.join('; ')}`);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('applyAction never mutates its input state', () => {
    const map = maps.dubai;
    const rng = createSeededRng(3);
    const seats = [0, 1].map((i) => ({
      name: `P${i}`,
      token: 't',
      color: '#000000',
      kind: 'bot' as const,
    }));
    const { state, secrets } = createGame(map, makeSettings('official'), seats, rng, 0);
    const before = JSON.stringify({ state, secrets });
    const actor = getActingPlayer(state)!;
    applyAction(
      { map, rng, now: 0 },
      state,
      secrets,
      actor,
      decide({ map, state }, actor, 'easy', rng),
    );
    expect(JSON.stringify({ state, secrets })).toBe(before);
  });

  it('rejects actions that are not legal right now', () => {
    const map = maps.dubai;
    const rng = createSeededRng(4);
    const seats = [0, 1].map((i) => ({
      name: `P${i}`,
      token: 't',
      color: '#000000',
      kind: 'human' as const,
    }));
    const { state, secrets } = createGame(map, makeSettings('official'), seats, rng, 0);
    const other = state.current === 'p0' ? 'p1' : 'p0';
    for (const [who, action] of [
      [other, { type: 'roll' }],
      [state.current, { type: 'end_turn' }],
      [state.current, { type: 'buy' }],
      [state.current, { type: 'mortgage', tile: 'p01' }],
      [state.current, { type: 'pay_debt' }],
    ] as const) {
      expect(applyAction({ map, rng, now: 0 }, state, secrets, who, action).ok).toBe(false);
    }
    expect(applyAction({ map, rng, now: 0 }, state, secrets, 'system', { type: 'roll' }).ok).toBe(
      false,
    );
  });

  it('ActionSchema rejects unknown kinds and extra fields', () => {
    expect(ActionSchema.safeParse({ type: 'give_me_money' }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'roll', dice: [6, 6] }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'mortgage', tile: 'p01' }).success).toBe(true);
  });
});
