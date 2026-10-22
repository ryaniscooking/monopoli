import type {
  CardEffect,
  ColorGroup,
  DeckId,
  MapConfig,
  ResolvedCard,
  ResolvedMap,
  ResolvedTile,
  TileId,
} from '../types';
import { CLASSIC_PROPERTIES, CLASSIC_TRANSPORT, CLASSIC_UTILITY } from './classic';
import { COLOR_GROUPS, MapConfigSchema } from './schema';
import { validateMapConfig } from './validate';

export class MapError extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[],
  ) {
    super(`${message}:\n- ${problems.join('\n- ')}`);
    this.name = 'MapError';
  }
}

/** Parse raw JSON into a MapConfig, enforcing the schema and the spec 8.1 board checks. */
export function parseMap(raw: unknown): MapConfig {
  const parsed = MapConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MapError(
      'Map does not match the schema',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  const problems = validateMapConfig(parsed.data);
  if (problems.length > 0) throw new MapError(`Map "${parsed.data.id}" is invalid`, problems);
  return parsed.data;
}

function scaleEffect(effect: CardEffect, m: number): CardEffect {
  switch (effect.kind) {
    case 'collect':
    case 'pay':
    case 'collect_each':
    case 'pay_each':
      return { ...effect, amount: effect.amount * m };
    case 'repairs':
      return { ...effect, perHouse: effect.perHouse * m, perHotel: effect.perHotel * m };
    default:
      return effect;
  }
}

/** Validate and scale a map into the form the engine uses. */
export function resolveMap(raw: unknown): ResolvedMap {
  const config = parseMap(raw);
  const m = config.currency.multiplier;
  const deckNames: Record<DeckId, string> = {
    chance: config.decks.chance.name,
    chest: config.decks.chest.name,
  };

  const tiles: ResolvedTile[] = config.tiles.map((t, index): ResolvedTile => {
    switch (t.type) {
      case 'property': {
        const c = CLASSIC_PROPERTIES[t.slot - 1];
        if (!c) throw new Error(`No classic economics for slot ${t.slot}`);
        return {
          type: 'property',
          id: t.id,
          name: t.name,
          index,
          group: t.group,
          slot: t.slot,
          price: (t.price ?? c.price) * m,
          rent: (t.rent ?? c.rent).map((r) => r * m),
          houseCost: (t.houseCost ?? c.houseCost) * m,
          mortgage: (t.mortgage ?? c.mortgage) * m,
        };
      }
      case 'transport':
        return {
          ...t,
          index,
          price: CLASSIC_TRANSPORT.price * m,
          mortgage: CLASSIC_TRANSPORT.mortgage * m,
        };
      case 'utility':
        return {
          ...t,
          index,
          price: CLASSIC_UTILITY.price * m,
          mortgage: CLASSIC_UTILITY.mortgage * m,
        };
      case 'tax':
        return { ...t, index, amount: t.amount * m };
      case 'card':
        return { ...t, index, name: deckNames[t.deck] };
      default:
        return { ...t, index };
    }
  });

  const byId: Record<TileId, ResolvedTile> = {};
  for (const t of tiles) byId[t.id] = t;

  const groups = Object.fromEntries(COLOR_GROUPS.map((g) => [g, [] as TileId[]])) as Record<
    ColorGroup,
    TileId[]
  >;
  for (const t of tiles) if (t.type === 'property') groups[t.group].push(t.id);

  const cards: Record<string, ResolvedCard> = {};
  const decks = {} as Record<DeckId, { name: string; cardIds: string[] }>;
  for (const deck of ['chance', 'chest'] as const) {
    const cfg = config.decks[deck];
    decks[deck] = { name: cfg.name, cardIds: cfg.cards.map((c) => c.id) };
    for (const c of cfg.cards) {
      cards[c.id] = { id: c.id, deck, text: c.text, effect: scaleEffect(c.effect, m) };
    }
  }

  return {
    config,
    id: config.id,
    name: config.name,
    currency: config.currency,
    theme: config.theme,
    m,
    tiles,
    byId,
    buyable: tiles
      .filter((t) => t.type === 'property' || t.type === 'transport' || t.type === 'utility')
      .map((t) => t.id),
    groups,
    transports: tiles.filter((t) => t.type === 'transport').map((t) => t.id),
    utilities: tiles.filter((t) => t.type === 'utility').map((t) => t.id),
    transportRent: CLASSIC_TRANSPORT.rent.map((r) => r * m),
    cards,
    decks,
    tokens: config.tokens,
    botNames: config.botNames,
  };
}
