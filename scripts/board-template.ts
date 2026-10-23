// pnpm board:template - writes an editable SVG board for every map to docs/board-templates/.
// Generated from the map data, on the exact grid the game draws (apps/web/src/board/geometry.ts):
// 1200 x 1200, u = 100, corners 150 x 150, side tiles 100 x 150, GO bottom-right, clockwise.
// Each tile is drawn upright (100 x 150, color band on top) and rotated so its top faces the
// center, like the real board. Live values (dice, round, pot, timers) are left out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { formatMoney, resolveMap, type ResolvedMap, type ResolvedTile } from '@monopoli/engine';
import { MAP_IDS, RAW_MAPS } from '@monopoli/maps';

const U = 100;
const LETTER: Record<string, string> = {
  brown: 'B',
  lightblue: 'L',
  pink: 'P',
  orange: 'O',
  red: 'R',
  yellow: 'Y',
  green: 'G',
  darkblue: 'D',
};
const LIGHT = new Set(['yellow', 'lightblue']);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Same layout as geometry.ts tileRect, in pixels. */
function rect(i: number) {
  if (i % 10 === 0) {
    const [x, y] = { 0: [10.5, 10.5], 10: [0, 10.5], 20: [0, 0], 30: [10.5, 0] }[i] as number[];
    return { x: x! * U, y: y! * U, w: 1.5 * U, h: 1.5 * U, rotate: 0 };
  }
  if (i < 10) return { x: (10.5 - i) * U, y: 10.5 * U, w: U, h: 1.5 * U, rotate: 0 };
  if (i < 20) return { x: 0, y: (20.5 - i) * U, w: 1.5 * U, h: U, rotate: 90 };
  if (i < 30) return { x: (i - 19.5) * U, y: 0, w: U, h: 1.5 * U, rotate: 180 };
  return { x: 10.5 * U, y: (i - 29.5) * U, w: 1.5 * U, h: U, rotate: 270 };
}

/** Wrap a name into lines that fit `width` px; shrink the font for long single words. */
function wrap(name: string, width: number, size: number): { lines: string[]; size: number } {
  const words = name.split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));
  const fs = Math.max(10, Math.min(size, width / (longest * 0.6)));
  const perLine = Math.floor(width / (fs * 0.6));
  const lines: string[] = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + w).length <= perLine)
      lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return { lines, size: fs };
}

function textLines(lines: string[], cx: number, y: number, size: number, extra = '') {
  return lines
    .map(
      (l, k) =>
        `<text x="${cx}" y="${(y + k * size * 1.12).toFixed(1)}" text-anchor="middle" font-size="${size.toFixed(1)}" font-weight="700"${extra}>${esc(l)}</text>`,
    )
    .join('');
}

// Simple one-color icons, drawn in a 24 x 24 box.
const ICON = {
  train:
    'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-.5 3v4h11V6zM8 13.5a1.5 1.5 0 1 0 0 .01zm8 0a1.5 1.5 0 1 0 0 .01zM6 21l2.5-3h1.8L8 21zm12 0-2.5-3h-1.8L16 21z',
  boat: 'M11 2h2v9l6 1.5-6-.2zM3 14h18l-3 6H6zM11 3 5 12h6z',
  plane:
    'M11 2.5a1 1 0 0 1 2 0V9l8 5v2l-8-2.5V18l2.5 2v1.5L12 20.5l-3.5 1V20l2.5-2v-4.5L3 16v-2l8-5z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  drop: 'M12 2c4 5 7 9 7 12.5a7 7 0 0 1-14 0C5 11 8 7 12 2z',
  cup: 'M3 19h16v2H3zm1-10h12l-1.5 9h-9zM6.5 3h1.5v4H6.5zm3.5 1h1.5v3H10zM17 10h2.5a2.5 2.5 0 0 1 0 5H16v-1.6h3.5a.9.9 0 0 0 0-1.8H17z',
  chest:
    'M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3zm0 3h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm7.5 0v3h3v-3z',
};
const transportIcon = (emoji: string) =>
  /[⛴🚤⛵🛥]/u.test(emoji) ? ICON.boat : /✈/u.test(emoji) ? ICON.plane : ICON.train;

function icon(d: string, cx: number, cy: number, size: number, color: string) {
  const k = size / 24;
  return `<path d="${d}" fill="${color}" fill-rule="evenodd" transform="translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${k.toFixed(3)})"/>`;
}

