import { getLegalActions, sameAction } from './legal';
import type { Rng } from './rng';
import { getPlayer, type Ctx } from './rules/ctx';
import { payJailFine, useJailCard } from './rules/jail';
import { declareBankruptcy, payDebt, transfer } from './rules/money';
import { mortgage, unmortgage } from './rules/mortgage';
import { advanceTurn, doRoll } from './rules/turn';
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
 * The one pure state transition. Validates `action` against getLegalActions, then applies it to a
 * copy of the state. Time and randomness come only from `ctx`.
 */
export function applyAction(
  ctx: ApplyContext,
  state: GameState,
  secrets: GameSecrets,
  actor: PlayerId | 'system',
  action: Action,
): ApplyResult {
  if (actor === 'system') {
    return { ok: false, error: { code: 'NOT_SUPPORTED', message: 'No system actions yet' } };
  }
  const legal = getLegalActions(ctx.map, state, actor);
  if (!legal.some((a) => sameAction(a, action))) {
    return {
      ok: false,
      error: { code: 'ILLEGAL_ACTION', message: `${action.type} is not allowed for ${actor} now` },
    };
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

  switch (action.type) {
    case 'roll':
      doRoll(c, actor);
      break;
    case 'buy': {
      const p = c.s.pending;
      if (p?.kind !== 'buy') throw new Error('No pending buy');
      c.s.pending = null;
      transfer(c, actor, 'bank', p.price, `buy:${p.tile}`);
      const prop = c.s.properties[p.tile];
      if (prop) prop.owner = actor;
      c.ev.push({ type: 'bought', player: actor, tile: p.tile, price: p.price });
      break;
    }
    case 'decline_buy': {
      const p = c.s.pending;
      if (p?.kind !== 'buy') throw new Error('No pending buy');
      c.s.pending = null;
      // Auctions (R-050) arrive in Phase 3; until then the tile stays with the bank.
      c.ev.push({ type: 'buy_declined', player: actor, tile: p.tile });
      break;
    }
    case 'mortgage':
      mortgage(c, actor, action.tile);
      break;
    case 'unmortgage':
      unmortgage(c, actor, action.tile);
      break;
    case 'pay_jail_fine':
      payJailFine(c, actor);
      break;
    case 'use_jail_card':
      useJailCard(c, actor);
      break;
    case 'end_turn':
      advanceTurn(c);
      break;
    case 'pay_debt':
      payDebt(c);
      break;
    case 'declare_bankruptcy':
      declareBankruptcy(c);
      break;
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

  return { ok: true, state: c.s, secrets: c.sec, events: c.ev };
}

function clonePending(p: Pending | null): Pending | null {
  if (!p) return null;
  if (p.kind === 'buy') return { ...p };
  return { ...p, queue: p.queue.map((e) => ({ ...e })), then: p.then ? { ...p.then } : null };
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
  };
}
