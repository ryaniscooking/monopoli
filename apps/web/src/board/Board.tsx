import { useGesture } from '@use-gesture/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@monopoli/engine';
import { useNow } from '../components/useNow';
import { useTable } from '../game/table';
import { en } from '../strings/en';
import { useUi } from '../store/ui';
import { Dice } from './Dice';
import { tileRect, tokenSpot } from './geometry';
import { Tile } from './Tile';

interface Camera {
  s: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Square board with tap-to-zoom, pinch (1x-3x), drag to pan and double-tap to reset
 * (spec 12.4). Works while other players take their turns.
 */
export function Board() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const pos = useTable((s) => s.pos);
  const landed = useTable((s) => s.landed);
  const dice = useTable((s) => s.dice);
  const rolling = useTable((s) => s.rolling);
  const card = useTable((s) => s.card);
  const selectTile = useUi((s) => s.selectTile);
  const selected = useUi((s) => s.selectedTile);

  const box = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);
  const [cam, setCam] = useState<Camera>({ s: 1, x: 0, y: 0 });
  const [smooth, setSmooth] = useState(false);
  const camRef = useRef(cam);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);
  const lastTap = useRef(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSide(Math.floor(Math.min(width, height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = (c: Camera): Camera => {
    const min = side - side * c.s;
    return { s: c.s, x: clamp(c.x, min, 0), y: clamp(c.y, min, 0) };
  };

  // Deselecting (closing the deed, double-tap) zooms back out.
  useEffect(
    () =>
      useUi.subscribe((now, before) => {
        if (before.selectedTile !== null && now.selectedTile === null) {
          setSmooth(true);
          setCam({ s: 1, x: 0, y: 0 });
        }
      }),
    [],
  );

  const u = side / 12;

  const focus = (tileId: string) => {
    const t = map?.byId[tileId];
    if (!t) return;
    const r = tileRect(t.index);
    const s = 2.2;
    const cx = (r.x + r.w / 2) * u;
    const cy = (r.y + r.h / 2) * u;
    setSmooth(true);
    setCam(fit({ s, x: side / 2 - cx * s, y: side / 2 - cy * s }));
    selectTile(tileId);
  };

  useGesture(
    {
      onDrag: ({ delta: [dx, dy], pinching, tap, event, cancel }) => {
        if (tap) {
          const now = performance.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            selectTile(null); // double-tap: free view
            return;
          }
          lastTap.current = now;
          const el = (event.target as HTMLElement | null)?.closest('[data-tile]');
          const id = el?.getAttribute('data-tile');
          if (id) focus(id);
          return;
        }
        if (pinching) return cancel();
        setSmooth(false);
        setCam((c) => fit({ ...c, x: c.x + dx, y: c.y + dy }));
      },
      onPinch: ({ origin: [ox, oy], offset: [scale] }) => {
        const rect = viewport.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ox - rect.left;
        const py = oy - rect.top;
        setSmooth(false);
        setCam((c) => {
          const s = clamp(scale, 1, 3);
          const k = s / c.s;
          return fit({ s, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
        });
      },
    },
    {
      target: viewport,
      eventOptions: { passive: false },
      drag: { filterTaps: true, pointer: { touch: true } },
      pinch: { scaleBounds: { min: 1, max: 3 }, from: () => [camRef.current.s, 0] },
    },
  );

  const owners = useMemo(() => {
    const colors: Record<string, string | null> = {};
    if (!view) return colors;
    for (const [id, prop] of Object.entries(view.properties)) {
      colors[id] = prop.owner
        ? (view.players.find((p) => p.id === prop.owner)?.color ?? null)
        : null;
    }
    return colors;
  }, [view]);

  if (!map || !view) return <div ref={box} className="h-full w-full" />;

  // Group tokens by spot so several players on one tile spread out.
  const alive = view.players.filter((p) => !p.bankrupt);
  const spotKey = (p: (typeof alive)[number]) =>
    `${pos[p.id] ?? p.position}:${p.inJail ? 'j' : 'v'}`;
  const counts = new Map<string, number>();
  for (const p of alive) counts.set(spotKey(p), (counts.get(spotKey(p)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const goAmount = view.settings.goSalary * map.m;
  const tokenSize = u * 0.55;

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div
        ref={viewport}
        data-testid="board"
        className="relative overflow-hidden rounded-lg shadow-md"
        style={{ width: side, height: side, touchAction: 'none' }}
      >
        <div
          className="absolute top-0 left-0 bg-board"
          style={{
            width: side,
            height: side,
            transformOrigin: '0 0',
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`,
            transition: smooth ? 'transform 300ms ease-out' : undefined,
          }}
        >
          {map.tiles.map((t) => (
            <Tile
              key={t.id}
              map={map}
              tile={t}
              prop={view.properties[t.id]}
              ownerColor={owners[t.id] ?? null}
              u={u}
              highlight={landed === t.index || selected === t.id}
              goAmount={goAmount}
            />
          ))}

          {/* Board center: title, dice, decks */}
          <div
            className="absolute flex flex-col items-center justify-center gap-[3%] text-center"
            style={{ left: 1.5 * u, top: 1.5 * u, width: 9 * u, height: 9 * u }}
          >
            <div className="font-black tracking-wide text-primary" style={{ fontSize: u * 0.7 }}>
              {map.name.toUpperCase()}
            </div>
            <Dice dice={dice} rolling={rolling} size={u * 1.15} />
            <div className="flex gap-[6%]" style={{ fontSize: Math.max(8, u * 0.24) }}>
              {(['chance', 'chest'] as const).map((d) => (
                <div
                  key={d}
                  className="rounded-md border-2 border-dashed border-black/25 px-2 py-1 font-semibold opacity-80"
                >
                  {map.decks[d].name}
                </div>
              ))}
            </div>
            <div className="opacity-60" style={{ fontSize: Math.max(8, u * 0.24) }}>
              Round {view.round}
              {view.settings.freeParkingPot && (
                <> · {en.game.pot(formatMoney(map, view.parkingPot))}</>
              )}
            </div>
            <TimeLeft
              endsAt={view.endsAt}
              lastRound={view.lastRoundPending}
              size={Math.max(8, u * 0.26)}
            />
          </div>

          {alive.map((p) => {
            const key = spotKey(p);
            const slot = seen.get(key) ?? 0;
            seen.set(key, slot + 1);
            const spot = tokenSpot(pos[p.id] ?? p.position, p.inJail, slot, counts.get(key) ?? 1);
            const token = map.tokens.find((t) => t.id === p.token);
            const current = p.id === view.current;
            return (
              <motion.div
                key={p.id}
                data-testid={`token-${p.id}`}
                className={`absolute flex items-center justify-center rounded-full bg-white ${current ? 'z-20' : 'z-10'}`}
                style={{
                  width: tokenSize,
                  height: tokenSize,
                  marginLeft: -tokenSize / 2,
                  marginTop: -tokenSize / 2,
                  border: `${Math.max(2, u * 0.07)}px solid ${p.color}`,
                  fontSize: tokenSize * 0.58,
                  boxShadow: current ? `0 0 0 2px var(--m-accent)` : undefined,
                }}
                initial={false}
                animate={{ left: spot.x * u, top: spot.y * u, scale: current ? 1.12 : 1 }}
                transition={{ duration: 0.13, ease: 'easeOut' }}
              >
                {token?.icon ?? '●'}
              </motion.div>
            );
          })}
        </div>

        {/* Card draw reveal (spec 12.6) */}
        <AnimatePresence>
          {card && (
            <motion.div
              data-testid="card-reveal"
              className="absolute inset-0 z-30 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-[62%] rounded-xl border-4 border-accent bg-white p-3 text-center text-ink shadow-xl"
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="mb-1 text-xs font-bold tracking-wide text-primary uppercase">
                  {card.deckName}
                </div>
                <div className="text-sm leading-snug">{card.text}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TimeLeft({
  endsAt,
  lastRound,
  size,
}: {
  endsAt: number | null;
  lastRound: boolean;
  size: number;
}) {
  const now = useNow(1000);
  if (endsAt === null) return null;
  const left = Math.max(0, endsAt - now);
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  return (
    <div
      className={`font-semibold ${lastRound || left === 0 ? 'text-red-700' : 'opacity-70'}`}
      style={{ fontSize: size }}
    >
      {lastRound || left === 0 ? en.game.lastRound : en.game.timeLeft(`${mm}:${ss}`)}
    </div>
  );
}
