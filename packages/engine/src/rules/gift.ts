// R-900 "Ko Ko Naw" (house fun, outside the official rules): the player named Thae Thae Lay can
// take a gift from the bank whenever she likes, as often as she likes. The amount comes from
// the map data (`gift`, in classic units); maps without it have no gift.
import type { GameState, PlayerId, ResolvedMap } from '../types';
import type { Ctx } from './ctx';
import { getPlayer } from './ctx';
import { transfer } from './money';

/** Name match ignores case and extra spaces. */
export const GIFT_PLAYER_NAME = 'thae thae lay';

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export function canClaimGift(map: ResolvedMap, s: GameState, player: PlayerId): boolean {
  if (!map.gift || s.phase === 'game_over') return false;
  const p = s.players.find((x) => x.id === player);
  return (
    !!p &&
    !p.bankrupt &&
    p.kind === 'human' &&
    p.controlledBy === 'human' &&
    normalize(p.name) === GIFT_PLAYER_NAME
  );
}

export function claimGift(c: Ctx, player: PlayerId): void {
  getPlayer(c.s, player); // throws for an unknown player
  transfer(c, 'bank', player, c.map.gift, 'gift');
}
