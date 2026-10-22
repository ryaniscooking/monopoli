// Auctions (R-050 .. R-053), for declined properties, bankruptcy to the bank and building
// shortages (R-045).
import type { AuctionItem, PlayerId, TileId } from '../types';
import { alivePlayers, getPlayer, money, type Ctx } from './ctx';
import { canBuildOn, nextBuilding, placeBuilding } from './build';
import { transfer } from './money';

function deadline(c: Ctx): number {
  return c.now + c.s.settings.auctionTimerSec * 1000;
}

function start(c: Ctx, item: AuctionItem, bidders: PlayerId[], minBid: number): void {
  const d = deadline(c);
  c.s.pending = {
    kind: 'auction',
    item,
    highBid: 0,
    highBidder: null,
    active: bidders,
    minBid,
    deadline: d,
  };
  c.ev.push({ type: 'auction_started', item, minBid, deadline: d });
}

/** R-050 / R-051: everyone still in the game may bid, including the player who declined. */
export function startPropertyAuction(c: Ctx, tile: TileId): void {
  start(
    c,
    { type: 'property', tile },
    alivePlayers(c.s).map((p) => p.id),
    money(c, 1),
  );
}

/** R-045: auction one building among the players who could use it. */
export function startBuildingAuction(
  c: Ctx,
  requestedBy: PlayerId,
  tile: TileId,
  bidders: PlayerId[],
): void {
  const t = c.map.byId[tile];
  const minBid = t?.type === 'property' ? t.houseCost : money(c, 1);
  start(
    c,
    { type: 'building', building: nextBuilding(c.s, tile), requestedBy, tile },
    bidders,
    minBid,
  );
}

/** Bids are cash only, higher than the current high bid, and no more than the bidder's cash. */
export function placeBid(c: Ctx, player: PlayerId, amount: number): void {
  const a = c.s.pending;
  if (a?.kind !== 'auction') throw new Error('No auction');
  a.highBid = amount;
  a.highBidder = player;
  a.deadline = deadline(c); // R-052: each bid resets the timer
  c.ev.push({ type: 'auction_bid', player, amount, deadline: a.deadline });
  maybeFinish(c);
}

export function withdraw(c: Ctx, player: PlayerId): void {
  const a = c.s.pending;
  if (a?.kind !== 'auction') throw new Error('No auction');
  a.active = a.active.filter((p) => p !== player);
  c.ev.push({ type: 'auction_withdrew', player });
  maybeFinish(c);
}

/** R-052: ends when only the high bidder is left, or nobody is. */
function maybeFinish(c: Ctx): void {
  const a = c.s.pending;
  if (a?.kind !== 'auction') return;
  if (a.active.length === 0 || (a.active.length === 1 && a.active[0] === a.highBidder)) {
    finishAuction(c);
  }
}

/** Sell to the high bidder (or nobody) and continue with any queued auctions. */
export function finishAuction(c: Ctx): void {
  const a = c.s.pending;
  if (a?.kind !== 'auction') throw new Error('No auction');
  c.s.pending = null;
  const winner = a.highBidder;
  if (winner && !getPlayer(c.s, winner).bankrupt) {
    transfer(
      c,
      winner,
      'bank',
      a.highBid,
      `auction:${a.item.type === 'property' ? a.item.tile : 'building'}`,
    );
    if (a.item.type === 'property') {
      c.s.properties[a.item.tile] = { owner: winner, mortgaged: false, buildings: 0 };
    } else {
      const tile = buildingSpot(
        c,
        winner,
        a.item.building,
        a.item.requestedBy === winner ? a.item.tile : null,
      );
      if (tile) placeBuilding(c, winner, tile, 0);
    }
  }
  c.ev.push({ type: 'auction_ended', item: a.item, winner, amount: winner ? a.highBid : 0 });
}

/** Where a won building goes: the requested tile if still valid, else the winner's priciest set. */
function buildingSpot(
  c: Ctx,
  player: PlayerId,
  kind: 'house' | 'hotel',
  preferred: TileId | null,
): TileId | null {
  const ok = (id: TileId) =>
    nextBuilding(c.s, id) === kind &&
    canBuildOn(c.map, c.s, player, id, { ignoreStock: true, ignoreCash: true });
  if (preferred && ok(preferred)) return preferred;
  const options = c.map.buyable.filter(ok);
  options.sort((x, y) => (c.map.byId[y]?.index ?? 0) - (c.map.byId[x]?.index ?? 0));
  return options[0] ?? null;
}

/** Start the next queued auction once nothing else is pending. */
export function runAuctionQueue(c: Ctx): void {
  while (c.s.pending === null && c.s.auctionQueue.length > 0 && c.s.phase !== 'game_over') {
    const tile = c.s.auctionQueue.shift() as TileId;
    if (c.s.properties[tile]?.owner === null) startPropertyAuction(c, tile);
  }
}
