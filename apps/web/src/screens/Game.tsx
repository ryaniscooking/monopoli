import { useEffect, useRef } from 'react';
import { Board } from '../board/Board';
import { Button } from '../components/ui';
import { ActionRail } from '../game/ActionRail';
import { AuctionPanel } from '../game/AuctionPanel';
import { ManageSheet } from '../game/ManageSheet';
import { DebtPanel, GameOver, LogSheet, MenuSheet } from '../game/Panels';
import { TradeSheet } from '../game/Trade';
import { PlayerRail } from '../game/PlayerRail';
import { useTable } from '../game/table';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

/** Landscape game layout (spec 12.3): players | board | actions. */
export function Game() {
  const error = useTable((s) => s.error);
  const pending = useTable((s) => s.view?.pending);
  const me = useTable((s) => s.client?.me);
  const hasClient = useTable((s) => s.client !== null);
  const go = useUi((s) => s.go);
  const table = useSettings((s) => s.boardTilt);
  const boardHome = useRef<HTMLDivElement>(null);
  const selectTile = useUi((s) => s.selectTile);

  // A buy decision shows that tile's deed.
  const buyTile = pending?.kind === 'buy' && pending.player === me ? pending.tile : null;
  useEffect(() => {
    if (buyTile) selectTile(null);
  }, [buyTile, selectTile]);

  // Nothing to show without a game (e.g. Settings opened from Home, then Back).
  useEffect(() => {
    if (!hasClient) go('home');
  }, [hasClient, go]);
  if (!hasClient) return null;

  return (
    <div
      className={`safe relative flex h-full gap-2 bg-primary ${table ? 'table-surface' : ''}`}
      data-testid="game-screen"
    >
      {/* The board lives in a full-screen layer under the rails: it rests in the middle column
          (boardHome) and, zoomed in, continues under the rails. */}
      <div className="absolute inset-0 z-0">
        <Board home={boardHome} />
      </div>
      <div className="relative z-10 w-[22%] min-w-0">
        <PlayerRail />
      </div>
      <div ref={boardHome} className="pointer-events-none min-w-0 flex-1" />
      <div className="relative z-10 w-[26%] min-w-0">
        <ActionRail />
      </div>
      <DebtPanel />
      <AuctionPanel />
      <ManageSheet />
      <TradeSheet />
      <LogSheet />
      <MenuSheet />
      <GameOver />
      {error && (
        <div className="fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm text-white shadow">
          {error}
          <Button variant="secondary" onClick={() => useTable.setState({ error: null })}>
            OK
          </Button>
        </div>
      )}
    </div>
  );
}
