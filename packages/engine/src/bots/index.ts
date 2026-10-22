import type { Rng } from '../rng';
import type { Action, BotLevel, PlayerId, PublicView } from '../types';
import { decideEasy } from './easy';

/**
 * A bot's next action. Only call it for the player getActingPlayer() returns.
 * Normal and Hard arrive in Phase 3; until then they play like Easy.
 */
export function decide(view: PublicView, me: PlayerId, level: BotLevel, rng: Rng): Action {
  switch (level) {
    case 'easy':
    case 'normal':
    case 'hard':
      return decideEasy(view, me, rng);
  }
}
