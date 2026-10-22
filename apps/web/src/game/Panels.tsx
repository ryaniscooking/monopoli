import { formatMoney, netWorth, type Action } from '@monopoli/engine';
import { useEffect, useRef, useState } from 'react';
import { Button, Modal, SectionLabel } from '../components/ui';
import { useSetup, useUi } from '../store/ui';
import { en } from '../strings/en';
import { useMyActions } from './useMyActions';
import { partyName } from './describe';
import { exitGame, leaveOnlineGame, newSoloGame, quitGame } from './session';
import { act, useTable } from './table';

const t = en.game;

/** Debt (spec 12.6): what is still needed, mortgage options, Pay, Declare bankruptcy. */
export function DebtPanel() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const busy = useTable((s) => s.busy);
  const legal = useMyActions(true);
  const debt = view?.pending?.kind === 'debt' && view.pending.debtor === me ? view.pending : null;
  // The bankruptcy confirmation belongs to one specific debt.
  const debtKey = debt ? `${debt.amount}:${debt.creditor}:${debt.reason}` : null;
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const confirm = debtKey !== null && confirmFor === debtKey;
  const setConfirm = (on: boolean) => setConfirmFor(on ? debtKey : null);
  if (!map || !view || !me) return null;
  const self = view.players.find((p) => p.id === me);
  const money = (n: number) => formatMoney(map, n);
  const mortgages = legal.filter(
    (a): a is Extract<Action, { type: 'mortgage' }> => a.type === 'mortgage',
  );
  const needed = debt && self ? Math.max(0, debt.amount - self.cash) : 0;

  return (
    <Modal open={!!debt} testId="debt-panel">
      {debt && (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold">{t.debt.title}</div>
          <div className="text-sm">
            {t.owes(money(debt.amount))} ·{' '}
            {t.debt.owedTo(
              debt.creditor === 'bank' || debt.creditor === 'pot'
                ? t.debt.bank
                : partyName(view, debt.creditor),
            )}
          </div>
          <div className="text-sm font-semibold">{t.debt.needed(money(needed))}</div>
          {mortgages.length > 0 && (
            <div>
              <SectionLabel>{t.debt.hint}</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {mortgages.map((a) => {
                  const tile = map.byId[a.tile];
                  return (
                    <Button
                      key={a.tile}
                      variant="light"
                      disabled={busy}
                      className="text-left text-[12px]"
                      onClick={() => act(a)}
                    >
                      {tile?.name} · +{money(tile && 'mortgage' in tile ? tile.mortgage : 0)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-1 flex gap-2">
            <Button
              data-testid="act-pay-debt"
              className="flex-1"
              disabled={busy || !legal.some((a) => a.type === 'pay_debt')}
              onClick={() => act({ type: 'pay_debt' })}
            >
              {t.payDebt} {money(debt.amount)}
            </Button>
            {!confirm ? (
              <Button variant="danger" disabled={busy} onClick={() => setConfirm(true)}>
                {t.debt.bankrupt}
              </Button>
            ) : null}
          </div>
          {confirm && (
            <div className="rounded-lg bg-red-50 p-2 text-sm">
              <div className="mb-2">{t.debt.confirmBankrupt}</div>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => act({ type: 'declare_bankruptcy' })}
                >
                  {t.debt.confirm}
                </Button>
                <Button variant="light" onClick={() => setConfirm(false)}>
                  {t.debt.cancel}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function LogSheet() {
  const log = useTable((s) => s.log);
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sheet === 'log') end.current?.scrollIntoView();
  }, [sheet, log.length]);
  return (
    <Modal open={sheet === 'log'} onClose={() => openSheet(null)} className="h-[85vh] pt-0">
      <div className="sticky top-0 -mx-4 mb-2 flex items-center justify-between bg-tile px-4 pt-4 pb-2">
        <div className="text-lg font-bold">{t.log}</div>
        <Button variant="light" onClick={() => openSheet(null)}>
          {t.close}
        </Button>
      </div>
      <div className="flex flex-col gap-0.5 text-[13px]">
        {log.map((l) => (
          <div key={l.id} className={l.text.startsWith('—') ? 'mt-1 font-semibold opacity-60' : ''}>
            {l.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </Modal>
  );
}

export function MenuSheet() {
  const map = useTable((s) => s.map);
  const online = useTable((s) => s.online);
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const go = useUi((s) => s.go);
  const [confirm, setConfirm] = useState(false);
  const m = t.menuSheet;
  return (
    <Modal open={sheet === 'menu'} onClose={() => openSheet(null)} className="w-[min(360px,90vw)]">
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold">{m.title}</div>
        <Button onClick={() => openSheet(null)}>{m.resume}</Button>
        <Button variant="light" onClick={() => go('settings')}>
          {m.settings}
        </Button>
        <Button data-testid="menu-exit" variant="light" onClick={exitGame}>
          {online ? m.exitOnline : m.exit}
        </Button>
        {!confirm ? (
          <Button variant="light" className="text-red-700" onClick={() => setConfirm(true)}>
            {online ? m.leaveOnline : m.quit}
          </Button>
        ) : (
          <div className="rounded-lg bg-red-50 p-2 text-sm">
            <div className="mb-2">{online ? m.confirmLeaveOnline : m.confirmQuit}</div>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => (online ? void leaveOnlineGame() : map && void quitGame(map.id))}
              >
                {m.quit}
              </Button>
              <Button variant="light" onClick={() => setConfirm(false)}>
                {en.game.debt.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Game over (spec 12.1.5): winner, net worth ranking, simple stats. */
export function GameOver() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const busy = useTable((s) => s.busy);
  const rent = useTable((s) => s.rentCollected);
  const online = useTable((s) => s.online);
  const go = useUi((s) => s.go);
  const setup = useSetup();
  if (!map || !view) return null;
  const o = t.over;
  const winner = view.players.find((p) => p.id === view.winner);
  const ranking = [...view.players].sort(
    (a, b) =>
      Number(a.bankrupt) - Number(b.bankrupt) ||
      netWorth(map, view, b.id) - netWorth(map, view, a.id),
  );
  const money = (n: number) => formatMoney(map, n);

  return (
    <Modal open={view.phase === 'game_over' && !busy} testId="game-over">
      <div className="text-center">
        <div className="text-sm font-semibold uppercase opacity-60">{o.title}</div>
        <div className="mb-2 text-2xl font-black text-primary">
          {winner ? o.winner(winner.name) : ''}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase opacity-60">
            <th />
            <th className="text-right">{o.netWorth}</th>
            <th className="text-right">{o.rent}</th>
            <th className="text-right">{o.owned}</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((p, i) => (
            <tr key={p.id} className="border-t border-black/10">
              <td className="py-1">
                {i + 1}. {p.name}
              </td>
              <td className="tabular text-right">
                {p.bankrupt ? t.bankrupt : money(netWorth(map, view, p.id))}
              </td>
              <td className="tabular text-right">{money(rent[p.id] ?? 0)}</td>
              <td className="tabular text-right">
                {map.buyable.filter((id) => view.properties[id]?.owner === p.id).length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-center gap-2">
        <Button
          onClick={() => {
            if (!online) return newSoloGame({ ...setup, mapId: map.id });
            exitGame();
            go('online');
          }}
        >
          {o.again}
        </Button>
        <Button variant="light" onClick={exitGame}>
          {o.home}
        </Button>
      </div>
    </Modal>
  );
}