/** Tile content in its own upright 100 x 150 box (band side = top = toward the center). */
function tileContent(map: ResolvedMap, t: ResolvedTile): string {
  const th = map.theme;
  const ink = th.text;
  const money = (n: number) => formatMoney(map, n, { compact: true });
  const cx = 50;
  switch (t.type) {
    case 'property': {
      const band = th.groupColors[t.group];
      const name = wrap(t.name, 88, 14);
      return (
        `<rect class="band" x="0" y="0" width="100" height="26" fill="${band}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>` +
        `<text x="7" y="19" font-size="13" font-weight="900" fill="${LIGHT.has(t.group) ? ink : '#fff'}" opacity="0.85">${LETTER[t.group]}</text>` +
        textLines(name.lines, cx, 50, name.size) +
        `<text x="${cx}" y="138" text-anchor="middle" font-size="15" font-weight="800">${esc(money(t.price))}</text>`
      );
    }
    case 'transport': {
      const name = wrap(t.name, 90, 13);
      return (
        icon(transportIcon(t.icon), cx, 30, 34, th.primary) +
        textLines(name.lines, cx, 66, name.size) +
        `<text x="${cx}" y="138" text-anchor="middle" font-size="15" font-weight="800">${esc(money(t.price))}</text>`
      );
    }
    case 'utility':
      return (
        icon(t.icon === 'water' ? ICON.drop : ICON.bolt, cx, 34, 38, th.secondary) +
        textLines(wrap(t.name, 90, 14).lines, cx, 76, 14) +
        `<text x="${cx}" y="138" text-anchor="middle" font-size="15" font-weight="800">${esc(money(t.price))}</text>`
      );
    case 'tax': {
      const name = wrap(t.name, 90, 14);
      return (
        `<circle cx="${cx}" cy="32" r="17" fill="${th.accent}" stroke="${ink}" stroke-opacity=".35" stroke-width="2"/>` +
        `<text x="${cx}" y="38" text-anchor="middle" font-size="${map.currency.symbol.length > 2 ? 10 : 15}" font-weight="900">${esc(map.currency.symbol)}</text>` +
        textLines(name.lines, cx, 72, name.size) +
        `<text x="${cx}" y="138" text-anchor="middle" font-size="14" font-weight="800">PAY ${esc(money(t.amount))}</text>`
      );
    }
    case 'card':
      return t.deck === 'chance'
        ? `<text x="${cx}" y="88" text-anchor="middle" font-size="64" font-weight="900" fill="${th.accent}">?</text>` +
            `<text x="${cx}" y="136" text-anchor="middle" font-size="14" font-weight="800">CHANCE</text>`
        : icon(ICON.chest, cx, 62, 46, th.secondary) +
            textLines(['COMMUNITY', 'CHEST'], cx, 122, 13);
    default:
      return '';
  }
}

