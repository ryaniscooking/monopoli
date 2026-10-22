import type { ResolvedCard, ResolvedMap, RuleSettings } from './types';

function trimDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

/**
 * The single money formatter for all UI text (spec 8.3).
 * Full form: "AED 1,500" / "1,500,000 Ks". Compact (board tiles): "AED 60" / "60K Ks" / "1.5M Ks".
 */
export function formatMoney(
  map: Pick<ResolvedMap, 'currency'>,
  amount: number,
  opts: { compact?: boolean } = {},
): string {
  const { symbol, symbolPosition, compactFrom, locale } = map.currency;
  const abs = Math.abs(amount);
  let body: string;
  if (opts.compact && abs >= compactFrom) {
    body =
      abs >= 1_000_000 ? `${trimDecimal(abs / 1_000_000, 2)}M` : `${trimDecimal(abs / 1_000, 1)}K`;
  } else {
    body = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(abs);
  }
  const sign = amount < 0 ? '-' : '';
  return symbolPosition === 'prefix' ? `${sign}${symbol} ${body}` : `${sign}${body} ${symbol}`;
}

/** Card text with {amount} {goAmount} {perHouse} {perHotel} filled in. */
export function cardText(map: ResolvedMap, card: ResolvedCard, settings: RuleSettings): string {
  const e = card.effect;
  const values: Record<string, number | undefined> = {
    goAmount: settings.goSalary * map.m,
    amount: 'amount' in e ? e.amount : undefined,
    perHouse: e.kind === 'repairs' ? e.perHouse : undefined,
    perHotel: e.kind === 'repairs' ? e.perHotel : undefined,
  };
  return card.text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = values[key];
    return v === undefined ? whole : formatMoney(map, v);
  });
}
