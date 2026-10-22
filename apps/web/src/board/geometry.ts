// Board geometry in units of u = side / 12 (9 tiles + two 1.5u corners per side, spec 12.3).
// Index 0 (GO) is bottom-right; play runs clockwise: bottom row leftwards, up the left side,
// along the top, down the right side.

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation of the tile's portrait content so its color band faces the board center. */
  rotate: 0 | 90 | 180 | 270;
  corner: boolean;
}

export function tileRect(i: number): TileRect {
  if (i % 10 === 0) {
    const pos = { 0: [10.5, 10.5], 10: [0, 10.5], 20: [0, 0], 30: [10.5, 0] }[i] as [
      number,
      number,
    ];
    return { x: pos[0], y: pos[1], w: 1.5, h: 1.5, rotate: 0, corner: true };
  }
  if (i < 10) return { x: 10.5 - i, y: 10.5, w: 1, h: 1.5, rotate: 0, corner: false };
  if (i < 20) return { x: 0, y: 20.5 - i, w: 1.5, h: 1, rotate: 90, corner: false };
  if (i < 30) return { x: i - 19.5, y: 0, w: 1, h: 1.5, rotate: 180, corner: false };
  return { x: 10.5, y: i - 29.5, w: 1.5, h: 1, rotate: 270, corner: false };
}

/** Where a token sits (in u), spreading several tokens on the same spot. */
export function tokenSpot(
  index: number,
  inJail: boolean,
  slot: number,
  count: number,
): { x: number; y: number } {
  const r = tileRect(index);
  let cx = r.x + r.w / 2;
  let cy = r.y + r.h / 2;
  if (index === 10) {
    // Jail corner: prisoners inside the cell (top-right), visitors along the outer edges.
    cx = inJail ? 0.95 : 0.4;
    cy = inJail ? 11.05 : 11.55;
  }
  if (count <= 1) return { x: cx, y: cy };
  const cols = Math.min(3, count);
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  const rows = Math.ceil(count / cols);
  const step = 0.3;
  return { x: cx + (col - (cols - 1) / 2) * step, y: cy + (row - (rows - 1) / 2) * step };
}
