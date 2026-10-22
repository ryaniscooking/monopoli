import {
  checkAction,
  formatMoney,
  type GameState,
  type PlayerId,
  type ResolvedMap,
  type TileId,
  type TradeBundle,
  type TradeOffer,
} from '@monopoli/engine';
import { Info, Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Modal, SectionLabel } from '../components/ui';
import { useUi } from '../store/ui';
import { en } from '../strings/en';
import { useNow } from '../components/useNow';
import { Deed } from './Deed';
import { GroupSwatch } from '../board/GroupMark';
import { act, useTable } from './table';

const tr = en.trade;
const empty = (): TradeBundle => ({ cash: 0, tiles: [], jailCards: 0 });

/** Tiles a player could put in a trade (no buildings anywhere in the group, R-090). */
function tradableTiles(map: ResolvedMap, s: GameState, owner: PlayerId): TileId[] {
  return map.buyable.filter((id) => {
    if (s.properties[id]?.owner !== owner) return false;
    const t = map.byId[id];
    return !(
      t?.type === 'property' &&
      map.groups[t.group].some((g) => (s.properties[g]?.buildings ?? 0) > 0)
    );
  });
}

function BundleEditor({
  map,
  state,
  owner,
  bundle,
  onChange,
  title,
  onInfo,
}: {
  map: ResolvedMap;
  state: GameState;
  owner: PlayerId;
  bundle: TradeBundle;
  onChange: (b: TradeBundle) => void;
  title: string;
  onInfo: (tile: TileId) => void;
}) {
  const p = state.players.find((x) => x.id === owner);
  const tiles = tradableTiles(map, state, owner);
  const toggle = (id: TileId) =>
    onChange({
      ...bundle,
      tiles: bundle.tiles.includes(id)
        ? bundle.tiles.filter((x) => x !== id)
        : [...bundle.tiles, id],
    });
  return (
    <div className="min-w-0 flex-1">
      <SectionLabel>{title}</SectionLabel>
      <label className="mb-1 flex items-center gap-1 text-sm">
        <span className="w-12 opacity-70">{tr.cash}</span>
        <input
          inputMode="numeric"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2"
          value={bundle.cash || ''}
          placeholder="0"
          onChange={(e) =>
            onChange({ ...bundle, cash: Number(e.target.value.replace(/[^\d]/g, '')) })
          }
        />
      </label>
      <div className="mb-1 text-[11px] opacity-60">max {formatMoney(map, p?.cash ?? 0)}</div>
      {(p?.jailCards ?? 0) > 0 && (
        <div className="mb-1 flex items-center gap-1 text-sm">
          <span className="flex-1 opacity-70">{tr.jailCards}</span>
          <Button
            variant="light"
            className="px-2"
            onClick={() => onChange({ ...bundle, jailCards: Math.max(0, bundle.jailCards - 1) })}
          >
            <Minus size={14} />
          </Button>
          <span className="w-4 text-center">{bundle.jailCards}</span>
          <Button
            variant="light"
            className="px-2"
            onClick={() =>
              onChange({ ...bundle, jailCards: Math.min(p?.jailCards ?? 0, bundle.jailCards + 1) })
            }
          >
            <Plus size={14} />
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {tiles.map((id) => {
          const t = map.byId[id];
          return (
            <div key={id} className="flex items-center gap-1 rounded bg-white pr-0.5 text-[13px]">
              <label className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1">
                <input
                  type="checkbox"
                  checked={bundle.tiles.includes(id)}
                  onChange={() => toggle(id)}
                />
                <GroupSwatch group={t?.type === 'property' ? t.group : null} />
                <span className="truncate">{t?.name}</span>
                {state.properties[id]?.mortgaged && (
                  <span className="text-[10px] opacity-60">M</span>
                )}
              </label>
              <button
                aria-label={tr.cardInfo}
                data-testid={`info-${id}`}
                className="p-1 opacity-60"
                onClick={() => onInfo(id)}
              >
                <Info size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Trade composer (spec 12.6): pick a player, then what each side gives. */
export function TradeSheet() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const busy = useTable((s) => s.busy);
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const [partner, setPartner] = useState<PlayerId | null>(null);
  const [give, setGive] = useState<TradeBundle>(empty);
  const [get, setGet] = useState<TradeBundle>(empty);
  const [preview, setPreview] = useState<TileId | null>(null);
  if (!map || !view || !me) return null;

  const others = view.players.filter((p) => p.id !== me && !p.bankrupt);
  const to = partner && others.some((p) => p.id === partner) ? partner : (others[0]?.id ?? null);
  const action = to ? ({ type: 'propose_trade', to, give, get } as const) : null;
  // The clock (last argument) only matters for system timeouts.
  const problem = action ? checkAction(map, view, me, action, 0) : tr.noPlayers;
  const close = () => openSheet(null);

  return (
    <Modal
      open={sheet === 'trade'}
      onClose={close}
      className="h-[90vh] w-[min(700px,96vw)] pt-0"
      testId="trade-sheet"
    >
      <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 bg-tile px-4 pt-4 pb-2">
        <div className="text-lg font-bold">{tr.title}</div>
        <div className="flex flex-1 flex-wrap gap-1">
          {others.map((p) => (
            <Button
              key={p.id}
              variant={p.id === to ? 'primary' : 'light'}
              className="min-h-8 px-2 text-[12px]"
              onClick={() => {
                setPartner(p.id);
                setGet(empty());
              }}
            >
              {p.name}
            </Button>
          ))}
        </div>
        <Button variant="light" onClick={close}>
          {en.game.close}
        </Button>
      </div>
      {to && (
        <>
          <div className="flex gap-3">
            <BundleEditor
              map={map}
              state={view}
              owner={me}
              bundle={give}
              onChange={setGive}
              title={tr.youGive}
              onInfo={setPreview}
            />
            <BundleEditor
              map={map}
              state={view}
              owner={to}
              bundle={get}
              onChange={setGet}
              title={tr.youGet}
              onInfo={setPreview}
            />
            <DeedPreview tile={preview} onClose={() => setPreview(null)} />
          </div>
          <div className="sticky bottom-0 -mx-4 mt-2 flex items-center gap-2 bg-tile px-4 py-2">
            <div className="min-w-0 flex-1 truncate text-[12px] text-red-700">
              {give.cash +
                get.cash +
                give.tiles.length +
                get.tiles.length +
                give.jailCards +
                get.jailCards >
              0
                ? problem
                : ''}
            </div>
            <Button
              data-testid="send-offer"
              disabled={busy || !!problem}
              onClick={() => {
                if (action) void act(action);
                setGive(empty());
                setGet(empty());
                close();
              }}
            >
              {tr.send}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** A deed in a modal (tap a property in a trade to see its card). */
function DeedPreview({ tile, onClose }: { tile: TileId | null; onClose: () => void }) {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  return (
    <Modal
      open={!!tile && !!map && !!view}
      onClose={onClose}
      className="w-[min(300px,90vw)] p-2"
      testId="deed-preview"
    >
      {tile && map && view && <Deed map={map} state={view} tileId={tile} onClose={onClose} />}
    </Modal>
  );
}

/** Colored chips for the properties in a bundle; tapping one shows its deed. */
function TileChips({ tiles, onOpen }: { tiles: TileId[]; onOpen: (tile: TileId) => void }) {
  const map = useTable((s) => s.map);
  if (!map) return null;
  return (
    <>
      {tiles.map((id) => {
        const t = map.byId[id];
        return (
          <button
            key={id}
            data-testid={`chip-${id}`}
            onClick={() => onOpen(id)}
            className="m-0.5 inline-flex items-center gap-1 rounded border border-black/15 bg-white px-1 py-0.5 text-[11px] font-semibold"
          >
            <GroupSwatch group={t?.type === 'property' ? t.group : null} />
            {t?.name ?? id}
          </button>
        );
      })}
    </>
  );
}

function extras(map: ResolvedMap, b: TradeBundle): string {
  const parts = [
    ...(b.cash > 0 ? [formatMoney(map, b.cash)] : []),
    ...(b.jailCards > 0 ? [`${b.jailCards} × Jail card`] : []),
  ];
  return parts.join(', ');
}

/** Every card in the offer side by side: what I get and what I give (spec 12.6 Trade). */
function TradeDetails({
  offer,
  open,
  onClose,
  actions,
}: {
  offer: TradeOffer;
  open: boolean;
  onClose: () => void;
  actions: ReactNode;
}) {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  if (!map || !view || !me) return null;
  const incoming = offer.to === me;
  const get = incoming ? offer.give : offer.get;
  const give = incoming ? offer.get : offer.give;
  const other = view.players.find((p) => p.id === (incoming ? offer.from : offer.to))?.name ?? '';
  const column = (title: string, b: TradeBundle) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">
        {title}
      </div>
      {extras(map, b) && <div className="mb-1 text-sm font-semibold">{extras(map, b)}</div>}
      {b.tiles.length === 0 && !extras(map, b) && (
        <div className="text-sm opacity-60">{tr.nothing}</div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
        {b.tiles.map((id) => (
          <Deed key={id} map={map} state={view} tileId={id} />
        ))}
      </div>
    </div>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      className="h-[90vh] w-[min(820px,96vw)] pt-0"
      testId="trade-details"
    >
      <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 bg-tile px-4 pt-4 pb-2">
        <div className="flex-1 text-lg font-bold">{tr.details(other)}</div>
        {actions}
        <Button variant="light" onClick={onClose}>
          {en.game.close}
        </Button>
      </div>
      <div className="flex gap-3">
        {column(tr.youWouldGet, get)}
        <div className="w-px shrink-0 bg-black/10" />
        {column(tr.youWouldGive, give)}
      </div>
    </Modal>
  );
}

function OfferCard({ offer, mine }: { offer: TradeOffer; mine: boolean }) {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const busy = useTable((s) => s.busy);
  const now = useNow(500);
  const [details, setDetails] = useState(false);
  const [preview, setPreview] = useState<TileId | null>(null);
  if (!map || !view || !me) return null;
  const name = (id: PlayerId) => view.players.find((p) => p.id === id)?.name ?? id;
  const secs = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
  const canAccept =
    !busy && checkAction(map, view, me, { type: 'accept_trade', id: offer.id }, now) === null;
  const get = mine ? offer.get : offer.give;
  const give = mine ? offer.give : offer.get;
  const buttons = mine ? (
    <Button
      variant="light"
      disabled={busy}
      onClick={() => act({ type: 'cancel_trade', id: offer.id })}
    >
      {tr.cancel}
    </Button>
  ) : (
    <>
      <Button
        data-testid="accept-offer"
        disabled={!canAccept}
        onClick={() => {
          setDetails(false);
          void act({ type: 'accept_trade', id: offer.id });
        }}
      >
        {tr.accept}
      </Button>
      <Button
        variant="light"
        disabled={busy}
        onClick={() => {
          setDetails(false);
          void act({ type: 'decline_trade', id: offer.id });
        }}
      >
        {tr.decline}
      </Button>
    </>
  );
  const line = (label: string, b: TradeBundle) => (
    <div>
      <span className="opacity-60">{label}: </span>
      {extras(map, b) && <span className="font-semibold">{extras(map, b)} </span>}
      <TileChips tiles={b.tiles} onOpen={setPreview} />
      {b.tiles.length === 0 && !extras(map, b) && tr.nothing}
    </div>
  );
  return (
    <div
      data-testid={mine ? 'outgoing-offer' : 'incoming-offer'}
      className="rounded-lg border-l-4 border-accent bg-white p-1.5 text-[12px] leading-snug text-ink shadow"
    >
      <div className="mb-1 flex items-center justify-between font-semibold">
        <span>{mine ? tr.offerTo(name(offer.to)) : tr.offerFrom(name(offer.from))}</span>
        <span className="tabular text-[11px] opacity-60">{tr.expires(secs)}</span>
      </div>
      {line(mine ? tr.youWouldGet : tr.gives, get)}
      {line(mine ? tr.youWouldGive : tr.wants, give)}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {buttons}
        <Button data-testid="view-cards" variant="light" onClick={() => setDetails(true)}>
          {tr.viewCards}
        </Button>
      </div>
      <TradeDetails
        offer={offer}
        open={details}
        onClose={() => setDetails(false)}
        actions={buttons}
      />
      <DeedPreview tile={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/**
 * Incoming offers with Accept / Decline, and my own pending offer (spec 12.6 Trade).
 * Shown inside the right rail so it never covers the board.
 */
export function TradeBanner() {
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  if (!view || !me) return null;
  const relevant = view.trades.filter((t) => t.to === me || t.from === me);
  if (relevant.length === 0) return null;
  return (
    <div data-testid="trade-offers" className="flex shrink-0 flex-col gap-1.5">
      {relevant.map((o) => (
        <OfferCard key={o.id} offer={o} mine={o.from === me} />
      ))}
    </div>
  );
}
