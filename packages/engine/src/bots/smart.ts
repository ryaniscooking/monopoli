// Normal and Hard bots (spec 9.3). Linear-time heuristics only: they also run on the server.
import { getLegalActions, minimumBid } from '../legal';
import type { Rng } from '../rng';
import { canBuildOn } from '../rules/build';
import { hasMonopoly, rentFor } from '../rules/rent';
import { unmortgageCost } from '../rules/mortgage';
import type {
  Action,
  ColorGroup,
  GameState,
  PlayerId,
  PublicView,
  ResolvedMap,
  TileId,
  TradeBundle,
} from '../types';
import { botBid } from './util';
import { acquisitionValue, assessTrade, setOf } from './valuation';

type Level = 'normal' | 'hard';
type Of<T extends Action['type']> = Extract<Action, { type: T }>;

/** Hard builds where opponents land most (spec 9.3). */
const HARD_GROUP_PRIORITY: ColorGroup[] = [
  'orange',
  'red',
  'yellow',
  'pink',
  'lightblue',
  'green',
  'darkblue',
  'brown',
];

const priceOf = (map: ResolvedMap, tile: TileId) => {
  const t = map.byId[tile];
  return t && 'price' in t ? t.price : 0;
};

/** Rents `me` could owe on each opponent-owned tile (utilities at an average roll of 7). */
function opponentRents(map: ResolvedMap, s: GameState, me: PlayerId): number[] {
  return map.buyable
    .filter((id) => {
      const owner = s.properties[id]?.owner;
      return owner && owner !== me;
    })
    .map((id) => rentFor(map, s, id, 7))
    .sort((a, b) => b - a);
}

/** Cash a bot keeps back for rent (spec 9.3 "Cash reserve"). */
export function cashReserve(map: ResolvedMap, s: GameState, me: PlayerId, level: Level): number {
  const rents = opponentRents(map, s, me);
  if (level === 'normal') {
    const top = rents.slice(0, 3);
    const avgTop = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
    return Math.max(200 * map.m, avgTop);
  }
  // Hard: expected rent over the next 2 rounds (~2.4 moves; ~1/40 chance per tile per move).
  const expected = rents.reduce((a, b) => a + b, 0) * (2.4 / 40);
  return Math.max(150 * map.m, 1.2 * expected);
}

function completesOrBlocks(map: ResolvedMap, s: GameState, me: PlayerId, tile: TileId) {
  const others = setOf(map, tile).filter((id) => id !== tile);
  if (others.length === 0) return false;
  const owners = others.map((id) => s.properties[id]?.owner ?? null);
  const completes = owners.every((o) => o === me);
  const blocks = owners[0] !== null && owners[0] !== me && owners.every((o) => o === owners[0]);
  return completes || blocks;
}

/** Tiles I own that are not part of a set I could complete or have completed. */
function isolated(map: ResolvedMap, s: GameState, me: PlayerId, tile: TileId): boolean {
  const set = setOf(map, tile);
  const mine = set.filter((id) => s.properties[id]?.owner === me).length;
  const othersOwned = set.filter((id) => {
    const o = s.properties[id]?.owner;
    return o && o !== me;
  }).length;
  return mine < set.length && (othersOwned > 0 || mine === 1);
}

function opponentBuildings(s: GameState, me: PlayerId): number {
  return Object.values(s.properties)
    .filter((p) => p.owner && p.owner !== me)
    .reduce((n, p) => n + p.buildings, 0);
}

function unowned(s: GameState): number {
  return Object.values(s.properties).filter((p) => p.owner === null).length;
}

