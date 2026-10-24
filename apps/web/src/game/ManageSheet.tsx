import { formatMoney, sellValue, unmortgageCost, type TileId } from '@monopoli/engine';
import { Button, Modal, SectionLabel } from '../components/ui';
import { useUi } from '../store/ui';
import { en } from '../strings/en';
import { act, useTable } from './table';
import { useMyActions } from './useMyActions';

const t = en.game;
const m = en.manage;

function Buildings({ n }: { n: number }) {
  if (n === 5) return <span title="hotel">🏨</span>;
  return <span className="tracking-[-2px]">{'🏠'.repeat(n)}</span>;
}

/** Build / sell / mortgage (spec 12.6 Build/Manage). */
export function ManageSheet() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const busy = useTable((s) => s.busy);
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const legal = useMyActions(true);
  if (!map || !view || !me) return null;

  const money = (n: number) => formatMoney(map, n);
  const has = (type: string, tile: TileId) =>
    !busy && legal.some((a) => a.type === type && 'tile' in a && a.tile === tile);
  const mine = (ids: readonly TileId[]) => ids.filter((id) => view.properties[id]?.owner === me);
  const sections: { key: string; color: string; tiles: TileId[] }[] = [
    ...Object.entries(map.groups).map(([g, ids]) => ({
      key: g,
      color: `var(--g-${g})`,
      tiles: mine(ids),
    })),
    { key: 'transport', color: 'var(--m-primary)', tiles: mine(map.transports) },
    { key: 'utility', color: 'var(--m-secondary)', tiles: mine(map.utilities) },
  ].filter((sec) => sec.tiles.length > 0);
  const stock = (n: number) => (view.settings.unlimitedBuildings ? '∞' : String(n));

  return (
    <Modal
      open={sheet === 'properties'}
      onClose={() => openSheet(null)}
      className="h-[88vh] pt-0"
      testId="manage-sheet"
    >
      <div className="sticky top-0 -mx-4 mb-2 flex items-center justify-between bg-tile px-4 pt-4 pb-2">
        <div>
          <div className="text-lg font-bold">{m.title}</div>
          <div className="text-[11px] opacity-70">
            {m.bank(stock(view.bank.houses), stock(view.bank.hotels))}
          </div>
        </div>
        <Button variant="light" onClick={() => openSheet(null)}>
          {t.close}
        </Button>
      </div>
      {sections.length === 0 && <div className="text-sm opacity-70">{t.noProperties}</div>}
      {sections.length > 0 && <div className="mb-2 text-[11px] opacity-70">{m.hint}</div>}
      <div className="flex flex-col gap-2">
        {sections.map((sec) => (
          <div key={sec.key}>
            <SectionLabel>
              <span
                className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                style={{ background: sec.color }}
              />
              {sec.key}
            </SectionLabel>
            <div className="flex flex-col gap-1">
              {sec.tiles.map((id) => {
                const tile = map.byId[id];
                const prop = view.properties[id];
                if (!tile || !prop || !('mortgage' in tile)) return null;
                const sale =
                  prop.buildings > 0
                    ? sellValue(map, view, id)
                    : tile.type === 'property'
                      ? Math.floor(tile.houseCost / 2)
                      : 0;
                return (
                  <div
                    key={id}
                    data-testid={`manage-${id}`}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{tile.name}</span>
                    <Buildings n={prop.buildings} />
                    {prop.mortgaged && (
                      <span className="text-[11px] font-semibold opacity-70">{t.mortgaged}</span>
                    )}
                    {tile.type === 'property' && (
                      <>
                        <Button
                          variant="light"
                          aria-label={`sell building on ${tile.name}`}
                          className="px-2 text-[12px]"
                          disabled={!has('sell_building', id)}
                          onClick={() => act({ type: 'sell_building', tile: id })}
                        >
                          {m.sell(formatMoney(map, sale, { compact: true }))}
                        </Button>
                        <Button
                          data-testid={`build-${id}`}
                          variant="light"
                          aria-label={`build on ${tile.name}`}
                          className="px-2 text-[12px]"
                          disabled={!has('build', id)}
                          onClick={() => act({ type: 'build', tile: id })}
                        >
                          {m.build(formatMoney(map, tile.houseCost, { compact: true }))}
                        </Button>
                      </>
                    )}
                    {!prop.mortgaged ? (
                      <Button
                        variant="light"
                        className="px-2 text-[12px]"
                        disabled={!has('mortgage', id)}
                        onClick={() => act({ type: 'mortgage', tile: id })}
                      >
                        {t.mortgage(money(tile.mortgage))}
                      </Button>
                    ) : (
                      <Button
                        variant="light"
                        className="px-2 text-[12px]"
                        disabled={!has('unmortgage', id)}
                        onClick={() => act({ type: 'unmortgage', tile: id })}
                      >
                        {t.unmortgage(money(unmortgageCost(map, id)))}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
