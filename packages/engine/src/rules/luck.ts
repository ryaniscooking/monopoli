// R-901 house luck (house fun, outside the official rules; secret by request). Only for the
// human-controlled players named "Ko Ko" (the lucky one) and "Thae Thae Lay". The dice stay
// two plain dice; the engine just picks among real rolls, so nothing looks different:
// - in Jail, Ko Ko always rolls doubles;
// - GO within reach: 40% of the time Ko Ko lands exactly on it;
// - 50% of his rolls are rolled twice and the better one kept (rent he can pay is not bad);
// - he never lands where the rent is more than his cash (rerolled, up to 6 times);
// - from round 6, 1 in 3 of Thae Thae Lay's rolls that miss his properties are rerolled toward
//   them, but never away from an unowned property she can buy;
// - his Chance / Community Chest draws skip the bad cards (see goodCardsOnly).
import { BOARD_SIZE } from '../map/classic';
import { chance, randomInt, rollDie } from '../rng';
import type { CardEffect, GameState, PlayerId } from '../types';
import { money, type Ctx } from './ctx';
import { rentFor } from './rent';

export const LUCKY_PLAYER_NAME = 'ko ko';
const PARTNER_NAME = 'thae thae lay';
const LUCKY_REROLL_CHANCE = 0.5;
const GO_CHANCE = 0.4;
const PARTNER_DRIFT_CHANCE = 1 / 3;
/** Her early game is left alone so she can buy properties. */
const PARTNER_FROM_ROUND = 6;
const SAFE_TRIES = 6;

type Dice = [number, number];

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

function playerNamed(s: GameState, name: string) {
  return s.players.find(
    (p) =>
      !p.bankrupt && p.kind === 'human' && p.controlledBy === 'human' && normalize(p.name) === name,
  );
}

export function isLucky(s: GameState, player: PlayerId): boolean {
  return playerNamed(s, LUCKY_PLAYER_NAME)?.id === player;
}

const plain = (c: Ctx): Dice => [rollDie(c.rng), rollDie(c.rng)];

/** Where a move roll ends, and whether it sends the player to Jail for a third double. */
function outcome(c: Ctx, player: PlayerId, d: Dice) {
  const p = c.s.players.find((x) => x.id === player);
  const pos = p?.position ?? 0;
  const total = d[0] + d[1];
  return {
    index: (pos + total) % BOARD_SIZE,
    passesGo: pos + total >= BOARD_SIZE,
    thirdDouble: d[0] === d[1] && c.s.doublesCount >= 2,
    total,
  };
}

/** Rent the player would owe on that tile right now (mirrors landOn). */
function rentAt(c: Ctx, player: PlayerId, index: number, total: number): number {
  const tile = c.map.tiles[index];
  if (!tile) return 0;
  const prop = c.s.properties[tile.id];
  if (!prop?.owner || prop.owner === player) return 0;
  const owner = c.s.players.find((x) => x.id === prop.owner);
  if (!owner || owner.bankrupt || (owner.inJail && c.s.settings.noRentInJail)) return 0;
  return rentFor(c.map, c.s, tile.id, total);
}

function cashAfter(c: Ctx, player: PlayerId, passesGo: boolean): number {
  const cash = c.s.players.find((x) => x.id === player)?.cash ?? 0;
  return cash + (passesGo ? money(c, c.s.settings.goSalary) : 0);
}

function unaffordable(c: Ctx, player: PlayerId, d: Dice): boolean {
  const o = outcome(c, player, d);
  if (o.thirdDouble) return true;
  return rentAt(c, player, o.index, o.total) > cashAfter(c, player, o.passesGo);
}