export function decideSmart(view: PublicView, me: PlayerId, level: Level, _rng: Rng): Action {
  const { map, state: s } = view;
  const legal = getLegalActions(map, s, me);
  const find = <T extends Action['type']>(type: T) =>
    legal.find((a): a is Of<T> => a.type === type);
  const all = <T extends Action['type']>(type: T) =>
    legal.filter((a): a is Of<T> => a.type === type);
  const self = s.players.find((p) => p.id === me);
  if (!self) throw new Error(`No player ${me}`);
  const reserve = cashReserve(map, s, me, level);
  const pending = s.pending;

  // ---- Debt: raise cash in the least damaging order, else go bankrupt.
  if (pending?.kind === 'debt' && pending.debtor === me) {
    const pay = find('pay_debt');
    if (pay) return pay;
    const step = liquidationStep(map, s, me, level, all('mortgage'), all('sell_building'));
    return step ?? { type: 'declare_bankruptcy' };
  }

  // ---- Buy decision.
  if (pending?.kind === 'buy' && pending.player === me) {
    const buy = find('buy');
    if (buy && shouldBuy(map, s, me, level, pending.tile, pending.price, reserve)) return buy;
    return { type: 'decline_buy' };
  }

  // ---- Auction.
  if (pending?.kind === 'auction' && pending.active.includes(me) && pending.highBidder !== me) {
    const max = maxBid(map, s, me, level, reserve);
    const bid = botBid(minimumBid(map, s), max, map.m, self.cash);
    return bid === null ? { type: 'auction_withdraw' } : { type: 'auction_bid', amount: bid };
  }

  // ---- Incoming trades.
  const incoming = s.trades.find((t) => t.to === me);
  if (incoming) {
    const accept = legal.find((a) => a.type === 'accept_trade' && a.id === incoming.id);
    const a = assessTrade(map, s, me, incoming);
    const threshold = level === 'hard' ? 0.1 : 0.05;
    const cashOk = self.cash - incoming.get.cash >= reserve * 0.5;
    const safe = level === 'normal' || !a.themCompletes || a.meCompletes;
    if (accept && cashOk && safe && a.gain >= threshold * Math.max(a.given, 1)) return accept;
    return { type: 'decline_trade', id: incoming.id };
  }

  if (s.current !== me || pending) {
    throw new Error(`${level} bot ${me} was asked to act but has no decision to make`);
  }

  // ---- My turn.
  if (s.phase === 'pre_roll' && self.inJail && !s.rolledThisTurn) {
    const leave = jailChoice(map, s, me, level, self.cash, reserve);
    if (leave === 'leave') {
      const out = find('use_jail_card') ?? find('pay_jail_fine');
      if (out) return out;
    }
  }

  if (
    s.phase === 'pre_roll' &&
    !(s.proposalsThisTurn[me] ?? 0) &&
    s.trades.every((t) => t.from !== me)
  ) {
    const proposal = tradeProposal(map, s, me, level, self.cash, reserve);
    if (proposal) return proposal;
  }

  const build = pickBuild(map, s, me, level, all('build'), self.cash, reserve);
  if (build) return build;

  const wantsToBuild = map.buyable.some((id) =>
    canBuildOn(map, s, me, id, { ignoreCash: true, ignoreStock: true }),
  );
  if (wantsToBuild) {
    // Mortgage isolated low-value tiles to fund a build on a set.
    const cheapestBuild = map.buyable
      .filter((id) => canBuildOn(map, s, me, id, { ignoreCash: true }))
      .map((id) => {
        const t = map.byId[id];
        return t?.type === 'property' ? t.houseCost : Infinity;
      })
      .sort((a, b) => a - b)[0];
    if (cheapestBuild !== undefined && self.cash < cheapestBuild + reserve) {
      const fund = all('mortgage')
        .filter((a) => isolated(map, s, me, a.tile))
        .sort((a, b) => priceOf(map, a.tile) - priceOf(map, b.tile))[0];
      const t = fund ? map.byId[fund.tile] : undefined;
      const gain = t && 'mortgage' in t ? t.mortgage : 0;
      if (fund && self.cash + gain >= cheapestBuild + reserve) return fund;
    }
  } else {
    // Nothing left to build: buy back mortgages when rich (Hard: most valuable first).
    const options = all('unmortgage').filter(
      (a) => self.cash - unmortgageCost(map, a.tile) >= reserve * (level === 'hard' ? 1.5 : 2),
    );
    options.sort((a, b) =>
      level === 'hard'
        ? acquisitionValue(map, s, me, b.tile) - acquisitionValue(map, s, me, a.tile)
        : priceOf(map, a.tile) - priceOf(map, b.tile),
    );
    if (options[0]) return options[0];
  }

  const next = find('roll') ?? find('end_turn');
  if (next) return next;
  throw new Error(`${level} bot ${me} has no move`);
}

