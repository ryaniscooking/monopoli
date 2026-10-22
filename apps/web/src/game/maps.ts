import { resolveMap, type ResolvedMap } from '@monopoli/engine';
import { MAP_IDS, RAW_MAPS } from '@monopoli/maps';

/** Every registered map, validated and scaled once at startup. */
export const MAPS: Readonly<Record<string, ResolvedMap>> = Object.fromEntries(
  MAP_IDS.map((id) => [id, resolveMap(RAW_MAPS[id])]),
);

export const DEFAULT_MAP_ID = 'myanmar';

export function getMap(id: string): ResolvedMap {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map ${id}`);
  return map;
}

/** Apply a map's theme as CSS variables (spec 12.5): switching maps re-themes the whole UI. */
export function applyTheme(map: ResolvedMap): void {
  const root = document.documentElement.style;
  const t = map.theme;
  root.setProperty('--m-primary', t.primary);
  root.setProperty('--m-secondary', t.secondary);
  root.setProperty('--m-accent', t.accent);
  root.setProperty('--m-board', t.boardBg);
  root.setProperty('--m-tile', t.tileBg);
  root.setProperty('--m-text', t.text);
  for (const [group, color] of Object.entries(t.groupColors)) {
    root.setProperty(`--g-${group}`, color);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.primary);
}