/** Higher is better for the lucky player. */
function score(c: Ctx, player: PlayerId, d: Dice): number {
  const o = outcome(c, player, d);
  if (o.thirdDouble) return -1e12;
  const tile = c.map.tiles[o.index];
  if (!tile) return 0;
  const unit = money(c, 1);
  switch (tile.type) {
    case 'go_to_jail':
      return -1000 * unit;
    case 'tax':
      return -tile.amount;
    case 'card':
      return 50 * unit; // only good cards for him
    case 'go':
    case 'jail':
    case 'free_parking':
      return 0;
    default: {
      const prop = c.s.properties[tile.id];
      if (!prop?.owner) return tile.price <= cashAfter(c, player, o.passesGo) ? 100 * unit : 0;
      if (prop.owner === player) return 20 * unit;
      // Rent he can pay is fine (user's choice); only rent above his cash counts as bad.
      const rent = rentAt(c, player, o.index, o.total);
      return rent > cashAfter(c, player, o.passesGo) ? -rent : 0;
    }
  }
}

/** A real pair summing to `total`, never doubles when that would be a third double. */
function pairFor(c: Ctx, total: number): Dice | null {
  const options: Dice[] = [];
  for (let a = 1; a <= 6; a++) {
    const b = total - a;
    if (b < 1 || b > 6) continue;
    if (a === b && c.s.doublesCount >= 2) continue;
    options.push([a, b]);
  }
  return options.length ? (options[randomInt(c.rng, options.length)] as Dice) : null;
}

function luckyRoll(c: Ctx, player: PlayerId, purpose: 'move' | 'jail'): Dice {
  if (purpose === 'jail') {
    const face = rollDie(c.rng);
    return [face, face];
  }
  const p = c.s.players.find((x) => x.id === player);
  const toGo = (BOARD_SIZE - (p?.position ?? 0)) % BOARD_SIZE;
  if (toGo >= 2 && toGo <= 12 && chance(c.rng, GO_CHANCE)) {
    const pair = pairFor(c, toGo);
    if (pair) return pair;
  }
  let d = plain(c);
  if (chance(c.rng, LUCKY_REROLL_CHANCE)) {
    const other = plain(c);
    if (score(c, player, other) > score(c, player, d)) d = other;
  }
  for (let i = 0; i < SAFE_TRIES && unaffordable(c, player, d); i++) d = plain(c);
  return d;
}

function partnerRoll(c: Ctx, player: PlayerId, lucky: PlayerId): Dice {
  const onHis = (d: Dice) => {
    const tile = c.map.tiles[outcome(c, player, d).index];
    const prop = tile ? c.s.properties[tile.id] : undefined;
    return prop?.owner === lucky && !prop.mortgaged;
  };
  const canBuy = (d: Dice) => {
    const o = outcome(c, player, d);
    const tile = c.map.tiles[o.index];
    const prop = tile ? c.s.properties[tile.id] : undefined;
    return (
      !!tile && 'price' in tile && !prop?.owner && tile.price <= cashAfter(c, player, o.passesGo)
    );
  };
  const first = plain(c);
  if (c.s.round < PARTNER_FROM_ROUND || onHis(first) || canBuy(first)) return first;
  if (!chance(c.rng, PARTNER_DRIFT_CHANCE)) return first;
  const second = plain(c);
  return onHis(second) ? second : first;
}

/** The two dice for a roll; plain dice for everyone else and for utility rolls. */
export function pickDice(c: Ctx, player: PlayerId, purpose: 'move' | 'jail' | 'utility'): Dice {
  if (purpose === 'utility') return plain(c);
  const lucky = playerNamed(c.s, LUCKY_PLAYER_NAME);
  if (!lucky) return plain(c);
  if (lucky.id === player) return luckyRoll(c, player, purpose);
  const partner = playerNamed(c.s, PARTNER_NAME);
  if (partner?.id === player && purpose === 'move') return partnerRoll(c, player, lucky.id);
  return plain(c);
}

const BAD_CARDS: ReadonlySet<CardEffect['kind']> = new Set([
  'pay',
  'pay_each',
  'repairs',
  'go_to_jail',
]);

/** Moves bad cards from the top of the deck to the bottom when the lucky player draws. */
export function goodCardsOnly(c: Ctx, player: PlayerId, order: string[]): void {
  if (!isLucky(c.s, player)) return;
  for (let i = 0; i < order.length; i++) {
    const card = c.map.cards[order[0] as string];
    if (!card || !BAD_CARDS.has(card.effect.kind)) return;
    order.push(order.shift() as string);
  }
}
