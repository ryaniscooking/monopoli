import { RAW_MAPS, MAP_IDS } from '@monopoli/maps';
import { describe, expect, it } from 'vitest';
import { formatMoney, MapError, resolveMap, validateMapConfig, parseMap } from '../src/index';
import { dubai, myanmar } from './helpers';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('Maps (spec 8)', () => {
  it.each(MAP_IDS)('%s passes the schema and every 8.1 check', (id) => {
    const map = resolveMap(RAW_MAPS[id]);
    expect(map.id).toBe(id);
    expect(map.tiles).toHaveLength(40);
    expect(map.buyable).toHaveLength(28);
    expect(Object.keys(map.cards)).toHaveLength(32);
  });

  it('loader scales classic units by the currency multiplier', () => {
    const p22 = myanmar.byId.p22;
    expect(
      p22?.type === 'property' && [p22.price, p22.rent[5], p22.houseCost, p22.mortgage],
    ).toEqual([400_000, 2_000_000, 200_000, 200_000]);
    expect(dubai.byId.t1).toMatchObject({ price: 200, mortgage: 100 });
    expect(myanmar.byId.tax_income).toMatchObject({ amount: 200_000 });
    expect(myanmar.cards.chance15?.effect).toEqual({ kind: 'pay_each', amount: 50_000 });
  });

  it('per-tile overrides replace the classic table', () => {
    const raw = clone(RAW_MAPS.dubai) as { tiles: Record<string, unknown>[] };
    raw.tiles[1] = { ...raw.tiles[1], price: 99 };
    expect(resolveMap(raw).byId.p01).toMatchObject({ price: 99 });
  });

  it('rejects a map with the wrong board layout or decks', () => {
    const cfg = parseMap(RAW_MAPS.dubai);
    const broken = clone(cfg);
    [broken.tiles[1], broken.tiles[3]] = [broken.tiles[3]!, broken.tiles[1]!];
    broken.decks.chance.cards = broken.decks.chance.cards.filter(
      (c) => c.effect.kind !== 'jail_free',
    );
    const card = broken.decks.chest.cards[0]!;
    card.effect = { kind: 'advance_to', tile: 'nowhere', collectGoIfPassed: true };
    const problems = validateMapConfig(broken);
    expect(problems.some((p) => p.includes('expected slot 1'))).toBe(true);
    expect(problems.some((p) => p.includes('chance deck: expected 16'))).toBe(true);
    expect(problems.some((p) => p.includes('Get Out of Jail Free'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown tile "nowhere"'))).toBe(true);
  });

  it('rejects schema errors (bad hex color, too few tokens)', () => {
    const raw = clone(RAW_MAPS.myanmar) as { theme: { primary: string }; tokens: unknown[] };
    raw.theme.primary = 'red';
    raw.tokens = raw.tokens.slice(0, 3);
    expect(() => resolveMap(raw)).toThrow(MapError);
  });
});

describe('formatMoney (spec 8.3)', () => {
  it('full form uses separators and the symbol position', () => {
    expect(formatMoney(dubai, 1500)).toBe('AED 1,500');
    expect(formatMoney(myanmar, 1_500_000)).toBe('1,500,000 Ks');
    expect(formatMoney(dubai, -50)).toBe('-AED 50');
  });

  it('compact form (board tiles) from compactFrom', () => {
    expect(formatMoney(dubai, 400, { compact: true })).toBe('AED 400');
    expect(formatMoney(dubai, 12_500, { compact: true })).toBe('AED 12.5K');
    expect(formatMoney(myanmar, 60_000, { compact: true })).toBe('60K Ks');
    expect(formatMoney(myanmar, 1_500_000, { compact: true })).toBe('1.5M Ks');
    expect(formatMoney(myanmar, 2_000_000, { compact: true })).toBe('2M Ks');
    expect(formatMoney(myanmar, 60_000, { compact: true, symbol: false })).toBe('60K');
    expect(formatMoney(dubai, 200, { compact: true, symbol: false })).toBe('200');
  });
});
