// One-color board icons as SVG path data in a 24 x 24 box. Shared by the live board (BoardIcon)
// and the SVG board templates (scripts/board-template.ts) so both always match.
export const ICON_PATHS = {
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
  officer: 'M12 7.5a4.5 4.5 0 1 1 0 .01zM5 23v-6a7 7 0 0 1 14 0v6zM6 1.5h12v3H6z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Transport tiles carry an emoji in the map data; draw the matching vector icon. */
export function transportIcon(emoji: string): IconName {
  if (/[⛴🚤⛵🛥🚢]/u.test(emoji)) return 'boat';
  if (/[✈🛩🛫]/u.test(emoji)) return 'plane';
  return 'train';
}
