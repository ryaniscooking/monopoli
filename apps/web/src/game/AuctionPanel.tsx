import { formatMoney, minimumBid } from '@monopoli/engine';
import { useState } from 'react';
import { Button, Modal } from '../components/ui';
import { useNow } from '../components/useNow';
import { en } from '../strings/en';
import { Deed } from './Deed';
import { act, useTable } from './table';

const a = en.auction;

function Ring({ fraction, label }: { fraction: number; label: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-label={label}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="5" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke="var(--m-accent)"
        strokeWidth="5"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="29" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">
        {label}
      </text>
    </svg>
  );
}

/** Auction sheet (spec 12.6): high bid, timer ring, quick bids, custom amount, drop out. */
export function AuctionPanel() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const me = useTable((s) => s.client?.me);
  const busy = useTable((s) => s.busy);
  const now = useNow();
  const [custom, setCustom] = useState('');
  const auction = view?.pending?.kind === 'auction' ? view.pending : null;
  if (!map || !view || !me) return null;

  const self = view.players.find((p) => p.id === me);
  const money = (n: number) => formatMoney(map, n);
  const min = minimumBid(map, view);
  const active = !!auction?.active.includes(me);
  const leading = auction?.highBidder === me;
  const total = view.settings.auctionTimerSec * 1000;
  const left = auction ? Math.max(0, auction.deadline - now) : 0;
  const cash = self?.cash ?? 0;
  const bid = (amount: number) => {
    setCustom('');
    void act({ type: 'auction_bid', amount });
  };
  const quick = [1, 10, 50, 100].map((k) =>
    Math.max(min, (auction?.highBidder ? auction.highBid : 0) + k * map.m),
  );
  const customAmount = Math.round(Number(custom));

  return (
    <Modal open={!!auction} testId="auction-panel" className="w-[min(640px,94vw)]">
      {auction && (
        <div className="flex gap-3">
          <div className="w-[42%] shrink-0">
            {auction.item.type === 'property' ? (
              <Deed map={map} state={view} tileId={auction.item.tile} />
            ) : (
              <div className="rounded-lg bg-white p-3 text-sm font-semibold">
                {a.building(auction.item.building)}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">{a.title}</div>
              <Ring fraction={left / total} label={String(Math.ceil(left / 1000))} />
            </div>
            <div data-testid="auction-status" className="text-sm font-semibold">
              {auction.highBidder
                ? a.high(
                    money(auction.highBid),
                    view.players.find((p) => p.id === auction.highBidder)?.name ?? '',
                  )
                : a.none(money(min))}
            </div>
            {!active ? (
              <div className="text-sm opacity-70">{a.out}</div>
            ) : leading ? (
              <div className="rounded-lg bg-green-100 p-2 text-sm font-semibold text-green-900">
                {a.youLead}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5">
                  {quick.map((amount, i) => (
                    <Button
                      key={i}
                      data-testid={`bid-${i}`}
                      variant="light"
                      className="px-1 text-[12px]"
                      disabled={busy || amount > cash}
                      onClick={() => bid(amount)}
                    >
                      {formatMoney(map, amount, { compact: true })}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    inputMode="numeric"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2"
                    placeholder={a.custom}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <Button
                    disabled={busy || !custom || customAmount < min || customAmount > cash}
                    onClick={() => bid(customAmount)}
                  >
                    {a.bid}
                  </Button>
                </div>
                <Button
                  data-testid="auction-withdraw"
                  variant="light"
                  disabled={busy}
                  onClick={() => act({ type: 'auction_withdraw' })}
                >
                  {a.withdraw}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
