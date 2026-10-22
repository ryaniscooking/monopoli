import { z } from 'zod';

export const COLOR_GROUPS = [
  'brown',
  'lightblue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'darkblue',
] as const;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'must be a #RRGGBB hex color');
const classicMoney = z.number().int().nonnegative();
const name = z.string().min(1);

export const ColorGroupSchema = z.enum(COLOR_GROUPS);
export const DeckIdSchema = z.enum(['chance', 'chest']);

export const TileSchema = z.discriminatedUnion('type', [
  z.object({ id: z.literal('go'), type: z.literal('go'), name }),
  z.object({
    id: z.string().regex(/^p\d\d$/),
    type: z.literal('property'),
    name,
    group: ColorGroupSchema,
    slot: z.number().int().min(1).max(22),
    // Optional overrides in classic units; defaults come from the classic table by slot.
    price: classicMoney.optional(),
    rent: z.array(classicMoney).length(6).optional(),
    houseCost: classicMoney.optional(),
    mortgage: classicMoney.optional(),
  }),
  z.object({ id: z.string().min(1), type: z.literal('transport'), name, icon: z.string().min(1) }),
  z.object({
    id: z.string().min(1),
    type: z.literal('utility'),
    name,
    icon: z.enum(['electricity', 'water']),
  }),
  z.object({ id: z.string().min(1), type: z.literal('tax'), name, amount: classicMoney }),
  z.object({ id: z.string().min(1), type: z.literal('card'), deck: DeckIdSchema }),
  z.object({ id: z.literal('jail'), type: z.literal('jail'), name }),
  z.object({ id: z.literal('parking'), type: z.literal('free_parking'), name }),
  z.object({ id: z.literal('gotojail'), type: z.literal('go_to_jail'), name }),
]);

export const CardEffectSchema = z.union([
  z.object({
    kind: z.literal('advance_to'),
    tile: z.string().min(1),
    collectGoIfPassed: z.boolean(),
  }),
  z.object({
    kind: z.literal('advance_nearest'),
    tileType: z.literal('transport'),
    rentMultiplier: z.literal(2),
  }),
  z.object({
    kind: z.literal('advance_nearest'),
    tileType: z.literal('utility'),
    diceMultiplier: z.literal(10),
  }),
  z.object({ kind: z.literal('collect'), amount: classicMoney }),
  z.object({ kind: z.literal('pay'), amount: classicMoney }),
  z.object({ kind: z.literal('collect_each'), amount: classicMoney }),
  z.object({ kind: z.literal('pay_each'), amount: classicMoney }),
  z.object({ kind: z.literal('repairs'), perHouse: classicMoney, perHotel: classicMoney }),
  z.object({ kind: z.literal('move_back'), spaces: z.number().int().min(1).max(39) }),
  z.object({ kind: z.literal('go_to_jail') }),
  z.object({ kind: z.literal('jail_free') }),
]);

export const CardConfigSchema = z.object({
  id: z.string().min(1),
  text: name,
  effect: CardEffectSchema,
});
export const DeckConfigSchema = z.object({ name, cards: z.array(CardConfigSchema) });

export const MapConfigSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name,
  currency: z.object({
    code: z.string().min(1),
    symbol: z.string().min(1),
    symbolPosition: z.enum(['prefix', 'suffix']),
    multiplier: z.number().int().positive(),
    compactFrom: z.number().int().positive(),
    locale: z.string().min(1),
  }),
  theme: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    boardBg: hex,
    tileBg: hex,
    text: hex,
    groupColors: z.record(ColorGroupSchema, hex),
    playerColors: z.array(hex).length(6),
  }),
  tiles: z.array(TileSchema).length(40),
  decks: z.object({ chance: DeckConfigSchema, chest: DeckConfigSchema }),
  tokens: z.array(z.object({ id: z.string().min(1), name, icon: z.string().min(1) })).min(8),
  botNames: z.array(name).min(12),
});

export type ColorGroup = z.infer<typeof ColorGroupSchema>;
export type DeckId = z.infer<typeof DeckIdSchema>;
export type Tile = z.infer<typeof TileSchema>;
export type CardEffect = z.infer<typeof CardEffectSchema>;
export type CardConfig = z.infer<typeof CardConfigSchema>;
export type DeckConfig = z.infer<typeof DeckConfigSchema>;
export type MapConfig = z.infer<typeof MapConfigSchema>;
