import { formatMoney, type GameState, type ResolvedMap, type ResolvedTile } from '@monopoli/engine';
import { X } from 'lucide-react';
import { en } from '../strings/en';

const t = en.game;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-[1px]">
      <span className="opacity-75">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

function describeTile(map: ResolvedMap, tile: ResolvedTile, state: GameState): string {
  const money = (n: number) => formatMoney(map, n);
  switch (tile.type) {
    case 'go':
      return `Collect ${money(state.settings.goSalary * map.m)} each time you pass or land on GO.`;
    case 'jail':
      return 'Just visiting, unless you were sent here. Leave by rolling doubles, paying the fine, or using a card.';
    case 'free_parking':
      return state.settings.freeParkingPot
        ? `Collect the pot: ${money(state.parkingPot)}.`
        : 'Take a break. Nothing happens here.';
    case 'go_to_jail':
      return 'Go directly to Jail. Do not pass GO.';
    case 'tax':
      return `Pay ${money(tile.amount)} to the bank.`;
    case 'card':
      return `Draw a ${map.decks[tile.deck].name} card.`;
    default:
      return '';
  }
}

/** Title deed shown when a tile is tapped (spec 12.4). */
export function Deed({
  map,
  state,
  tileId,
  onClose,
}: {
  map: ResolvedMap;
  state: GameState;
  tileId: string;
  onClose?: () => void;
}) {
  const tile = map.byId[tileId];
  if (!tile) return null;
  const prop = state.properties[tileId];
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null;
  const money = (n: number) => formatMoney(map, n);
  const header = tile.type === 'property' ? `var(--g-${tile.group})` : 'var(--m-primary)';
  const darkText = tile.type === 'property' && ['yellow', 'lightblue'].includes(tile.group);

  return (
    <div data-testid="deed" className="overflow-hidden rounded-lg bg-white text-ink shadow">
      <div
        className={`flex items-start gap-1 px-2 py-1.5 ${darkText ? 'text-ink' : 'text-white'}`}
        style={{ background: header }}
      >
        <div className="flex-1 text-sm leading-tight font-bold">{tile.name}</div>
        {onClose && (
          <button aria-label={t.close} className="-m-1 p-1" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="px-2 py-1.5 text-[12px]">
        {'price' in tile ? (
          <>
            <Row label={t.price} value={money(tile.price)} />
            {tile.type === 'property' && (
              <>
                <Row label={t.rent} value={money(tile.rent[0] ?? 0)} />
                <Row label={t.rentWithSet} value={money((tile.rent[0] ?? 0) * 2)} />
                {[1, 2, 3, 4].map((n) => (
                  <Row key={n} label={t.houses(n)} value={money(tile.rent[n] ?? 0)} />
                ))}
                <Row label={t.hotel} value={money(tile.rent[5] ?? 0)} />
                <Row label={t.houseCost} value={money(tile.houseCost)} />
              </>
            )}
            {tile.type === 'transport' &&
              map.transportRent.map((r, i) => (
                <Row key={i} label={`${t.rent} · ${t.transportRent(i + 1)}`} value={money(r)} />
              ))}
            {tile.type === 'utility' && <div className="py-1 opacity-80">{t.utilityRent}</div>}
            <Row label={t.mortgageValue} value={money(tile.mortgage)} />
            <div className="mt-1 flex items-center gap-1 border-t border-black/10 pt-1">
              <span className="opacity-75">{t.owner}:</span>
              {owner ? (
                <>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: owner.color }}
                  />
                  <span className="font-semibold">{owner.name}</span>
                </>
              ) : (
                <span className="font-semibold">{t.unowned}</span>
              )}
              {prop?.mortgaged && (
                <span className="ml-auto rounded bg-black/80 px-1 text-[10px] font-bold text-white">
                  {t.mortgaged}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="leading-snug">{describeTile(map, tile, state)}</div>
        )}
      </div>
    </div>
  );
}