function shouldBuy(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  level: Level,
  tile: TileId,
  price: number,
  reserve: number,
): boolean {
  const cash = s.players.find((p) => p.id === me)?.cash ?? 0;
  const value = acquisitionValue(map, s, me, tile);
  if (level === 'normal') return cash - price >= reserve && value >= 0.9 * price;
  if (completesOrBlocks(map, s, me, tile) && cash - price >= 0.25 * reserve) return true;
  return value >= 0.8 * price && cash - price >= reserve;
}

function maxBid(map: ResolvedMap, s: GameState, me: PlayerId, level: Level, reserve: number) {
  const a = s.pending;
  if (a?.kind !== 'auction') return 0;
  const cash = s.players.find((p) => p.id === me)?.cash ?? 0;
  if (a.item.type === 'building') {
    // A contested house is worth more than its cost to a set owner.
    return Math.min(cash - reserve * 0.5, a.minBid * (level === 'hard' ? 1.6 : 1.3));
  }
  const tile = a.item.tile;
  const value = acquisitionValue(map, s, me, tile);
  if (level === 'normal') return value;
  const key = completesOrBlocks(map, s, me, tile);
  const max = value * (key ? 1.15 : 1);
  return key ? max : Math.min(max, Math.max(value * 0.9, cash - reserve * 0.5));
}

function jailChoice(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  level: Level,
  cash: number,
  reserve: number,
): 'leave' | 'stay' {
  const rents = opponentRents(map, s, me);
  if (level === 'normal') {
    const late = s.round > 15 && opponentBuildings(s, me) >= 6;
    return late ? 'stay' : 'leave';
  }
  if (s.round <= 10 || unowned(s) >= 8) return 'leave';
  const exposure = rents.reduce((a, b) => a + b, 0) / 40;
  return exposure * 3 > Math.max(cash - reserve, 0) * 0.25 ? 'stay' : 'leave';
}

function pickBuild(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  level: Level,
  builds: Of<'build'>[],
  cash: number,
  reserve: number,
): Of<'build'> | null {
  const cost = (tile: TileId) => {
    const t = map.byId[tile];
    return t?.type === 'property' ? t.houseCost : Infinity;
  };
  const affordable = builds.filter((b) => cash - cost(b.tile) >= reserve);
  if (affordable.length === 0) return null;
  if (level === 'normal') {
    // Even build: best rent gain per cost.
    const gain = (tile: TileId) => {
      const t = map.byId[tile];
      const n = s.properties[tile]?.buildings ?? 0;
      if (t?.type !== 'property') return 0;
      return ((t.rent[n + 1] ?? 0) - (t.rent[n] ?? 0)) / t.houseCost;
    };
    return [...affordable].sort((a, b) => gain(b.tile) - gain(a.tile))[0] ?? null;
  }
  // Hard: priority groups first; 3 houses everywhere before going to 4 / hotel.
  const groupRank = (tile: TileId) => {
    const t = map.byId[tile];
    return t?.type === 'property' ? HARD_GROUP_PRIORITY.indexOf(t.group) : 99;
  };
  const myMonopolies = map.buyable.filter(
    (id) => s.properties[id]?.owner === me && hasMonopoly(map, s, me, id),
  );
  const allAtThree = myMonopolies.every((id) => (s.properties[id]?.buildings ?? 0) >= 3);
  const candidates = affordable.filter(
    (b) => allAtThree || (s.properties[b.tile]?.buildings ?? 0) < 3,
  );
  return [...candidates].sort((a, b) => groupRank(a.tile) - groupRank(b.tile))[0] ?? null;
}

