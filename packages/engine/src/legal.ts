import { canBuildOn, canSellOn } from './rules/build';
import { canMortgage, canUnmortgage } from './rules/mortgage';
import { somethingDue } from './rules/timers';
import { MAX_PROPOSALS_PER_TURN, tradeProblem, tradingOpen } from './rules/trade';
import type { Action, GameState, PlayerId, ResolvedMap } from './types';

/** Who must act next (the debtor, the buyer, or the current player); null during auctions and after the game. */
export function getActingPlayer(state: GameState): PlayerId | null {
  if (state.phase === 'game_over') return null;
  const p = state.pending;
  if (p?.kind === 'debt') return p.debtor;
  if (p?.kind === 'buy') return p.player;
  if (p?.kind === 'auction') return null;
  return state.current;
}

/** Everyone whose decision the game is waiting for (auctions: every active bidder but the leader). */
export function getPendingActors(state: GameState): PlayerId[] {
  if (state.phase === 'game_over') return [];
  const p = state.pending;
  if (p?.kind === 'auction') return p.active.filter((id) => id !== p.highBidder);
  const one = getActingPlayer(state);
  return one ? [one] : [];
}

/** The smallest bid accepted right now (R-051): above the high bid by at least one classic unit. */
export function minimumBid(map: ResolvedMap, state: GameState): number {
  const a = state.pending;
  if (a?.kind !== 'auction') return 0;
  return a.highBidder ? a.highBid + map.m : Math.max(a.minBid, map.m);
}

/**
 * Every action `player` may take right now, except proposals (any bundle) and bids above the
 * minimum, which checkAction validates by their parameters.
 */
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
  } else if (pending?.kind === 'auction') {
    if (pending.active.includes(player)) {
      const min = minimumBid(map, state);
      if (p.cash >= min) actions.push({ type: 'auction_bid', amount: min });
      if (pending.highBidder !== player) actions.push({ type: 'auction_withdraw' });
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
    const calm = pending === null || pending.kind === 'buy';
    for (const tile of map.buyable) {
      if (canSellOn(map, state, player, tile)) actions.push({ type: 'sell_building', tile });
      if (canMortgage(map, state, player, tile)) actions.push({ type: 'mortgage', tile });
      if (calm && canUnmortgage(map, state, player, tile))
        actions.push({ type: 'unmortgage', tile });
      // Building spends cash, so not during auctions or debts.
      if (calm && canBuildOn(map, state, player, tile)) actions.push({ type: 'build', tile });
    }
  }

  for (const t of state.trades) {
    if (t.to === player) {
      if (state.pending === null && tradingOpen(state, t.from)) {
        actions.push({ type: 'accept_trade', id: t.id });
      }
      actions.push({ type: 'decline_trade', id: t.id });
    }
    if (t.from === player) actions.push({ type: 'cancel_trade', id: t.id });
  }
  return actions;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if ('tile' in a && 'tile' in b) return a.tile === b.tile;
  if ('id' in a && 'id' in b) return a.id === b.id;
  return true;
}

/** Why `actor` may not take `action` now, or null when it is legal. */
export function checkAction(
  map: ResolvedMap,
  state: GameState,
  actor: PlayerId | 'system',
  action: Action,
  now: number,
): string | null {
  if (actor === 'system') {
    if (action.type !== 'system_timeout') return 'the system can only send timeouts';
    return somethingDue(state, now) ? null : 'nothing is due';
  }
  if (action.type === 'system_timeout') return 'only the server sends timeouts';
  if (state.phase === 'game_over') return 'the game is over';
  const p = state.players.find((x) => x.id === actor);
  if (!p || p.bankrupt) return `${actor} is not in the game`;

  switch (action.type) {
    case 'auction_bid': {
      const a = state.pending;
      if (a?.kind !== 'auction') return 'no auction is running';
      if (!a.active.includes(actor)) return 'you are not bidding in this auction';
      if (!Number.isInteger(action.amount)) return 'bids must be whole amounts';
      if (action.amount < minimumBid(map, state)) return 'bid is too low';
      if (action.amount > p.cash) return 'bid is more than your cash'; // R-051 / R-053
      return null;
    }
    case 'propose_trade': {
      if (!tradingOpen(state, actor)) return 'trading is not possible right now';
      if (state.trades.some((t) => t.from === actor)) return 'you already have an open offer'; // R-093
      if ((state.proposalsThisTurn[actor] ?? 0) >= MAX_PROPOSALS_PER_TURN) {
        return 'too many offers this turn';
      }
      const to = state.players.find((x) => x.id === action.to);
      if (!to || to.bankrupt) return 'that player is not in the game';
      return tradeProblem(map, state, actor, action.to, action.give, action.get);
    }
    default: {
      const legal = getLegalActions(map, state, actor);
      return legal.some((a) => sameAction(a, action))
        ? null
        : `${action.type} is not allowed for ${actor} now`;
    }
  }
}
