// What happens on the tile a player lands on (R-020 .. R-027, R-034, R-035).
import type { PlayerId } from '../types';
import { drawCard } from './cards';
import { getPlayer, type Ctx } from './ctx';
import { charge, finesTo, transfer } from './money';
import { rollDice, sendToJail } from './movement';
import { rentFor, type RentModifier } from './rent';

export function landOn(c: Ctx, player: PlayerId, mod: RentModifier = {}): void {
  const p = getPlayer(c.s, player);
  const tile = c.map.tiles[p.position];
  if (!tile) throw new Error(`No tile at ${p.position}`);
  c.ev.push({ type: 'landed', player, tile: tile.id });

  switch (tile.type) {
    case 'go':
    case 'jail': // R-027 just visiting
      return;
    case 'free_parking': // R-026
      if (c.s.settings.freeParkingPot && c.s.parkingPot > 0) {
        transfer(c, 'pot', player, c.s.parkingPot, 'free_parking_pot');
      }
      return;
    case 'go_to_jail': // R-025
      sendToJail(c, player, 'tile');
      return;
    case 'tax': // R-023
      c.ev.push({ type: 'tax_paid', player, tile: tile.id, amount: tile.amount });
      charge(c, player, finesTo(c), tile.amount, `tax:${tile.id}`);
      return;
    case 'card': // R-024
      drawCard(c, player, tile.deck);
      return;
    default: {
      const prop = c.s.properties[tile.id];
      if (!prop) throw new Error(`No property state for ${tile.id}`);
      if (prop.owner === null) {
        // R-020: offer to buy at list price.
        c.s.pending = { kind: 'buy', player, tile: tile.id, price: tile.price };
        return;
      }
      if (prop.owner === player || prop.mortgaged) return; // R-022, R-021
      const owner = getPlayer(c.s, prop.owner);
      if (owner.bankrupt) return;
      if (owner.inJail && c.s.settings.noRentInJail) return; // R-035 house rule
      let diceTotal = c.s.lastRoll ? c.s.lastRoll[0] + c.s.lastRoll[1] : 0;
      if (tile.type === 'utility' && mod.utilityDiceMultiplier) {
        diceTotal = rollDice(c, player, 'utility').total; // R-034 fresh roll
      }
      const rent = rentFor(c.map, c.s, tile.id, diceTotal, mod);
      if (rent <= 0) return;
      c.ev.push({ type: 'rent_paid', from: player, to: owner.id, tile: tile.id, amount: rent });
      charge(c, player, owner.id, rent, `rent:${tile.id}`);
    }
  }
}
