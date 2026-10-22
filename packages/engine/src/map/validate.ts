import type { MapConfig } from '../types';
import { BOARD_LAYOUT, GROUP_BY_SLOT } from './classic';

const EXPECTED_GROUP_SIZES: Record<string, number> = {
  brown: 2,
  lightblue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkblue: 2,
};

/**
 * Spec 8.1 checks beyond the schema: board layout (8.2), group sizes, tile counts,
 * decks and card references. Returns a list of problems (empty = valid).
 */
export function validateMapConfig(map: MapConfig): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  map.tiles.forEach((tile, i) => {
    if (ids.has(tile.id)) problems.push(`tile ${i}: duplicate id "${tile.id}"`);
    ids.add(tile.id);

    const expected = BOARD_LAYOUT[i] as string;
    const at = `tile ${i} ("${tile.id}")`;
    if (/^p\d\d$/.test(expected)) {
      const slot = Number(expected.slice(1));
      if (tile.type !== 'property') {
        problems.push(`${at}: expected property ${expected}, got ${tile.type}`);
      } else {
        if (tile.slot !== slot) problems.push(`${at}: expected slot ${slot}, got ${tile.slot}`);
        if (tile.id !== expected) problems.push(`${at}: property id must be "${expected}"`);
        const group = GROUP_BY_SLOT[slot - 1];
        if (tile.group !== group)
          problems.push(`${at}: expected group ${group}, got ${tile.group}`);
      }
    } else if (/^t\d$/.test(expected)) {
      if (tile.type !== 'transport' || tile.id !== expected)
        problems.push(`${at}: expected transport "${expected}"`);
    } else if (/^u\d$/.test(expected)) {
      if (tile.type !== 'utility' || tile.id !== expected)
        problems.push(`${at}: expected utility "${expected}"`);
    } else if (expected === 'chance' || expected === 'chest') {
      if (tile.type !== 'card' || tile.deck !== expected)
        problems.push(`${at}: expected ${expected} card tile`);
    } else if (expected === 'tax') {
      if (tile.type !== 'tax') problems.push(`${at}: expected tax tile`);
    } else {
      const type = { go: 'go', jail: 'jail', parking: 'free_parking', gotojail: 'go_to_jail' }[
        expected
      ];
      if (tile.type !== type) problems.push(`${at}: expected ${type}`);
    }
  });

  const count = (type: string) => map.tiles.filter((t) => t.type === type).length;
  const counts: [string, number][] = [
    ['property', 22],
    ['transport', 4],
    ['utility', 2],
    ['tax', 2],
  ];
  for (const [type, n] of counts) {
    if (count(type) !== n) problems.push(`expected ${n} ${type} tiles, found ${count(type)}`);
  }
  for (const deck of ['chance', 'chest'] as const) {
    const n = map.tiles.filter((t) => t.type === 'card' && t.deck === deck).length;
    if (n !== 3) problems.push(`expected 3 ${deck} tiles, found ${n}`);
  }

  const groupSizes: Record<string, number> = {};
  for (const t of map.tiles)
    if (t.type === 'property') groupSizes[t.group] = (groupSizes[t.group] ?? 0) + 1;
  for (const [g, n] of Object.entries(EXPECTED_GROUP_SIZES)) {
    if (groupSizes[g] !== n)
      problems.push(`group ${g}: expected ${n} properties, found ${groupSizes[g] ?? 0}`);
  }

  const cardIds = new Set<string>();
  for (const deck of ['chance', 'chest'] as const) {
    const cards = map.decks[deck].cards;
    if (cards.length !== 16)
      problems.push(`${deck} deck: expected 16 cards, found ${cards.length}`);
    if (!cards.some((c) => c.effect.kind === 'jail_free'))
      problems.push(`${deck} deck: needs at least one Get Out of Jail Free card`);
    for (const c of cards) {
      if (cardIds.has(c.id)) problems.push(`card id "${c.id}" is duplicated`);
      cardIds.add(c.id);
      if (c.effect.kind === 'advance_to' && !ids.has(c.effect.tile))
        problems.push(`card ${c.id}: unknown tile "${c.effect.tile}"`);
    }
  }

  const tokenIds = new Set(map.tokens.map((t) => t.id));
  if (tokenIds.size !== map.tokens.length) problems.push('token ids must be unique');

  return problems;
}
