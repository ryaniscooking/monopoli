// Easy bot (spec 9.3): buys ~70% of the time with no reserve, bids up to ~0.7x price,
// builds on a random tile ~30% of the time, mortgages only in debt, always pays to leave
// Jail, never proposes trades, accepts any trade that gains value, and makes deliberate
// mistakes (15% of buys/builds skipped).
import { getLegalActions, minimumBid } from '../legal';
import { chance, randomInt, type Rng } from '../rng';
import type { Action, PlayerId, PublicView } from '../types';
import { botBid, stableNoise } from './util';
import { assessTrade } from './valuation';

type Of<T extends Action['type']> = Extract<Action, { type: T }>;

export function decideEasy(view: PublicView, me: PlayerId, rng: Rng): Action {
  const { map, state } = view;
  const legal = getLegalActions(map, state, me);
  const find = <T extends Action['type']>(type: T) =>
    legal.find((a): a is Of<T> => a.type === type);
  const all = <T extends Action['type']>(type: T) =>
    legal.filter((a): a is Of<T> => a.type === type);
  const pending = state.pending;
  const self = state.players.find((p) => p.id === me);
  if (!self) throw new Error(`No player ${me}`);
  const priceOf = (tile: string) => {
    const t = map.byId[tile];
    return t && 'price' in t ? t.price : 0;
  };

  if (pending?.kind === 'debt' && pending.debtor === me) {
    const pay = find('pay_debt');
    if (pay) return pay;
    // Cheapest first: sell buildings, then mortgage.
    const sell = all('sell_building').sort((a, b) => priceOf(a.tile) - priceOf(b.tile))[0];
    if (sell) return sell;
    const mortgage = all('mortgage').sort((a, b) => priceOf(a.tile) - priceOf(b.tile))[0];
    if (mortgage) return mortgage;
    return { type: 'declare_bankruptcy' };
  }

  if (pending?.kind === 'buy' && pending.player === me) {
    const buy = find('buy');
    if (buy && chance(rng, 0.7) && !chance(rng, 0.15)) return buy;
    return { type: 'decline_buy' };
  }

  if (pending?.kind === 'auction' && pending.active.includes(me) && pending.highBidder !== me) {
    const item = pending.item;
    // +/-20% noise, fixed for this bot and this auction.
    const noise = 0.8 + 0.4 * stableNoise(me, item.tile, item.type, state.round);
    const max = item.type === 'property' ? 0.7 * priceOf(item.tile) * noise : pending.minBid;
    const bid = botBid(minimumBid(map, state), max, map.m, self.cash);
    return bid === null ? { type: 'auction_withdraw' } : { type: 'auction_bid', amount: bid };
  }

  // Reply to incoming trades: accept anything with a net value gain.
  const incoming = state.trades.find((t) => t.to === me);
  if (incoming) {
    const accept = legal.find((a) => a.type === 'accept_trade' && a.id === incoming.id);
    if (accept && assessTrade(map, state, me, incoming).gain > 0) return accept;
    return { type: 'decline_trade', id: incoming.id };
  }

  if (state.current === me && !pending) {
    const builds = all('build');
    if (builds.length > 0 && chance(rng, 0.3) && !chance(rng, 0.15)) {
      return builds[randomInt(rng, builds.length)] as Action;
    }
    const leave = find('use_jail_card') ?? find('pay_jail_fine');
    if (leave) return leave;
    const next = find('roll') ?? find('end_turn');
    if (next) return next;
  }

  throw new Error(`Easy bot ${me} was asked to act but has no decision to make`);
}
