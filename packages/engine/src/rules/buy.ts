// Buying or declining an unowned property (R-020, R-050).
import type { PlayerId } from '../types';
import { startPropertyAuction } from './auction';
import type { Ctx } from './ctx';
import { transfer } from './money';

export function buy(c: Ctx, player: PlayerId): void {
  const p = c.s.pending;
  if (p?.kind !== 'buy') throw new Error('No pending buy');
  c.s.pending = null;
  transfer(c, player, 'bank', p.price, `buy:${p.tile}`);
  const prop = c.s.properties[p.tile];
  if (prop) prop.owner = player;
  c.ev.push({ type: 'bought', player, tile: p.tile, price: p.price });
}

export function declineBuy(c: Ctx, player: PlayerId): void {
  const p = c.s.pending;
  if (p?.kind !== 'buy') throw new Error('No pending buy');
  c.s.pending = null;
  c.ev.push({ type: 'buy_declined', player, tile: p.tile });
  if (c.s.settings.auctionOnDecline) startPropertyAuction(c, p.tile);
}