function corner(map: ResolvedMap, t: ResolvedTile, x: number, y: number): string {
  const th = map.theme;
  const c = (dx: number, dy: number) => `${x + dx} ${y + dy}`;
  const big = (txt: string, dx: number, dy: number, rot: number, size: number) =>
    `<text x="${x + dx}" y="${y + dy}" transform="rotate(${rot} ${c(dx, dy)})" text-anchor="middle" font-size="${size}" font-weight="900" fill="${th.primary}">${txt}</text>`;
  const goPay = formatMoney(map, 200 * map.m, { compact: true });
  switch (t.type) {
    case 'go':
      return (
        big('GO', 80, 82, -45, 52) +
        `<text x="${x + 75}" y="${y + 136}" text-anchor="middle" font-size="13" font-weight="700">COLLECT ${esc(goPay)}</text>` +
        `<path d="M${c(118, 112)}h-48m0 0 12-9m-12 9 12 9" stroke="${th.primary}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    case 'jail':
      // Barred cell in the top-right (toward the board), "Just visiting" along the outer edges.
      return (
        `<rect x="${x + 50}" y="${y}" width="100" height="100" fill="#F5C99B" stroke="${th.primary}" stroke-width="3"/>` +
        [62, 80, 98, 116, 134]
          .map(
            (dx) =>
              `<rect x="${x + dx}" y="${y + 6}" width="5" height="88" fill="${th.primary}" opacity=".75"/>`,
          )
          .join('') +
        big('JAIL', 100, 60, -45, 22).replace(
          `fill="${th.primary}"`,
          'fill="#fff" stroke="' + th.primary + '" stroke-width="5" paint-order="stroke"',
        ) +
        `<text x="${x + 30}" y="${y + 52}" transform="rotate(-90 ${c(30, 52)})" text-anchor="middle" font-size="15" font-weight="800">JUST</text>` +
        `<text x="${x + 98}" y="${y + 135}" text-anchor="middle" font-size="15" font-weight="800">VISITING</text>`
      );
    case 'free_parking': {
      const name = wrap(t.name, 110, 18);
      return (
        icon(ICON.cup, x + 75, y + 62, 46, th.primary) +
        big('FREE PARKING', 75, 26, 0, 14) +
        textLines(name.lines, x + 75, y + 112, name.size)
      );
    }
    default: // go_to_jail
      return (
        big('GO TO', 75, 30, 0, 18) +
        `<g transform="translate(${x + 52} ${y + 44}) scale(2)">` +
        `<circle cx="12" cy="6" r="4.5" fill="${th.primary}"/><path d="M5 23v-6a7 7 0 0 1 14 0v6z" fill="${th.primary}"/>` +
        `<rect x="6" y="1.5" width="12" height="3" rx="1" fill="${th.accent}"/></g>` +
        big('JAIL', 75, 138, 0, 22)
      );
  }
}

function boardSvg(map: ResolvedMap): string {
  const th = map.theme;
  const tiles = map.tiles
    .map((t) => {
      const r = rect(t.index);
      const label = `${String(t.index).padStart(2, '0')}`;
      const attrs = `id="tile-${label}" data-index="${t.index}" data-tile-id="${t.id}" data-type="${t.type === 'card' ? t.deck : t.type}" data-name="${esc(t.name)}"`;
      const bg = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${th.tileBg}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>`;
      if (t.index % 10 === 0) return `<g ${attrs}>${bg}${corner(map, t, r.x, r.y)}</g>`;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      return `<g ${attrs}>${bg}<g transform="translate(${cx} ${cy}) rotate(${r.rotate}) translate(-50 -75)">${tileContent(map, t)}</g></g>`;
    })
    .join('\n');

  const deck = (
    label: string[],
    color: string,
    fill: string,
    x: number,
    y: number,
    rot: number,
    mark: string,
  ) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})">` +
    `<rect x="-95" y="-62" width="190" height="124" rx="14" fill="${fill}" stroke="${color}" stroke-width="5"/>` +
    `<rect x="-84" y="-51" width="168" height="102" rx="10" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 5"/>` +
    textLines(label, 0, label.length > 1 ? -18 : -10, 20, ` fill="${color}"`) +
    mark +
    `</g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200" role="img" aria-label="${esc(map.name)} board">
<title>Monopoli board: ${esc(map.name)}</title>
<desc>Generated by pnpm board:template from the map data. Grid: u = 100, corners 150, GO bottom-right, play clockwise. Tile groups: id tile-NN = board index NN.</desc>
<style>text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }</style>
<g id="board" fill="${th.text}">
<rect id="board-bg" x="0" y="0" width="1200" height="1200" fill="${th.boardBg}"/>
<g id="center">
<rect x="165" y="165" width="870" height="870" rx="16" fill="none" stroke="${th.primary}" stroke-opacity=".25" stroke-width="3"/>
<g id="title-plaque">
<rect x="360" y="470" width="480" height="170" rx="20" fill="${th.primary}" stroke="${th.accent}" stroke-width="9"/>
<rect x="378" y="488" width="444" height="134" rx="14" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2"/>
<text x="600" y="530" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">မိုနိုပိုလီ</text>
<text x="600" y="578" text-anchor="middle" font-size="44" font-weight="900" fill="#fff" letter-spacing="3">MONOPOLI</text>
<text x="600" y="618" text-anchor="middle" font-size="28" font-weight="800" fill="${th.accent}" letter-spacing="6">${esc(map.name.toUpperCase())}</text>
</g>
<g id="deck-chance">${deck(['CHANCE'], th.primary, '#FFF1EC', 380, 330, -14, `<text x="0" y="46" text-anchor="middle" font-size="54" font-weight="900" fill="${th.accent}">?</text>`)}</g>
<g id="deck-chest">${deck(['COMMUNITY', 'CHEST'], th.secondary, '#EEF9F3', 820, 330, 12, icon(ICON.chest, 0, 30, 40, th.secondary))}</g>
<g id="dice-area"><rect x="470" y="700" width="260" height="150" rx="20" fill="#fff" fill-opacity=".35" stroke="${th.primary}" stroke-opacity=".15" stroke-dasharray="8 6"/></g>
</g>
<g id="tiles">
${tiles}
</g>
</g>
</svg>
`;
}

const out = new URL('../docs/board-templates/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const id of MAP_IDS) {
  const map = resolveMap(RAW_MAPS[id]);
  writeFileSync(new URL(`board-${id}.svg`, out), boardSvg(map));
  console.log(`✓ docs/board-templates/board-${id}.svg`);
}
