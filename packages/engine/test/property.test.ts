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
  getPendingActors,
  makeSettings,
  MoneyLedger,
  randomInt,
  resolveMap,
  type Action,
  type PlayerId,
  type RuleSettings,
} from '../src/index';

const maps = { dubai: resolveMap(RAW_MAPS.dubai), myanmar: resolveMap(RAW_MAPS.myanmar) };

const houseRules = fc.record({
  doubleGoBonus: fc.boolean(),
  freeParkingPot: fc.boolean(),
  doubleRentOnSet: fc.boolean(),
  noRentInJail: fc.boolean(),
  offTurnManagement: fc.boolean(),
  evenBuild: fc.boolean(),
  unlimitedBuildings: fc.boolean(),
  auctionOnDecline: fc.boolean(),
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
          let now = 0;
          for (let step = 0; step < 400 && state.phase !== 'game_over'; step++) {
            now += randomInt(rng, 4) * 5_000; // sometimes timers expire
            let who: PlayerId | 'system';
            let action: Action;
            const roll = randomInt(rng, 20);
            if (roll === 0) {
              who = 'system';
              action = { type: 'system_timeout' };
            } else if (roll === 1) {
              // A random trade proposal between two random players (often illegal: that's fine).
              const from = state.players[randomInt(rng, state.players.length)]!;
              const to = state.players[randomInt(rng, state.players.length)]!;
              const tilesOf = (id: string) =>
                map.buyable.filter((t) => state.properties[t]?.owner === id);
              const pick = (tiles: string[]) => tiles.filter(() => randomInt(rng, 3) === 0);
              who = from.id;
              action = {
                type: 'propose_trade',
                to: to.id,
                give: { cash: randomInt(rng, 3) * 50, tiles: pick(tilesOf(from.id)), jailCards: 0 },
                get: { cash: 0, tiles: pick(tilesOf(to.id)), jailCards: 0 },
              };
            } else {
              // Mostly a player the game waits on; sometimes anyone (off-turn management).
              const waiting = getPendingActors(state);
              const anyone = state.players[randomInt(rng, state.players.length)]!.id;
              const p =
                randomInt(rng, 5) === 0 || waiting.length === 0
                  ? anyone
                  : waiting[randomInt(rng, waiting.length)]!;
              const legal = getLegalActions(map, state, p);
              if (legal.length === 0) continue;
              who = p;
              action = legal[randomInt(rng, legal.length)]!;
            }
            if (who !== 'system') expect(ActionSchema.safeParse(action).success).toBe(true);
            const res = applyAction({ map, rng, now }, state, secrets, who, action);
            if (!res.ok) {
              if (action.type === 'propose_trade' || who === 'system') continue;
              throw new Error(`legal action rejected: ${res.error.message}`);
            }
            state = res.state;
            secrets = res.secrets;
            ledger.apply(res.events);
            const errors = [...checkInvariants(map, state, secrets), ...ledger.check(state)];
            if (errors.length) throw new Error(`step ${step}: ${errors.join('; ')}`);
          }
        },
      ),
      { numRuns: 200 },
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
