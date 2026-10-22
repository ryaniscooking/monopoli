// Rent (R-030 .. R-035). Pure helpers, also used by the UI deed card and bots.
import type { GameState, PlayerId, ResolvedMap, TileId } from '../types';

export interface RentModifier {
  /** Card "advance to nearest transport": pay double (R-034). */
  transportMultiplier?: number;
  /** Card "advance to nearest utility": pay this times a fresh dice roll (R-034). */
  utilityDiceMultiplier?: number;
}

export function ownsWholeGroup(map: ResolvedMap, s: GameState, owner: PlayerId, tile: TileId) {
  const t = map.byId[tile];
  if (t?.type !== 'property') return false;
  return map.groups[t.group].every((id) => s.properties[id]?.owner === owner);
}

/** Owner has the full color set and none of it is mortgaged (R-030, R-040, R-063). */
export function hasMonopoly(map: ResolvedMap, s: GameState, owner: PlayerId, tile: TileId) {
  const t = map.byId[tile];
  if (t?.type !== 'property') return false;
  return map.groups[t.group].every((id) => {
    const p = s.properties[id];
    return p?.owner === owner && !p.mortgaged;
  });
}

function countOwnedUnmortgaged(s: GameState, owner: PlayerId, ids: readonly TileId[]) {
  return ids.filter((id) => {
    const p = s.properties[id];
    return p?.owner === owner && !p.mortgaged;
  }).length;
}

/**
 * Rent owed for landing on `tile`, or 0 when none is due (unowned, mortgaged).
 * `diceTotal` is the total used for utilities (the move roll, or a fresh roll for the card).
 */
export function rentFor(
  map: ResolvedMap,
  s: GameState,
  tile: TileId,
  diceTotal: number,
  mod: RentModifier = {},
): number {
  const t = map.byId[tile];
  const prop = s.properties[tile];
  if (!t || !prop?.owner || prop.mortgaged) return 0;
  const owner = prop.owner;

  switch (t.type) {
    case 'property': {
      if (prop.buildings > 0) return t.rent[prop.buildings] ?? 0;
      const base = t.rent[0] ?? 0;
      const doubled = s.settings.doubleRentOnSet && hasMonopoly(map, s, owner, tile);
      return doubled ? base * 2 : base;
    }
    case 'transport': {
      const n = countOwnedUnmortgaged(s, owner, map.transports);
      const base = map.transportRent[n - 1] ?? 0;
      return base * (mod.transportMultiplier ?? 1);
    }
    case 'utility': {
      if (mod.utilityDiceMultiplier) return diceTotal * mod.utilityDiceMultiplier;
      const n = countOwnedUnmortgaged(s, owner, map.utilities);
      return diceTotal * (n >= 2 ? 10 : 4);
    }
    default:
      return 0;
  }
}
