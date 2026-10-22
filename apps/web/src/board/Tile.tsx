import { GroupMark } from './GroupMark';
import {
  formatMoney,
  type PropertyState,
  type ResolvedMap,
  type ResolvedTile,
} from '@monopoli/engine';
import { memo, type CSSProperties } from 'react';
import { tileRect } from './geometry';

const ICONS: Record<string, string> = {
  electricity: '⚡',
  water: '💧',
  tax: '💰',
  chance: '?',
  chest: '🎁',
};

interface Props {
  map: ResolvedMap;
  tile: ResolvedTile;
  prop: PropertyState | undefined;
  ownerColor: string | null;
  u: number;
  highlight: boolean;
  goAmount: number;
}

function Corner({
  tile,
  map,
  u,
  goAmount,
}: {
  tile: ResolvedTile;
  map: ResolvedMap;
  u: number;
  goAmount: number;
}) {
  const big = { fontSize: Math.max(10, u * 0.42) };
  const small = { fontSize: Math.max(8, u * 0.2) };
  switch (tile.type) {
    case 'go':
      return (
        <>
          <div className="font-black text-primary" style={big}>
            GO
          </div>
          <div style={small} className="leading-tight">
            Collect {formatMoney(map, goAmount, { compact: true })}
          </div>
          <div className="text-primary" style={{ fontSize: u * 0.4 }}>
            ←
          </div>
        </>
      );
    case 'jail':
      return (
        <div className="relative h-full w-full">
          <div
            className="absolute top-0 right-0 flex items-center justify-center bg-orange-200 font-bold"
            style={{
              width: u * 1.05,
              height: u * 1.05,
              fontSize: Math.max(8, u * 0.22),
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 22%, rgba(0,0,0,.35) 22% 27%)',
            }}
          >
            JAIL
          </div>
          <div className="absolute bottom-0 left-0 leading-none opacity-70" style={small}>
            Just visiting
          </div>
        </div>
      );
    case 'free_parking':
      return (
        <>
          <div style={{ fontSize: u * 0.55 }}>{map.id === 'myanmar' ? '🍵' : '🏝️'}</div>
          <div className="leading-tight font-semibold" style={small}>
            {tile.name}
          </div>
        </>
      );
    default:
      return (
        <>
          <div style={{ fontSize: u * 0.55 }}>👮</div>
          <div className="leading-tight font-semibold" style={small}>
            {tile.name}
          </div>
        </>
      );
  }
}

function TileImpl({ map, tile, prop, ownerColor, u, highlight, goAmount }: Props) {
  const r = tileRect(tile.index);
  const text = Math.max(8, Math.min(14, u * 0.26));
  // Shrink long single words so they fit the tile width (never below 8px, spec 12.3).
  const longest = Math.max(...tile.name.split(/\s+/).map((w) => w.length));
  const nameSize = Math.max(8, Math.min(text, (u * 0.92) / (longest * 0.56)));
  const outer: CSSProperties = {
    left: r.x * u,
    top: r.y * u,
    width: r.w * u,
    height: r.h * u,
  };
  const ring = highlight ? 'z-10 ring-2 ring-accent ring-offset-1' : '';

  if (r.corner) {
    return (
      <div
        data-tile={tile.id}
        className={`absolute flex flex-col items-center justify-center overflow-hidden border border-black/25 bg-tile text-center ${ring}`}
        style={outer}
      >
        <Corner tile={tile} map={map} u={u} goAmount={goAmount} />
      </div>
    );
  }

  // Portrait content (u x 1.5u) rotated so its top faces the board center.
  const inner: CSSProperties = {
    width: u,
    height: 1.5 * u,
    left: (r.w * u - u) / 2,
    top: (r.h * u - 1.5 * u) / 2,
    transform: `rotate(${r.rotate}deg)`,
  };
  const price = 'price' in tile ? tile.price : tile.type === 'tax' ? tile.amount : null;
  const icon =
    tile.type === 'transport'
      ? tile.icon
      : tile.type === 'utility'
        ? ICONS[tile.icon]
        : tile.type === 'tax'
          ? ICONS.tax
          : tile.type === 'card'
            ? ICONS[tile.deck]
            : null;

  return (
    <div
      data-tile={tile.id}
      className={`absolute overflow-hidden border border-black/25 bg-tile ${ring}`}
      style={outer}
    >
      <div
        className={`absolute flex flex-col items-center text-center leading-[1.05] ${prop?.mortgaged ? 'opacity-45' : ''}`}
        style={inner}
      >
        {tile.type === 'property' ? (
          <div
            className="relative flex w-full shrink-0 items-center justify-center gap-[1px] border-b border-black/30"
            style={{ height: 0.32 * u, background: `var(--g-${tile.group})` }}
          >
            <GroupMark
              group={tile.group}
              className="absolute top-1/2 left-[3%] -translate-y-1/2 leading-none"
              style={{ fontSize: u * 0.22 }}
            />
            {prop && prop.buildings > 0 && prop.buildings < 5
              ? Array.from({ length: prop.buildings }, (_, i) => (
                  <span
                    key={i}
                    className="inline-block bg-green-700"
                    style={{ width: u * 0.15, height: u * 0.15 }}
                  />
                ))
              : null}
            {prop?.buildings === 5 && (
              <span
                className="inline-block bg-red-700"
                style={{ width: u * 0.35, height: u * 0.18 }}
              />
            )}
          </div>
        ) : (
          <div
            className={`shrink-0 ${tile.type === 'card' && tile.deck === 'chance' ? 'font-black text-accent' : ''}`}
            style={{ fontSize: u * 0.42, lineHeight: 1.1, marginTop: u * 0.06 }}
          >
            {icon}
          </div>
        )}
        <div
          className="min-h-0 w-full flex-1 overflow-hidden px-[1px] font-medium break-words hyphens-auto"
          style={{ fontSize: nameSize, marginTop: u * 0.04 }}
        >
          {tile.name}
        </div>
        {price !== null && (
          <div
            className="tabular mb-[2px] shrink-0 font-semibold whitespace-nowrap"
            style={{ fontSize: text * 0.92 }}
          >
            {formatMoney(map, price, { compact: true, symbol: false })}
          </div>
        )}
        {ownerColor && (
          <div
            className="absolute right-0 bottom-0 left-0"
            style={{ height: u * 0.12, background: ownerColor }}
          />
        )}
      </div>
      {prop?.mortgaged && (
        <div
          className="absolute top-0 right-0 bg-black/75 px-[2px] font-bold text-white"
          style={{ fontSize: Math.max(8, u * 0.22) }}
        >
          M
        </div>
      )}
    </div>
  );
}

export const Tile = memo(TileImpl);
