// Property valuation for bots (spec 9.2): value = price * groupWeight * (1 + setBonus + blockBonus).
import type { ColorGroup, GameState, PlayerId, ResolvedMap, TileId, TradeOffer } from '../types';

const GROUP_WEIGHT: Record<ColorGroup, number> = {
  brown: 0.8,
  lightblue: 1.0,
  pink: 1.05,
  orange: 1.25,
  red: 1.2,
  yellow: 1.1,
  green: 1.0,
  darkblue: 0.95,
};
const TRANSPORT_WEIGHT = 1.05;
const UTILITY_WEIGHT = 0.7;

type Owners = Record<TileId, PlayerId | null>;

function ownersOf(s: GameState): Owners {
  const o: Owners = {};
  for (const [id, p] of Object.entries(s.properties)) o[id] = p.owner;
  return o;
}

/** The tiles that form this tile's "set": its color group, all transports, or both utilities. */
export function setOf(map: ResolvedMap, tile: TileId): readonly TileId[] {
  const t = map.byId[tile];
  if (t?.type === 'property') return map.groups[t.group];
  if (t?.type === 'transport') return map.transports;
  if (t?.type === 'utility') return map.utilities;
  return [];
}

function weight(map: ResolvedMap, tile: TileId): number {
  const t = map.byId[tile];
  if (t?.type === 'property') return GROUP_WEIGHT[t.group];
  if (t?.type === 'transport') return TRANSPORT_WEIGHT;
  if (t?.type === 'utility') return UTILITY_WEIGHT;
  return 0;
}

function price(map: ResolvedMap, tile: TileId): number {
  const t = map.byId[tile];
  return t && 'price' in t ? t.price : 0;
}

/**
 * What `tile` is worth to `player` if they acquire it (spec 9.2):
 * +0.15 per tile of the set they already own, +0.6 if it completes the set,
 * +0.4 if it blocks an opponent who owns all the other tiles of the set.
 */
export function acquisitionValue(
  map: ResolvedMap,
  s: GameState,
  player: PlayerId,
  tile: TileId,
  owners: Owners = ownersOf(s),
): number {
  const others = setOf(map, tile).filter((id) => id !== tile);
  const mine = others.filter((id) => owners[id] === player).length;
  let bonus = 0.15 * mine;
  if (mine === others.length && others.length > 0) bonus += 0.6;
  const firstOwner = others.length > 0 ? owners[others[0] as TileId] : null;
  if (firstOwner && firstOwner !== player && others.every((id) => owners[id] === firstOwner)) {
    bonus += 0.4;
  }
  return price(map, tile) * weight(map, tile) * (1 + bonus);
}

/** Total value of everything `player` owns under `owners` (sets count extra). */
export function portfolioValue(map: ResolvedMap, owners: Owners, player: PlayerId): number {
  let total = 0;
  for (const tile of map.buyable) {
    if (owners[tile] !== player) continue;
    const set = setOf(map, tile);
    const mine = set.filter((id) => owners[id] === player).length;
    const complete = mine === set.length;
    total += price(map, tile) * weight(map, tile) * (1 + 0.15 * (mine - 1) + (complete ? 0.6 : 0));
  }
  return total;
}

/** Whether `player` owns a complete set under `owners` that they did not own under `before`. */
export function completesSet(
  map: ResolvedMap,
  before: Owners,
  after: Owners,
  player: PlayerId,
): boolean {
  for (const group of Object.values(map.groups)) {
    const full = (o: Owners) => group.every((id) => o[id] === player);
    if (full(after) && !full(before)) return true;
  }
  return false;
}

export interface TradeAssessment {
  /** Value gained by `me` (positive = good for me), in map units. */
  gain: number;
  /** Value `me` gives away, for percentage thresholds. */
  given: number;
  meCompletes: boolean;
  themCompletes: boolean;
}

/** How a trade offer looks to `me` (either side of it). */
export function assessTrade(
  map: ResolvedMap,
  s: GameState,
  me: PlayerId,
  offer: Pick<TradeOffer, 'from' | 'to' | 'give' | 'get'>,
): TradeAssessment {
  const before = ownersOf(s);
  const after: Owners = { ...before };
  for (const id of offer.give.tiles) after[id] = offer.to;
  for (const id of offer.get.tiles) after[id] = offer.from;
  const them = me === offer.from ? offer.to : offer.from;
  const mineOut = me === offer.from ? offer.give : offer.get;
  const mineIn = me === offer.from ? offer.get : offer.give;
  const jailValue = 50 * map.m;
  const gain =
    portfolioValue(map, after, me) -
    portfolioValue(map, before, me) +
    mineIn.cash -
    mineOut.cash +
    (mineIn.jailCards - mineOut.jailCards) * jailValue;
  const given =
    mineOut.tiles.reduce((sum, id) => sum + acquisitionValue(map, s, me, id, before), 0) +
    mineOut.cash +
    mineOut.jailCards * jailValue;
  return {
    gain,
    given,
    meCompletes: completesSet(map, before, after, me),
    themCompletes: completesSet(map, before, after, them),
  };
}
