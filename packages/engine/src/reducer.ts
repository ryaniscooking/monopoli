import { checkAction } from './legal';
import type { Rng } from './rng';
import { placeBid, runAuctionQueue, startBuildingAuction, withdraw } from './rules/auction';
import {
  isShortage,
  nextBuilding,
  placeBuilding,
  playersWantingBuilding,
  sellBuilding,
} from './rules/build';
import { buy, declineBuy } from './rules/buy';
import { claimGift } from './rules/gift';
import { getPlayer, type Ctx } from './rules/ctx';
import { payJailFine, useJailCard } from './rules/jail';
import { declareBankruptcy, payDebt } from './rules/money';
import { mortgage, unmortgage } from './rules/mortgage';
import { runTimeouts } from './rules/timers';
import { acceptTrade, declineTrade, proposeTrade, removeTrade } from './rules/trade';
import { advanceTurn, doRoll } from './rules/turn';
import { tallyStats } from './stats';
import type {
  Action,
  ApplyResult,
  GameSecrets,
  GameState,
  Pending,
  PlayerId,
  ResolvedMap,
} from './types';

export interface ApplyContext {
  map: ResolvedMap;
  rng: Rng;
  now: number;
}

/**
 * The one pure state transition. Validates `action` (checkAction), then applies it to a copy of
 * the state. Time and randomness come only from `ctx`.
 */
export function applyAction(
  ctx: ApplyContext,
  state: GameState,
  secrets: GameSecrets,
  actor: PlayerId | 'system',
  action: Action,
): ApplyResult {
  const problem = checkAction(ctx.map, state, actor, action, ctx.now);
  if (problem) {
    const code = actor === 'system' ? 'NOTHING_DUE' : 'ILLEGAL_ACTION';
    return { ok: false, error: { code, message: problem } };
  }

  const c: Ctx = {
    map: ctx.map,
    rng: ctx.rng,
    now: ctx.now,
    s: cloneState(state),
    sec: { chanceOrder: [...secrets.chanceOrder], chestOrder: [...secrets.chestOrder] },
    ev: [],
    jailed: null,
  };

  if (actor === 'system') {
    runTimeouts(c);
  } else {
    getPlayer(c.s, actor).timeouts = 0; // a real action resets the R-110 timeout streak
    apply(c, actor, action);
  }

  // R-014: being sent to Jail ends the turn at once.
  if (
    c.s.phase !== 'game_over' &&
    c.jailed !== null &&
    c.jailed === c.s.current &&
    c.s.pending === null &&
    !getPlayer(c.s, c.jailed).bankrupt
  ) {
    advanceTurn(c);
  }
  runAuctionQueue(c);
  c.s.turnDeadline =
    c.s.settings.turnTimerSec > 0 && c.s.phase !== 'game_over'
      ? c.now + c.s.settings.turnTimerSec * 1000
      : null;

  c.s.stats = tallyStats(c.s.stats, c.ev);

  return { ok: true, state: c.s, secrets: c.sec, events: c.ev };
}

function apply(c: Ctx, actor: PlayerId, action: Action): void {
  switch (action.type) {
    case 'roll':
      return doRoll(c, actor);
    case 'buy':
      return buy(c, actor);
    case 'decline_buy':
      return declineBuy(c, actor);
    case 'mortgage':
      return mortgage(c, actor, action.tile);
    case 'unmortgage':
      return unmortgage(c, actor, action.tile);
    case 'pay_jail_fine':
      return payJailFine(c, actor);
    case 'use_jail_card':
      return useJailCard(c, actor);
    case 'end_turn':
      return advanceTurn(c);
    case 'pay_debt':
      return payDebt(c);
    case 'declare_bankruptcy':
      return declareBankruptcy(c);
    case 'build': {
      const kind = nextBuilding(c.s, action.tile);
      if (isShortage(c.map, c.s, kind)) {
        // R-045: too few left for everyone who wants one; the bank auctions it.
        return startBuildingAuction(
          c,
          actor,
          action.tile,
          playersWantingBuilding(c.map, c.s, kind),
        );
      }
      const t = c.map.byId[action.tile];
      return placeBuilding(c, actor, action.tile, t?.type === 'property' ? t.houseCost : 0);
    }
    case 'sell_building':
      return sellBuilding(c, actor, action.tile);
    case 'auction_bid':
      return placeBid(c, actor, action.amount);
    case 'auction_withdraw':
      return withdraw(c, actor);
    case 'propose_trade':
      return proposeTrade(c, actor, action.to, action.give, action.get);
    case 'accept_trade':
      return acceptTrade(c, action.id);
    case 'decline_trade':
      return declineTrade(c, action.id);
    case 'cancel_trade':
      return removeTrade(c, action.id, 'cancelled');
    case 'ko_ko_naw':
      return claimGift(c, actor);
    case 'system_timeout':
      return runTimeouts(c);
  }
}

function clonePending(p: Pending | null): Pending | null {
  if (!p) return null;
  switch (p.kind) {
    case 'buy':
      return { ...p };
    case 'auction':
      return { ...p, item: { ...p.item }, active: [...p.active] };
    case 'debt':
      return { ...p, queue: p.queue.map((e) => ({ ...e })), then: p.then ? { ...p.then } : null };
  }
}

/** Fast structural copy (the simulator applies millions of actions). */
export function cloneState(s: GameState): GameState {
  const properties: GameState['properties'] = {};
  for (const [id, prop] of Object.entries(s.properties)) properties[id] = { ...prop };
  return {
    ...s,
    settings: { ...s.settings },
    players: s.players.map((p) => ({ ...p, jailCardIds: [...p.jailCardIds] })),
    lastRoll: s.lastRoll ? [s.lastRoll[0], s.lastRoll[1]] : null,
    pending: clonePending(s.pending),
    properties,
    bank: { ...s.bank },
    deckCounts: { ...s.deckCounts },
    trades: s.trades.map((t) => ({
      ...t,
      give: { ...t.give, tiles: [...t.give.tiles] },
      get: { ...t.get, tiles: [...t.get.tiles] },
    })),
    proposalsThisTurn: { ...s.proposalsThisTurn },
    auctionQueue: [...s.auctionQueue],
    ...(s.declinedOffers ? { declinedOffers: s.declinedOffers.map((d) => ({ ...d })) } : {}),
  };
}
