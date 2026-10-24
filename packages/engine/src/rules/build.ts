// Houses and hotels (R-040 .. R-046).
import type { GameState, PlayerId, PropertyTile, ResolvedMap, TileId } from '../types';
import type { Ctx } from './ctx';
import { transfer } from './money';
import { hasMonopoly } from './rent';

const HOTEL = 5;

function propertyTile(map: ResolvedMap, tile: TileId): PropertyTile | null {
  const t = map.byId[tile];
  return t?.type === 'property' ? t : null;
}

function groupBuildings(map: ResolvedMap, s: GameState, t: PropertyTile): number[] {
  return map.groups[t.group].map((id) => s.properties[id]?.buildings ?? 0);
}

/** 'house' or 'hotel': what the next building on this tile would be. */
export function nextBuilding(s: GameState, tile: TileId): 'house' | 'hotel' {
  return (s.properties[tile]?.buildings ?? 0) === 4 ? 'hotel' : 'house';
}

/** Bank stock for that building type; unlimited with the house rule. */
export function bankStock(s: GameState, kind: 'house' | 'hotel'): number {
  if (s.settings.unlimitedBuildings) return Infinity;
  return kind === 'hotel' ? s.bank.hotels : s.bank.houses;
}

/**
 * R-040 .. R-043: whether `player` may put the next building on `tile`, ignoring timing.
 * `ignoreStock` and `ignoreCash` are used for shortage checks and auction placement.
 */
export function canBuildOn(
  map: ResolvedMap,
  s: GameState,
  player: PlayerId,
  tile: TileId,
  opts: { ignoreStock?: boolean; ignoreCash?: boolean } = {},
): boolean {
  const t = propertyTile(map, tile);
  const prop = s.properties[tile];
  if (!t || !prop || prop.owner !== player) return false;
  if (!hasMonopoly(map, s, player, tile)) return false; // R-040 (also: none mortgaged)
  if (prop.buildings >= HOTEL) return false; // R-042
  if (s.settings.evenBuild && prop.buildings !== Math.min(...groupBuildings(map, s, t))) {
    return false; // R-041
  }
  if (!opts.ignoreStock && bankStock(s, nextBuilding(s, tile)) < 1) return false; // R-045
  const p = s.players.find((x) => x.id === player);
  if (!opts.ignoreCash && (!p || p.cash < t.houseCost)) return false; // R-043
  return true;
}

/** R-044: sell evenly (from the most built tile of the group). */
export function canSellOn(map: ResolvedMap, s: GameState, player: PlayerId, tile: TileId) {
  const t = propertyTile(map, tile);
  const prop = s.properties[tile];
  if (!t || !prop || prop.owner !== player || prop.buildings === 0) return false;
  if (s.settings.evenBuild && prop.buildings !== Math.max(...groupBuildings(map, s, t))) {
    return false;
  }
  return true;
}

/** Players who could take the next building of `kind` right now if stock allowed (R-045). */
export function playersWantingBuilding(
  map: ResolvedMap,
  s: GameState,
  kind: 'house' | 'hotel',
): PlayerId[] {
  return s.players
    .filter((p) => !p.bankrupt)
    .filter((p) =>
      map.buyable.some(
        (id) =>
          s.properties[id]?.owner === p.id &&
          nextBuilding(s, id) === kind &&
          canBuildOn(map, s, p.id, id, { ignoreStock: true }),
      ),
    )
    .map((p) => p.id);
}

/**
 * R-045: a shortage exists when two or more players could build this kind of building and the
 * bank has fewer left than that. Building then goes to auction instead.
 */
export function isShortage(map: ResolvedMap, s: GameState, kind: 'house' | 'hotel'): boolean {
  if (s.settings.unlimitedBuildings) return false;
  const wanting = playersWantingBuilding(map, s, kind).length;
  return wanting >= 2 && bankStock(s, kind) < wanting;
}

/** Put one building on the tile, taking it from the bank; `cost` is paid to the bank. */
export function placeBuilding(c: Ctx, player: PlayerId, tile: TileId, cost: number): void {
  const prop = c.s.properties[tile];
  if (!prop) throw new Error(`No property ${tile}`);
  if (prop.buildings === 4) {
    // Hotel replaces 4 houses, which go back to the bank (R-042).
    c.s.bank.hotels -= 1;
    c.s.bank.houses += 4;
    prop.buildings = 5;
  } else {
    c.s.bank.houses -= 1;
    prop.buildings = (prop.buildings + 1) as typeof prop.buildings;
  }
  if (cost > 0) transfer(c, player, 'bank', cost, `build:${tile}`);
  c.ev.push({ type: 'built', player, tile, buildings: prop.buildings, cost });
}

/** R-044: sell one building back for half its cost. */
/**
 * R-044: cash for selling the next building on `tile`: half the house cost, or half of all five
 * building costs when a hotel cannot be broken down (the bank has fewer than 4 houses).
 */
export function sellValue(map: ResolvedMap, s: GameState, tile: TileId): number {
  const t = propertyTile(map, tile);
  const prop = s.properties[tile];
  if (!t || !prop || prop.buildings === 0) return 0;
  const half = Math.floor(t.houseCost / 2);
  if (prop.buildings === HOTEL && !s.settings.unlimitedBuildings && s.bank.houses < 4) {
    return half * 5;
  }
  return half;
}

export function sellBuilding(c: Ctx, player: PlayerId, tile: TileId): void {
  const t = propertyTile(c.map, tile);
  const prop = c.s.properties[tile];
  if (!t || !prop) throw new Error(`No property ${tile}`);
  const half = Math.floor(t.houseCost / 2);
  let amount: number;
  if (prop.buildings === HOTEL) {
    c.s.bank.hotels += 1;
    if (c.s.settings.unlimitedBuildings || c.s.bank.houses >= 4) {
      c.s.bank.houses -= 4;
      prop.buildings = 4;
      amount = half;
    } else {
      // Not enough houses to break the hotel down: it is sold down to nothing.
      prop.buildings = 0;
      amount = half * 5;
    }
  } else {
    c.s.bank.houses += 1;
    prop.buildings = (prop.buildings - 1) as typeof prop.buildings;
    amount = half;
  }
  transfer(c, 'bank', player, amount, `sell_building:${tile}`);
  c.ev.push({ type: 'sold_building', player, tile, buildings: prop.buildings, amount });
}

/** R-081: before a bankruptcy every building is sold to the bank at half price. */
export function sellAllBuildings(c: Ctx, player: PlayerId): void {
  for (const id of c.map.buyable) {
    const t = propertyTile(c.map, id);
    const prop = c.s.properties[id];
    if (!t || !prop || prop.owner !== player || prop.buildings === 0) continue;
    const half = Math.floor(t.houseCost / 2);
    const amount = half * prop.buildings;
    if (prop.buildings === HOTEL) c.s.bank.hotels += 1;
    else c.s.bank.houses += prop.buildings;
    prop.buildings = 0;
    transfer(c, 'bank', player, amount, `sell_building:${id}`);
    c.ev.push({ type: 'sold_building', player, tile: id, buildings: 0, amount });
  }
}
