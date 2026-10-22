// Chance / Community Chest (R-024, R-034, R-084).
import { BOARD_SIZE } from '../map/classic';
import type { CardEffect, DebtEntry, DeckId, PlayerId } from '../types';
import { alivePlayers, getPlayer, type Ctx } from './ctx';
import { landOn } from './landing';
import { finesTo, settle, transfer } from './money';
import { moveBack, moveTo, sendToJail } from './movement';

/** Draw the top card, apply it, and put it on the bottom (Get Out of Jail Free is kept). */
export function drawCard(c: Ctx, player: PlayerId, deck: DeckId): void {
  const order = deck === 'chance' ? c.sec.chanceOrder : c.sec.chestOrder;
  const id = order.shift();
  if (id === undefined) return; // every card of this deck is held as Get Out of Jail Free
  const card = c.map.cards[id];
  if (!card) throw new Error(`Unknown card ${id}`);
  c.ev.push({ type: 'card_drawn', player, deck, card: id });

  if (card.effect.kind === 'jail_free') {
    const p = getPlayer(c.s, player);
    p.jailCardIds.push(id);
    p.jailCards = p.jailCardIds.length;
  } else {
    order.push(id);
  }
  c.s.deckCounts[deck] = order.length;
  applyEffect(c, player, card.effect);
}

function applyEffect(c: Ctx, player: PlayerId, e: CardEffect): void {
  const p = getPlayer(c.s, player);
  switch (e.kind) {
    case 'advance_to': {
      const tile = c.map.byId[e.tile];
      if (!tile) throw new Error(`Card targets unknown tile ${e.tile}`);
      moveTo(c, player, tile.index, e.collectGoIfPassed);
      landOn(c, player);
      return;
    }
    case 'advance_nearest': {
      const ids = e.tileType === 'transport' ? c.map.transports : c.map.utilities;
      const target = nearestAhead(c, p.position, ids);
      moveTo(c, player, target, true);
      landOn(
        c,
        player,
        e.tileType === 'transport'
          ? { transportMultiplier: e.rentMultiplier }
          : { utilityDiceMultiplier: e.diceMultiplier },
      );
      return;
    }
    case 'collect':
      transfer(c, 'bank', player, e.amount, 'card');
      return;
    case 'pay':
      settle(c, [{ debtor: player, creditor: finesTo(c), amount: e.amount, reason: 'card' }]);
      return;
    case 'collect_each': {
      // Every other player pays you, in seat order (R-084).
      const entries: DebtEntry[] = alivePlayers(c.s)
        .filter((o) => o.id !== player)
        .map((o) => ({ debtor: o.id, creditor: player, amount: e.amount, reason: 'card' }));
      settle(c, entries);
      return;
    }
    case 'pay_each': {
      const entries: DebtEntry[] = alivePlayers(c.s)
        .filter((o) => o.id !== player)
        .map((o) => ({ debtor: player, creditor: o.id, amount: e.amount, reason: 'card' }));
      settle(c, entries);
      return;
    }
    case 'repairs': {
      let houses = 0;
      let hotels = 0;
      for (const id of c.map.buyable) {
        const prop = c.s.properties[id];
        if (prop?.owner !== player) continue;
        if (prop.buildings === 5) hotels++;
        else houses += prop.buildings;
      }
      const amount = houses * e.perHouse + hotels * e.perHotel;
      if (amount > 0) {
        settle(c, [{ debtor: player, creditor: finesTo(c), amount, reason: 'card_repairs' }]);
      }
      return;
    }
    case 'move_back':
      moveBack(c, player, e.spaces);
      landOn(c, player);
      return;
    case 'go_to_jail':
      sendToJail(c, player, 'card');
      return;
    case 'jail_free':
      return; // kept by the player in drawCard
  }
}

function nearestAhead(c: Ctx, from: number, ids: readonly string[]): number {
  const indexes = ids.map((id) => c.map.byId[id]?.index ?? -1);
  let best = -1;
  let bestDist = Infinity;
  for (const idx of indexes) {
    const dist = (idx - from + BOARD_SIZE) % BOARD_SIZE || BOARD_SIZE;
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}
