import { GroupMark } from './GroupMark';
import {
  formatMoney,
  type PropertyState,
  type ResolvedMap,
  type ResolvedTile,
} from '@monopoli/engine';
import { memo, type CSSProperties } from 'react';
import { BoardIcon } from './BoardIcon';
import { tileRect } from './geometry';
import { transportIcon } from './iconPaths';

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
  const small = { fontSize: Math.max(8, u * 0.17) };
  const label = (text: string, size: number, extra: CSSProperties = {}) => (
    <div
      className="leading-none font-black whitespace-nowrap text-primary"
      style={{ fontSize: Math.max(8, u * size), ...extra }}
    >
      {text}
    </div>
  );
  switch (tile.type) {
    case 'go':
      return (
        <div className="relative h-full w-full">
          <div className="absolute" style={{ left: u * 0.3, top: u * 0.28 }}>
            {label('GO', 0.5, { transform: 'rotate(-45deg)' })}
          </div>
          <div
            className="absolute left-0 w-full text-center leading-none font-bold"
            style={{ ...small, bottom: u * 0.08 }}
          >
            COLLECT {formatMoney(map, goAmount, { compact: true })}
          </div>
          <svg
            aria-hidden
            className="absolute"
            viewBox="0 0 60 24"
            style={{ width: u * 0.6, left: u * 0.7, top: u * 0.95 }}
          >
            <path
              d="M56 12H6m0 0 12-9M6 12l12 9"
              stroke="var(--m-primary)"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );
    case 'jail':
      // Barred cell toward the board (top-right); "Just visiting" along the outer edges.
      return (
        <div className="relative h-full w-full">
          <div
            className="absolute top-0 right-0 flex items-center justify-center overflow-hidden border-2 border-primary bg-[#F5C99B]"
            style={{
              width: u,
              height: u,
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 13%, color-mix(in srgb, var(--m-primary) 75%, transparent) 13% 18%)',
            }}
          >
            <span
              className="font-black text-white"
              style={{
                fontSize: Math.max(8, u * 0.22),
                transform: 'rotate(-45deg)',
                WebkitTextStroke: `${Math.max(1, u * 0.04)}px var(--m-primary)`,
                paintOrder: 'stroke',
              }}
            >
              JAIL
            </span>
          </div>
          <div
            className="absolute leading-none font-extrabold"
            style={{
              ...small,
              left: u * 0.06,
              top: u * 1.12,
              transform: 'rotate(-90deg)',
              transformOrigin: 'left top',
            }}
          >
            JUST
          </div>
          <div
            className="absolute leading-none font-extrabold tracking-tighter"
            style={{ ...small, right: u * 0.03, bottom: u * 0.08 }}
          >
            VISITING
          </div>
        </div>
      );
    case 'free_parking':
      return (
        <>
          {label('FREE', 0.14)}
          {label('PARKING', 0.14, { marginTop: u * 0.02 })}
          {/* The cup only when the name fits on one line (corners are small). */}
          {!/\s/.test(tile.name) ? (
            <div style={{ margin: `${u * 0.04}px 0` }}>
              <BoardIcon name="cup" size={u * 0.4} color="var(--m-primary)" />
            </div>
          ) : (
            <div style={{ height: u * 0.06 }} />
          )}
          <div className="leading-tight font-semibold" style={small}>
            {tile.name}
          </div>
        </>
      );
    default:
      return (
        <>
          {label('GO TO', 0.17)}
          <div style={{ margin: `${u * 0.06}px 0` }}>
            <BoardIcon name="officer" size={u * 0.55} color="var(--m-primary)" />
          </div>
          {label('JAIL', 0.24)}
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
  const iconSize = u * 0.42;
  const icon =
    tile.type === 'transport' ? (
      <BoardIcon name={transportIcon(tile.icon)} size={iconSize} color="var(--m-primary)" />
    ) : tile.type === 'utility' ? (
      <BoardIcon
        name={tile.icon === 'water' ? 'drop' : 'bolt'}
        size={iconSize}
        color="var(--m-secondary)"
      />
    ) : tile.type === 'tax' ? (
      <span
        className="flex items-center justify-center rounded-full border border-black/30 bg-accent font-black"
        style={{
          width: iconSize,
          height: iconSize,
          fontSize: Math.max(7, u * (map.currency.symbol.length > 2 ? 0.12 : 0.17)),
        }}
      >
        {map.currency.symbol}
      </span>
    ) : null;

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
        ) : tile.type === 'card' ? (
          // Chance / Community Chest: the big icon says it all (the name is for screen readers).
          <div className="flex w-full flex-1 items-center justify-center">
            {tile.deck === 'chance' ? (
              <span className="leading-none font-black text-accent" style={{ fontSize: u * 0.75 }}>
                ?
              </span>
            ) : (
              <BoardIcon name="chest" size={u * 0.62} color="var(--m-secondary)" />
            )}
            <span className="sr-only">{tile.name}</span>
          </div>
        ) : (
          <div className="flex shrink-0 justify-center" style={{ marginTop: u * 0.1 }}>
            {icon}
          </div>
        )}
        {tile.type !== 'card' && (
          <div
            className="min-h-0 w-full flex-1 overflow-hidden px-[1px] font-medium break-words hyphens-auto"
            style={{ fontSize: nameSize, marginTop: u * 0.04 }}
          >
            {tile.name}
          </div>
        )}
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
