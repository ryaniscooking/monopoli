import { canMortgage, canUnmortgage } from './rules/mortgage';
import type { Action, GameState, PlayerId, ResolvedMap } from './types';

/** Who must act next (the debtor, the buyer, or the current player); null when the game is over. */
export function getActingPlayer(state: GameState): PlayerId | null {
  if (state.phase === 'game_over') return null;
  const p = state.pending;
  if (p?.kind === 'debt') return p.debtor;
  if (p?.kind === 'buy') return p.player;
  return state.current;
}

/** Every action `player` may take right now. applyAction accepts exactly these. */
export function getLegalActions(map: ResolvedMap, state: GameState, player: PlayerId): Action[] {
  if (state.phase === 'game_over') return [];
  const p = state.players.find((x) => x.id === player);
  if (!p || p.bankrupt) return [];

  const actions: Action[] = [];
  const pending = state.pending;
  const isCurrent = state.current === player;
  const isDebtor = pending?.kind === 'debt' && pending.debtor === player;

  if (pending?.kind === 'debt') {
    if (isDebtor) {
      if (p.cash >= pending.amount) actions.push({ type: 'pay_debt' });
      actions.push({ type: 'declare_bankruptcy' });
    }
  } else if (pending?.kind === 'buy') {
    if (pending.player === player) {
      if (p.cash >= pending.price) actions.push({ type: 'buy' });
      actions.push({ type: 'decline_buy' });
    }
  } else if (isCurrent) {
    if (state.phase === 'pre_roll') {
      actions.push({ type: 'roll' });
      if (p.inJail && !state.rolledThisTurn) {
        if (p.cash >= state.settings.jailFine * map.m) actions.push({ type: 'pay_jail_fine' });
        if (p.jailCards > 0) actions.push({ type: 'use_jail_card' });
      }
    } else {
      actions.push({ type: 'end_turn' });
    }
  }

  // Property management: on your turn, while you owe a debt, or any time with offTurnManagement.
  if (isCurrent || isDebtor || state.settings.offTurnManagement) {
    for (const tile of map.buyable) {
      if (canMortgage(map, state, player, tile)) actions.push({ type: 'mortgage', tile });
      else if (!isDebtor && canUnmortgage(map, state, player, tile)) {
        actions.push({ type: 'unmortgage', tile });
      }
    }
  }
  return actions;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if ('tile' in a && 'tile' in b) return a.tile === b.tile;
  return true;
}
