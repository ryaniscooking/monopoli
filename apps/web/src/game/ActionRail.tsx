import { formatMoney, getActingPlayer, type Action } from '@monopoli/engine';
import { ArrowLeftRight, Home as HomeIcon, List, Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui';
import { useUi } from '../store/ui';
import { en } from '../strings/en';
import { Deed } from './Deed';
import { act, useTable } from './table';
import { useMyActions } from './useMyActions';
import { useNow } from '../components/useNow';

const t = en.game;

/** Right rail (spec 12.3): the contextual primary action, then deed or navigation. */
export function ActionRail() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const selected = useUi((s) => s.selectedTile);
  const selectTile = useUi((s) => s.selectTile);
  const openSheet = useUi((s) => s.openSheet);
  const legal = useMyActions();
  if (!map || !view || !me) return null;

  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  const money = (n: number) => formatMoney(map, n);
  const self = view.players.find((p) => p.id === me);
  const pending = view.pending;
  const myBuy = pending?.kind === 'buy' && pending.player === me ? pending : null;
  const deedTile = myBuy?.tile ?? selected;
  const acting = getActingPlayer(view);
  const actingName = view.players.find((p) => p.id === acting)?.name ?? '';

  let primary: ReactNode;
  if (view.phase === 'game_over') {
    primary = null;
  } else if (myBuy) {
    primary = (
      <>
        <Button data-testid="act-buy" disabled={!has('buy')} onClick={() => act({ type: 'buy' })}>
          {t.buy(money(myBuy.price))}
        </Button>
        <Button
          data-testid="act-decline"
          variant="secondary"
          onClick={() => act({ type: 'decline_buy' })}
        >
          {t.decline}
        </Button>
      </>
    );
  } else if (has('roll')) {
    primary = (
      <>
        <Button data-testid="act-roll" className="text-base" onClick={() => act({ type: 'roll' })}>
          {self?.inJail ? t.rollDoubles : t.roll}
        </Button>
        {has('pay_jail_fine') && (
          <Button variant="secondary" onClick={() => act({ type: 'pay_jail_fine' })}>
            {t.payFine(money(view.settings.jailFine * map.m))}
          </Button>
        )}
        {has('use_jail_card') && (
          <Button variant="secondary" onClick={() => act({ type: 'use_jail_card' })}>
            {t.useCard}
          </Button>
        )}
      </>
    );
  } else if (has('end_turn')) {
    primary = (
      <Button data-testid="act-end" onClick={() => act({ type: 'end_turn' })}>
        {t.endTurn}
      </Button>
    );
  } else {
    primary = (
      <div data-testid="waiting" className="py-2 text-center text-[13px] opacity-85">
        {view.pending?.kind === 'auction'
          ? t.auctionRunning
          : acting === me
            ? t.yourMove
            : t.waiting(actingName)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 py-1 text-white">
      <div className="flex flex-col gap-1.5">{primary}</div>
      <TurnTimer deadline={view.turnDeadline} />
      <div className="scroll-y min-h-0 flex-1">
        {deedTile ? (
          <Deed
            map={map}
            state={view}
            tileId={deedTile}
            onClose={myBuy ? undefined : () => selectTile(null)}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(
          [
            ['properties', HomeIcon, t.manage, 'open-manage'],
            ['trade', ArrowLeftRight, t.trade, 'open-trade'],
            ['log', List, t.log, 'open-log'],
            ['menu', Menu, t.menu, 'open-menu'],
          ] as const
        ).map(([sheet, Icon, label, testId]) => (
          <Button
            key={sheet}
            data-testid={testId}
            variant="secondary"
            className="flex flex-col items-center gap-0 px-0.5 text-[10px]"
            onClick={() => openSheet(sheet)}
          >
            <Icon size={16} />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Online turn timer (R-110): the server enforces it; this only shows the countdown. */
function TurnTimer({ deadline }: { deadline: number | null }) {
  const now = useNow(500);
  if (deadline === null) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div
      data-testid="turn-timer"
      className={`text-center text-[12px] font-semibold ${left <= 10 ? 'text-red-300' : 'opacity-70'}`}
    >
      ⏱ {left}s
    </div>
  );
}
