import type { GameState, PlayerId, ResolvedMap } from './types';

/**
 * R-101: cash + property prices (mortgaged at mortgage value) + building costs (full cost;
 * a hotel counts as five buildings).
 */
export function netWorth(map: ResolvedMap, state: GameState, player: PlayerId): number {
  const p = state.players.find((x) => x.id === player);
  if (!p) return 0;
  let total = p.cash;
  for (const id of map.buyable) {
    const prop = state.properties[id];
    const tile = map.byId[id];
    if (prop?.owner !== player || !tile || !('price' in tile)) continue;
    total += prop.mortgaged ? tile.mortgage : tile.price;
    if (tile.type === 'property') total += prop.buildings * tile.houseCost;
  }
  return total;
}
