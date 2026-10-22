import { RAW_MAPS } from '@monopoli/maps';
import { expect } from 'vitest';
import {
  applyAction,
  checkInvariants,
  createGame,
  createSeededRng,
  makeSettings,
  resolveMap,
  type Action,
  type DeckId,
  type GameEvent,
  type GameSecrets,
  type GameState,
  type PlayerId,
  type PlayerState,
  type ResolvedMap,
  type Rng,
  type RuleSettings,
} from '../src/index';

export const dubai = resolveMap(RAW_MAPS.dubai);
export const myanmar = resolveMap(RAW_MAPS.myanmar);

export interface G {
  map: ResolvedMap;
  state: GameState;
  secrets: GameSecrets;
  events: GameEvent[];
}

/**
 * Rng that yields exact dice faces (1-6), in order. When the faces run out it throws, unless a
 * fallback seed is given (used for deck shuffles in createGame).
 */
export function diceRng(faces: number[], fallbackSeed?: number): Rng {
  const queue = [...faces];
  const fallback = fallbackSeed === undefined ? null : createSeededRng(fallbackSeed);
  return {
    nextUint32() {
      const face = queue.shift();
      if (face !== undefined) return face - 1; // randomInt(rng, 6) = x % 6 for small x
      if (fallback) return fallback.nextUint32();
      throw new Error('Test rng ran out of dice faces');
    },
  };
}

export interface SetupOptions {
  map?: ResolvedMap;
  players?: number;
  /** House-rule overrides; omitted = Official preset. */
  house?: Partial<RuleSettings>;
  seed?: number;
}

/** A started game where p0 moves first; all seats are humans. */
export function setup(opts: SetupOptions = {}): G {
  const map = opts.map ?? dubai;
  const n = opts.players ?? 2;
  const settings = opts.house ? makeSettings('house', opts.house) : makeSettings('official');
  const seats = Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    token: map.tokens[i]?.id ?? 't',
    color: map.theme.playerColors[i] ?? '#000000',
    kind: 'human' as const,
  }));
  const { state, secrets } = createGame(map, settings, seats, createSeededRng(opts.seed ?? 1), 0);
  state.current = 'p0';
  state.firstPlayer = 'p0';
  return { map, state, secrets, events: [] };
}

/** Apply an action with scripted dice; fails the test if it is rejected or breaks an invariant. */
export function act(g: G, actor: PlayerId, action: Action, ...faces: number[]): GameEvent[] {
  return actAt(g, 0, actor, action, ...faces);
}

/** Like act(), at a given clock time (auction timers, trade expiry, time limit). */
export function actAt(
  g: G,
  now: number,
  actor: PlayerId | 'system',
  action: Action,
  ...faces: number[]
): GameEvent[] {
  const res = applyAction(
    { map: g.map, rng: diceRng(faces), now },
    g.state,
    g.secrets,
    actor,
    action,
  );
  if (!res.ok) throw new Error(res.error.message);
  g.state = res.state;
  g.secrets = res.secrets;
  g.events = res.events;
  expect(checkInvariants(g.map, g.state, g.secrets)).toEqual([]);
  return res.events;
}

export function tryAct(g: G, actor: PlayerId | 'system', action: Action, ...faces: number[]) {
  return applyAction(
    { map: g.map, rng: diceRng(faces), now: 0 },
    g.state,
    g.secrets,
    actor,
    action,
  );
}

export function P(g: G, id: PlayerId): PlayerState {
  const p = g.state.players.find((x) => x.id === id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

export function idx(g: G, tile: string): number {
  const t = g.map.byId[tile];
  if (!t) throw new Error(`no tile ${tile}`);
  return t.index;
}

export function own(g: G, owner: PlayerId, ...tiles: string[]): void {
  for (const t of tiles) {
    const prop = g.state.properties[t];
    if (!prop) throw new Error(`no property ${t}`);
    prop.owner = owner;
  }
}

/** Set a tile's buildings, moving the difference to/from the bank (keeps invariants true). */
export function build(g: G, tile: string, buildings: 0 | 1 | 2 | 3 | 4 | 5): void {
  const prop = g.state.properties[tile];
  if (!prop) throw new Error(`no property ${tile}`);
  const houses = (n: number) => (n === 5 ? 0 : n);
  const hotels = (n: number) => (n === 5 ? 1 : 0);
  g.state.bank.houses += houses(prop.buildings) - houses(buildings);
  g.state.bank.hotels += hotels(prop.buildings) - hotels(buildings);
  prop.buildings = buildings;
}

/** Move the given cards to the top of a deck, in order. */
export function stack(g: G, deck: DeckId, ...cardIds: string[]): void {
  const key = deck === 'chance' ? 'chanceOrder' : 'chestOrder';
  g.secrets[key] = [...cardIds, ...g.secrets[key].filter((id) => !cardIds.includes(id))];
}

/** Put a player on a tile, then roll the given faces. */
export function rollFrom(
  g: G,
  player: PlayerId,
  from: number,
  d1: number,
  d2: number,
  ...extra: number[]
) {
  P(g, player).position = from;
  return act(g, player, { type: 'roll' }, d1, d2, ...extra);
}

export function transfers(events: GameEvent[]) {
  return events.filter(
    (e): e is Extract<GameEvent, { type: 'money_transfer' }> => e.type === 'money_transfer',
  );
}
