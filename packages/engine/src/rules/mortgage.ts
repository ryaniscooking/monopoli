// Mortgages (R-060 .. R-063).
import type { GameState, PlayerId, ResolvedMap, TileId } from '../types';
import type { Ctx } from './ctx';
import { mortgageInterest, transfer } from './money';

function mortgageValue(map: ResolvedMap, tile: TileId): number {
  const t = map.byId[tile];
  return t && 'mortgage' in t ? t.mortgage : 0;
}

/** R-062: mortgage value + 10%, rounded half up. */
export function unmortgageCost(map: ResolvedMap, tile: TileId): number {
  const m = mortgageValue(map, tile);
  return m + mortgageInterest(m);
}

/** R-060: owned, not mortgaged, and no buildings anywhere in its color group. */
export function canMortgage(map: ResolvedMap, s: GameState, player: PlayerId, tile: TileId) {
  const prop = s.properties[tile];
  if (prop?.owner !== player || prop.mortgaged) return false;
  const t = map.byId[tile];
  if (t?.type === 'property') {
    return map.groups[t.group].every((id) => (s.properties[id]?.buildings ?? 0) === 0);
  }
  return true;
}

export function canUnmortgage(map: ResolvedMap, s: GameState, player: PlayerId, tile: TileId) {
  const prop = s.properties[tile];
  const p = s.players.find((x) => x.id === player);
  return prop?.owner === player && prop.mortgaged && !!p && p.cash >= unmortgageCost(map, tile);
}

export function mortgage(c: Ctx, player: PlayerId, tile: TileId): void {
  const prop = c.s.properties[tile];
  if (!prop) throw new Error(`No property ${tile}`);
  const amount = mortgageValue(c.map, tile);
  prop.mortgaged = true;
  transfer(c, 'bank', player, amount, `mortgage:${tile}`); // R-061
  c.ev.push({ type: 'mortgaged', player, tile, amount });
}

export function unmortgage(c: Ctx, player: PlayerId, tile: TileId): void {
  const prop = c.s.properties[tile];
  if (!prop) throw new Error(`No property ${tile}`);
  const amount = unmortgageCost(c.map, tile);
  prop.mortgaged = false;
  transfer(c, player, 'bank', amount, `unmortgage:${tile}`);
  c.ev.push({ type: 'unmortgaged', player, tile, amount });
}
