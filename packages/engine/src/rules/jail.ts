// Leaving Jail before rolling (R-071, R-075).
import type { PlayerId } from '../types';
import { getPlayer, money, type Ctx } from './ctx';
import { finesTo, returnJailCard, transfer } from './money';

export function payJailFine(c: Ctx, player: PlayerId): void {
  const p = getPlayer(c.s, player);
  transfer(c, player, finesTo(c), money(c, c.s.settings.jailFine), 'jail_fine');
  p.inJail = false;
  p.jailTurns = 0;
  c.ev.push({ type: 'released', player, how: 'fine' });
}

export function useJailCard(c: Ctx, player: PlayerId): void {
  const p = getPlayer(c.s, player);
  const cardId = p.jailCardIds.shift();
  if (!cardId) throw new Error('No Get Out of Jail Free card');
  p.jailCards = p.jailCardIds.length;
  returnJailCard(c, cardId);
  p.inJail = false;
  p.jailTurns = 0;
  c.ev.push({ type: 'released', player, how: 'card' });
}
