import { cloneState } from './reducer';
import type { GameEvent, GameState, PlayerId } from './types';

/**
 * Online seat control (spec 10.7): a bot takes over a disconnected human's seat, and the human
 * reclaims it on return. Not a game rule, but kept here so every state change is pure and logged.
 */
export function setControlledBy(
  state: GameState,
  player: PlayerId,
  controlledBy: 'human' | 'bot',
): { state: GameState; events: GameEvent[] } {
  const p = state.players.find((x) => x.id === player);
  if (!p || p.bankrupt || p.kind === 'bot' || p.controlledBy === controlledBy) {
    return { state, events: [] };
  }
  const next = cloneState(state);
  const np = next.players.find((x) => x.id === player);
  if (np) {
    np.controlledBy = controlledBy;
    np.timeouts = 0;
    np.connected = controlledBy === 'human';
  }
  return { state: next, events: [{ type: 'control_changed', player, controlledBy }] };
}
