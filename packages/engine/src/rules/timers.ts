// Clock-driven rules: auction timers (R-052), trade expiry (R-093), the time limit (R-101)
// and the turn timer (R-110). All use the injected `now` (server time online).
import type { GameState, PlayerId } from '../types';
import { finishAuction } from './auction';
import { canSellOn, sellBuilding } from './build';
import { declineBuy } from './buy';
import { getPlayer, type Ctx } from './ctx';
import { declareBankruptcy, payDebt } from './money';
import { canMortgage, mortgage } from './mortgage';
import { removeTrade } from './trade';
import { advanceTurn, doRoll } from './turn';

export function somethingDue(s: GameState, now: number): boolean {
  if (s.phase === 'game_over') return false;
  if (s.pending?.kind === 'auction' && now >= s.pending.deadline) return true;
  if (s.trades.some((t) => now >= t.expiresAt)) return true;
  if (s.endsAt !== null && now >= s.endsAt && !s.lastRoundPending) return true;
  if (s.turnDeadline !== null && now >= s.turnDeadline) return true;
  return false;
}

export function runTimeouts(c: Ctx): void {
  const s = c.s;
  if (s.pending?.kind === 'auction' && c.now >= s.pending.deadline) finishAuction(c);
  for (const t of [...s.trades]) if (c.now >= t.expiresAt) removeTrade(c, t.id, 'expired');
  if (s.endsAt !== null && c.now >= s.endsAt && !s.lastRoundPending) {
    s.lastRoundPending = true;
    c.ev.push({ type: 'last_round', endsAt: s.endsAt });
  }
  if (s.turnDeadline !== null && c.now >= s.turnDeadline && s.pending?.kind !== 'auction') {
    autoAct(c);
  }
}

/** R-110: the acting human ran out of time; do the safe default for them. */
function autoAct(c: Ctx): void {
  const s = c.s;
  const pending = s.pending;
  const actor: PlayerId =
    pending?.kind === 'debt'
      ? pending.debtor
      : pending?.kind === 'buy'
        ? pending.player
        : s.current;
  const p = getPlayer(c.s, actor);
  if (p.controlledBy !== 'human') return;

  let action: 'decline_buy' | 'pay_debt' | 'declare_bankruptcy' | 'roll' | 'end_turn';
  if (pending?.kind === 'buy') {
    action = 'decline_buy';
    declineBuy(c, actor);
  } else if (pending?.kind === 'debt') {
    liquidate(c, actor, pending.amount);
    action = p.cash >= pending.amount ? 'pay_debt' : 'declare_bankruptcy';
    if (action === 'pay_debt') payDebt(c);
    else declareBankruptcy(c);
  } else if (s.phase === 'pre_roll') {
    action = 'roll';
    doRoll(c, actor);
  } else {
    action = 'end_turn';
    advanceTurn(c);
  }
  c.ev.push({ type: 'timed_out', player: actor, action });
  p.timeouts += 1;
  if (p.timeouts >= 3 && !p.bankrupt) {
    p.controlledBy = 'bot';
    c.ev.push({ type: 'control_changed', player: actor, controlledBy: 'bot' });
  }
}

/** Raise cash like a cautious bot: sell buildings, then mortgage the cheapest tiles. */
function liquidate(c: Ctx, player: PlayerId, target: number): void {
  const p = getPlayer(c.s, player);
  for (let guard = 0; guard < 200 && p.cash < target; guard++) {
    const sell = c.map.buyable.find((id) => canSellOn(c.map, c.s, player, id));
    if (sell) {
      sellBuilding(c, player, sell);
      continue;
    }
    const cheapest = c.map.buyable
      .filter((id) => canMortgage(c.map, c.s, player, id))
      .sort((a, b) => priceOf(c, a) - priceOf(c, b))[0];
    if (!cheapest) return;
    mortgage(c, player, cheapest);
  }
}

function priceOf(c: Ctx, tile: string): number {
  const t = c.map.byId[tile];
  return t && 'price' in t ? t.price : 0;
}
