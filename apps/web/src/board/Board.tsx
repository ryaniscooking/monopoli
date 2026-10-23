import { useGesture } from '@use-gesture/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@monopoli/engine';
import { useNow } from '../components/useNow';
import { useTable } from '../game/table';
import { en } from '../strings/en';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { BoardIcon } from './BoardIcon';
import { Dice } from './Dice';
import { tileRect, tokenSpot } from './geometry';
import { Tile } from './Tile';
import { TokenIcon } from '../components/TokenIcon';

interface Camera {
  s: number;
  x: number;
  y: number;
}

/** How far the board leans back in the 3D table view. */
const TILT_DEG = 22;
const TILT_SCALE = 0.91;

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
  const floats = useTable((s) => s.floats);
  const reduced = useSettings((st) => st.reducedMotion);
  const tiltSetting = useSettings((st) => st.boardTilt);
  const selectTile = useUi((s) => s.selectTile);
  const selected = useUi((s) => s.selectedTile);

  const box = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);
  /** The board's whole column (the zoomed board may fill all of it). */
  const [area, setArea] = useState({ w: 0, h: 0 });
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
      setArea({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The square board sits centered in its column. Zoomed in, it may be dragged anywhere until
  // its edge reaches the middle of the column, so any tile (corners too) can be centered.
  const offX = (area.w - side) / 2;
  const offY = (area.h - side) / 2;
  const fit = (c: Camera): Camera => {
    if (c.s <= 1.001) return { s: 1, x: 0, y: 0 };
    const midX = area.w / 2 - offX;
    const midY = area.h / 2 - offY;
    return {
      s: c.s,
      x: clamp(c.x, midX - side * c.s, midX),
      y: clamp(c.y, midY - side * c.s, midY),
    };
  };
  /** Camera that puts board point (bx, by) (in px at scale 1) in the middle of the column. */
  const centerOn = (bx: number, by: number, s: number): Camera =>
    fit({ s, x: area.w / 2 - offX - bx * s, y: area.h / 2 - offY - by * s });

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
    setCam(centerOn(cx, cy, s));
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
      // The whole column takes gestures, so a zoomed board can be dragged from anywhere.
      target: box,
      eventOptions: { passive: false },
      drag: { filterTaps: true, pointer: { touch: true } },
      pinch: { scaleBounds: { min: 1, max: 3 }, from: () => [camRef.current.s, 0] },
    },
  );

  // Camera follow (spec 12.4): while zoomed in, keep the token that is moving in view.
  const follow = useSettings((st) => st.followCamera);
  const lastPos = useRef(pos);
  useEffect(() => {
    const before = lastPos.current;
    lastPos.current = pos;
    if (!follow || !view || camRef.current.s <= 1.05) return;
    const mover = view.players.find((p) => pos[p.id] !== undefined && pos[p.id] !== before[p.id]);
    const at = mover ? pos[mover.id] : undefined;
    if (!mover || at === undefined) return;
    const spot = tokenSpot(at, false, 0, 1);
    const s = camRef.current.s;
    setSmooth(true);
    setCam(centerOn(spot.x * u, spot.y * u, s));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only token moves should pan
  }, [pos]);

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

  // 3D table view: the board leans back on the table; it lies flat while zoomed in.
  const zoomed = cam.s > 1.02;
  const tilted = tiltSetting && !zoomed;
  const edge = Math.max(3, u * 0.14);

  return (
    <div
      ref={box}
      className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
      style={{ touchAction: 'none' }}
    >
      <div
        className="relative"
        style={{ width: side, height: side, perspective: tiltSetting ? side * 2.4 : undefined }}
      >
        <div
          ref={viewport}
          data-testid="board"
          data-tilted={tilted || undefined}
          // Zoomed in, the board is not clipped to its square: it fills the whole column.
          className={`relative rounded-lg ${zoomed ? 'overflow-visible' : 'overflow-hidden'}`}
          style={{
            width: side,
            height: side,
            touchAction: 'none',
            transformOrigin: '50% 55%',
            // Scaled so the near (wider) edge stays inside the board's own column.
            transform: tilted
              ? `translateY(-2%) scale(${TILT_SCALE}) rotateX(${TILT_DEG}deg)`
              : 'none',
            transition: reduced ? undefined : 'transform 450ms ease, box-shadow 450ms ease',
            // Board thickness and its shadow on the table.
            boxShadow: zoomed
              ? 'none'
              : tiltSetting
                ? `0 ${edge}px 0 color-mix(in srgb, var(--m-board) 55%, #000), 0 ${edge * 3}px ${edge * 4}px rgba(0,0,0,.5)`
                : '0 4px 6px rgba(0,0,0,.15)',
          }}
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

            {/* Board center (as in docs/board-templates): decks, title plaque, dice, status */}
            <div
              className="pointer-events-none absolute rounded-[1.5%] border-2 border-primary/25"
              style={{ left: 1.65 * u, top: 1.65 * u, width: 8.7 * u, height: 8.7 * u }}
            />
            <Deck
              u={u}
              x={3.8}
              y={3.1}
              rotate={-14}
              color="var(--m-primary)"
              fill="#FFF1EC"
              label={map.decks.chance.name}
            >
              <span className="leading-none font-black text-accent" style={{ fontSize: u * 0.5 }}>
                ?
              </span>
            </Deck>
            <Deck
              u={u}
              x={8.2}
              y={3.1}
              rotate={12}
              color="var(--m-secondary)"
              fill="#EEF9F3"
              label={map.decks.chest.name}
            >
              <BoardIcon name="chest" size={u * 0.38} color="var(--m-secondary)" />
            </Deck>
            <div
              data-testid="title-plaque"
              className="absolute flex flex-col items-center justify-center rounded-[10%/22%] bg-primary text-white"
              style={{
                left: 3.55 * u,
                top: 4.35 * u,
                width: 4.9 * u,
                height: 1.75 * u,
                border: `${Math.max(2, u * 0.08)}px solid var(--m-accent)`,
                boxShadow: `inset 0 0 0 ${Math.max(1, u * 0.1)}px var(--m-primary), inset 0 0 0 ${Math.max(2, u * 0.12)}px rgba(255,255,255,.18)`,
              }}
            >
              <img
                src="/logo.png"
                alt=""
                draggable={false}
                style={{ height: u * 0.5, marginBottom: -u * 0.06 }}
              />
              <div
                className="leading-none font-black"
                style={{ fontSize: u * 0.42, letterSpacing: u * 0.02 }}
              >
                MONOPOLI
              </div>
              <div
                className="leading-tight font-extrabold text-accent"
                style={{ fontSize: u * 0.26, letterSpacing: u * 0.06, marginTop: u * 0.04 }}
              >
                {map.name.toUpperCase()}
              </div>
            </div>
            <div
              className="absolute flex flex-col items-center justify-start gap-[2%] text-center"
              style={{ left: 2.5 * u, top: 6.55 * u, width: 7 * u, height: 3.5 * u }}
            >
              <Dice dice={dice} rolling={rolling} size={u * 1.05} />
              <div
                className="flex flex-wrap items-center justify-center gap-x-[6%] rounded-full bg-white/60 px-[5%] py-[1%] font-semibold"
                style={{ fontSize: Math.max(8, u * 0.24), marginTop: u * 0.12 }}
              >
                <span>Round {view.round}</span>
                {view.settings.freeParkingPot && (
                  <span>{en.game.pot(formatMoney(map, view.parkingPot))}</span>
                )}
                <TimeLeft
                  endsAt={view.endsAt}
                  lastRound={view.lastRoundPending}
                  size={Math.max(8, u * 0.24)}
                />
              </div>
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
                  {/* A little hop on every step (keyed by the drawn position). */}
                  <motion.div
                    key={pos[p.id] ?? p.position}
                    initial={reduced ? false : { y: -tokenSize * 0.35 }}
                    animate={{ y: 0 }}
                    transition={{ type: 'spring', stiffness: 700, damping: 18 }}
                  >
                    <TokenIcon token={token} color={p.color} size={tokenSize * 0.72} />
                  </motion.div>
                  <AnimatePresence>
                    {floats
                      .filter((f) => f.player === p.id)
                      .slice(-1)
                      .map((f) => (
                        <motion.div
                          key={f.id}
                          data-testid="board-float"
                          className={`pointer-events-none absolute left-1/2 rounded bg-white/95 px-1 font-bold whitespace-nowrap shadow ${
                            f.amount > 0 ? 'text-green-700' : 'text-red-700'
                          }`}
                          style={{ fontSize: Math.max(9, u * 0.28), bottom: '100%', x: '-50%' }}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: -2 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{ duration: 0.35 }}
                        >
                          {f.amount > 0 ? '+' : '−'}
                          {formatMoney(map, Math.abs(f.amount), { compact: true })}
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
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

/** A tilted card deck in the board center. */
function Deck({
  u,
  x,
  y,
  rotate,
  color,
  fill,
  label,
  children,
}: {
  u: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
  fill: string;
  label: string;
  children: React.ReactNode;
}) {
  const w = 2.3 * u;
  const h = 1.3 * u;
  // Fit the longest word of the deck name (decorative label, may go down to 7 px).
  const longest = Math.max(...label.split(/\s+/).map((word) => word.length));
  const fontSize = Math.max(7, Math.min(u * 0.19, (w * 0.86) / (longest * 0.72)));
  return (
    <div
      data-testid="deck"
      className="absolute flex flex-col items-center justify-center rounded-[8%/12%] text-center shadow-sm"
      style={{
        left: x * u - w / 2,
        top: y * u - h / 2,
        width: w,
        height: h,
        transform: `rotate(${rotate}deg)`,
        background: fill,
        border: `${Math.max(2, u * 0.05)}px solid ${color}`,
        color,
      }}
    >
      <div
        className="leading-tight font-extrabold uppercase"
        style={{ fontSize, maxWidth: w * 0.92 }}
      >
        {label}
      </div>
      <div style={{ marginTop: u * 0.06 }}>{children}</div>
    </div>
  );
}
