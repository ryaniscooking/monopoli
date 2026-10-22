// Trading (R-090 .. R-094).
import type {
  DebtEntry,
  GameState,
  PlayerId,
  ResolvedMap,
  TradeBundle,
  TradeOffer,
} from '../types';
import { getPlayer, type Ctx } from './ctx';
import { mortgageInterest, settle, transfer } from './money';

export const TRADE_TTL_MS = 60_000; // R-093
export const MAX_PROPOSALS_PER_TURN = 3;

/** R-090: no trading while an auction or a debt is open; without offTurnManagement only on the proposer's turn. */
export function tradingOpen(s: GameState, proposer: PlayerId): boolean {
  if (s.phase === 'game_over') return false;
  // Auctions and debts block trading (R-090); a pending buy decision does too, so a trade's
  // mortgage interest can never open a debt on top of another decision.
  if (s.pending !== null) return false;
  if (!s.settings.offTurnManagement && s.current !== proposer) return false;
  return true;
}

function bundleProblem(
  map: ResolvedMap,
  s: GameState,
  owner: PlayerId,
  b: TradeBundle,
): string | null {
  const p = s.players.find((x) => x.id === owner);
  if (!p || p.bankrupt) return `${owner} is not in the game`;
  if (!Number.isInteger(b.cash) || b.cash < 0) return 'cash must be a whole, non-negative amount';
  if (b.cash > p.cash) return `${owner} does not have that much cash`;
  if (!Number.isInteger(b.jailCards) || b.jailCards < 0 || b.jailCards > p.jailCards) {
    return `${owner} does not hold that many Get Out of Jail Free cards`;
  }
  if (new Set(b.tiles).size !== b.tiles.length) return 'a tile is listed twice';
  for (const id of b.tiles) {
    const t = map.byId[id];
    const prop = s.properties[id];
    if (!t || !prop) return `unknown tile ${id}`;
    if (prop.owner !== owner) return `${owner} does not own ${id}`;
    // R-046 / R-090: only unimproved tiles whose color group has no buildings.
    if (
      t.type === 'property' &&
      map.groups[t.group].some((g) => (s.properties[g]?.buildings ?? 0) > 0)
    ) {
      return `${id} is in a color group with buildings`;
    }
  }
  return null;
}

const isEmpty = (b: TradeBundle) => b.cash === 0 && b.jailCards === 0 && b.tiles.length === 0;

/** R-092: why this offer cannot happen right now, or null when it can. */
export function tradeProblem(
  map: ResolvedMap,
  s: GameState,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  get: TradeBundle,
): string | null {
  if (from === to) return 'cannot trade with yourself';
  if (isEmpty(give) && isEmpty(get)) return 'the offer is empty';
  return bundleProblem(map, s, from, give) ?? bundleProblem(map, s, to, get);
}

export function proposeTrade(
  c: Ctx,
  from: PlayerId,
  to: PlayerId,
  give: TradeBundle,
  get: TradeBundle,
): void {
  const offer: TradeOffer = {
    id: `t${c.s.tradeSeq}`,
    from,
    to,
    give: { cash: give.cash, tiles: [...give.tiles], jailCards: give.jailCards },
    get: { cash: get.cash, tiles: [...get.tiles], jailCards: get.jailCards },
    expiresAt: c.now + TRADE_TTL_MS,
  };
  c.s.tradeSeq += 1;
  c.s.proposalsThisTurn[from] = (c.s.proposalsThisTurn[from] ?? 0) + 1;
  c.s.trades.push(offer);
  c.ev.push({ type: 'trade_proposed', offer });
}

export function removeTrade(
  c: Ctx,
  id: string,
  reason: 'cancelled' | 'expired' | 'invalid' | 'bankrupt',
) {
  c.s.trades = c.s.trades.filter((t) => t.id !== id);
  c.ev.push({ type: 'trade_cancelled', id, reason });
}

export function declineTrade(c: Ctx, id: string): void {
  c.s.trades = c.s.trades.filter((t) => t.id !== id);
  c.ev.push({ type: 'trade_declined', id });
}

/** R-091 / R-092 / R-094: re-validate, then swap exactly the listed assets. */
export function acceptTrade(c: Ctx, id: string): void {
  const offer = c.s.trades.find((t) => t.id === id);
  if (!offer) throw new Error(`No trade ${id}`);
  if (
    c.now >= offer.expiresAt ||
    tradeProblem(c.map, c.s, offer.from, offer.to, offer.give, offer.get)
  ) {
    removeTrade(c, id, c.now >= offer.expiresAt ? 'expired' : 'invalid');
    return;
  }
  c.s.trades = c.s.trades.filter((t) => t.id !== id);
  const interest: DebtEntry[] = [];
  const move = (owner: PlayerId, receiver: PlayerId, b: TradeBundle) => {
    if (b.cash > 0) transfer(c, owner, receiver, b.cash, `trade:${id}`);
    for (const tile of b.tiles) {
      const prop = c.s.properties[tile];
      if (!prop) continue;
      prop.owner = receiver;
      const t = c.map.byId[tile];
      if (prop.mortgaged && t && 'mortgage' in t) {
        interest.push({
          debtor: receiver,
          creditor: 'bank',
          amount: mortgageInterest(t.mortgage),
          reason: `mortgage_interest:${tile}`,
        });
      }
    }
    if (b.jailCards > 0) {
      const giver = getPlayer(c.s, owner);
      const taker = getPlayer(c.s, receiver);
      const cards = giver.jailCardIds.splice(giver.jailCardIds.length - b.jailCards, b.jailCards);
      taker.jailCardIds.push(...cards);
      giver.jailCards = giver.jailCardIds.length;
      taker.jailCards = taker.jailCardIds.length;
    }
  };
  move(offer.from, offer.to, offer.give);
  move(offer.to, offer.from, offer.get);
  c.ev.push({ type: 'trade_accepted', offer });
  // R-064 / R-094: receiving a mortgaged tile costs 10% interest now.
  if (interest.length > 0) settle(c, interest);
}

/** Offers involving a player who left the game are void. */
export function cancelTradesOf(c: Ctx, player: PlayerId): void {
  for (const t of [...c.s.trades]) {
    if (t.from === player || t.to === player) removeTrade(c, t.id, 'bankrupt');
  }
}
