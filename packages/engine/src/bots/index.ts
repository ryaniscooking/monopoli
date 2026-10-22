import { getLegalActions, getPendingActors } from '../legal';
import type { Rng } from '../rng';
import type { Action, BotLevel, GameState, PlayerId, PublicView, ResolvedMap } from '../types';
import { decideEasy } from './easy';
import { decideSmart } from './smart';

/** A bot's next action (spec 9). Only call it for players returned by botsToAct(). */
export function decide(view: PublicView, me: PlayerId, level: BotLevel, rng: Rng): Action {
  return level === 'easy' ? decideEasy(view, me, rng) : decideSmart(view, me, level, rng);
}

/**
 * Bot-controlled players with a decision to make: whoever the game waits on, plus bots with an
 * incoming trade offer they can answer now.
 */
export function botsToAct(map: ResolvedMap, state: GameState): PlayerId[] {
  const ids = new Set(getPendingActors(state));
  for (const t of state.trades) {
    if (getLegalActions(map, state, t.to).some((a) => a.type === 'accept_trade' && a.id === t.id)) {
      ids.add(t.to);
    }
  }
  return state.players
    .filter((p) => ids.has(p.id) && p.controlledBy === 'bot' && !p.bankrupt)
    .map((p) => p.id);
}
