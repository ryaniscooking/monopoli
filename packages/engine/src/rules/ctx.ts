import type { Rng } from '../rng';
import type {
  GameEvent,
  GameSecrets,
  GameState,
  PlayerId,
  PlayerState,
  ResolvedMap,
} from '../types';

/** Mutable working copy used while one action is applied. */
export interface Ctx {
  map: ResolvedMap;
  rng: Rng;
  now: number;
  s: GameState;
  sec: GameSecrets;
  ev: GameEvent[];
  /** Set when a player is sent to Jail during this action (their turn then ends, R-014). */
  jailed: PlayerId | null;
}

export function getPlayer(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function alivePlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.bankrupt);
}

/** Classic units -> map units. */
export function money(c: Pick<Ctx, 'map'>, classic: number): number {
  return classic * c.map.m;
}
