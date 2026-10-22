import type { GameEvent, GameState, PlayerId } from './types';

/** Per-player totals for the game-over screen (spec 12.1.5). Display only; no rule reads them. */
export interface PlayerStats {
  rentCollected: number;
  rentPaid: number;
  turns: number;
  timesJailed: number;
  buildingsBuilt: number;
  passedGo: number;
}

export const emptyStats = (): PlayerStats => ({
  rentCollected: 0,
  rentPaid: 0,
  turns: 0,
  timesJailed: 0,
  buildingsBuilt: 0,
  passedGo: 0,
});

/** Folds one action's events into the running totals. Returns a new object (never mutates). */
export function tallyStats(
  stats: GameState['stats'],
  events: readonly GameEvent[],
): NonNullable<GameState['stats']> {
  const out: Partial<Record<PlayerId, PlayerStats>> = {};
  for (const [id, s] of Object.entries(stats ?? {})) if (s) out[id as PlayerId] = { ...s };
  const of = (id: PlayerId): PlayerStats => (out[id] ??= emptyStats());
  for (const e of events) {
    switch (e.type) {
      case 'rent_paid':
        of(e.to).rentCollected += e.amount;
        of(e.from).rentPaid += e.amount;
        break;
      case 'turn_started':
        of(e.player).turns++;
        break;
      case 'jailed':
        of(e.player).timesJailed++;
        break;
      case 'built':
        of(e.player).buildingsBuilt++;
        break;
      case 'passed_go':
        of(e.player).passedGo++;
        break;
      default:
        break;
    }
  }
  return out;
}