function liquidationStep(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  level: Level,
  mortgages: Of<'mortgage'>[],
  sells: Of<'sell_building'>[],
): Action | null {
  const byPrice = <T extends { tile: TileId }>(xs: T[]) =>
    [...xs].sort((a, b) => priceOf(map, a.tile) - priceOf(map, b.tile));
  if (level === 'normal') {
    return byPrice(mortgages)[0] ?? byPrice(sells)[0] ?? null;
  }
  // Hard: keep the best sets as long as possible.
  const iso = byPrice(mortgages.filter((m) => isolated(map, s, me, m.tile)));
  if (iso[0]) return iso[0];
  const groupRank = (tile: TileId) => {
    const t = map.byId[tile];
    return t?.type === 'property' ? HARD_GROUP_PRIORITY.indexOf(t.group) : 99;
  };
  // Then other bare tiles (least valuable groups first): selling houses loses half their cost.
  const bare = [...mortgages].sort((a, b) => groupRank(b.tile) - groupRank(a.tile))[0];
  if (bare) return bare;
  return [...sells].sort((a, b) => groupRank(b.tile) - groupRank(a.tile))[0] ?? null;
}

const empty = (): TradeBundle => ({ cash: 0, tiles: [], jailCards: 0 });

/**
 * Normal: buy the last tile of a set for cash at a fair premium.
 * Hard: offer a 1-for-1 swap (plus cash if needed) that completes its set without completing theirs.
 */
function tradeProposal(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  level: Level,
  cash: number,
  reserve: number,
): Of<'propose_trade'> | null {
  for (const group of Object.values(map.groups)) {
    const missing = group.filter((id) => s.properties[id]?.owner !== me);
    if (missing.length !== 1) continue;
    const target = missing[0] as TileId;
    const owner = s.properties[target]?.owner;
    if (!owner || owner === me) continue;
    const ownerState = s.players.find((p) => p.id === owner);
    if (!ownerState || ownerState.bankrupt) continue;
    if (group.some((id) => (s.properties[id]?.buildings ?? 0) > 0)) continue;
    const price = priceOf(map, target);

    if (level === 'normal') {
      const offerCash = Math.round((price * 1.5) / map.m) * map.m;
      if (cash - offerCash < reserve) continue;
      return {
        type: 'propose_trade',
        to: owner,
        give: { ...empty(), cash: offerCash },
        get: { ...empty(), tiles: [target] },
      };
    }

    // Hard: a cash offer first, then a 1-for-1 swap.
    const cashOffer = Math.round((price * 1.5) / map.m) * map.m;
    if (cash - cashOffer >= reserve) {
      return {
        type: 'propose_trade',
        to: owner,
        give: { ...empty(), cash: cashOffer },
        get: { ...empty(), tiles: [target] },
      };
    }
    // Otherwise find one of my tiles that does not complete their set and makes a fair swap.
    const mine = map.buyable.filter(
      (id) =>
        s.properties[id]?.owner === me &&
        !group.includes(id) &&
        !(s.properties[id]?.mortgaged ?? false) &&
        isolated(map, s, me, id),
    );
    const nearSet = (tile: TileId) => {
      const set = setOf(map, tile);
      const theirs = set.filter((id) => s.properties[id]?.owner === owner).length;
      return theirs + 1 >= set.length - 1;
    };
    for (const give of mine
      .filter((id) => !nearSet(id))
      .sort((a, b) => priceOf(map, a) - priceOf(map, b))) {
      const gap = Math.max(0, price - priceOf(map, give));
      const sweetener = Math.round((gap + price * 0.1) / map.m) * map.m;
      if (cash - sweetener < reserve) continue;
      const offer = {
        from: me,
        to: owner,
        give: { ...empty(), tiles: [give], cash: sweetener },
        get: { ...empty(), tiles: [target] },
      };
      // Seen from the owner's side: `meCompletes` is the owner completing a set.
      const theirs = assessTrade(map, s, owner, offer);
      if (theirs.meCompletes) continue; // never complete an opponent's set
      return { type: 'propose_trade', to: owner, give: offer.give, get: offer.get };
    }
  }
  return null;
}
