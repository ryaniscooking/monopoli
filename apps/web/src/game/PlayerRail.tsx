import { COLOR_GROUPS, formatMoney } from '@monopoli/engine';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, Lock } from 'lucide-react';
import { Money } from '../components/ui';
import { en } from '../strings/en';
import { ReactionBar, ReactionFloat } from './Reactions';
import { useTable } from './table';

/** Left rail (spec 12.3): token, name, cash, owned groups, jail, bot badge, turn glow. */
export function PlayerRail() {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const floats = useTable((s) => s.floats);
  const me = useTable((s) => s.client?.me);
  const online = useTable((s) => s.online);
  if (!map || !view) return null;

  return (
    <div className="scroll-y flex h-full flex-col gap-1.5 py-1">
      {view.players.map((p) => {
        const current = p.id === view.current && view.phase !== 'game_over';
        const token = map.tokens.find((t) => t.id === p.token);
        const groups = COLOR_GROUPS.map((g) => {
          const ids = map.groups[g];
          const owned = ids.filter((id) => view.properties[id]?.owner === p.id).length;
          return { g, owned, full: owned === ids.length };
        });
        return (
          <div
            key={p.id}
            data-testid={`player-${p.id}`}
            className={`relative shrink-0 rounded-lg bg-tile px-2 py-1 text-ink transition-shadow ${
              current ? 'shadow-[0_0_0_3px_var(--m-accent)]' : ''
            } ${p.bankrupt ? 'opacity-45' : ''}`}
            style={{ borderLeft: `5px solid ${p.color}` }}
          >
            <div className="flex items-center gap-1 text-[13px] leading-tight">
              <span className="text-base">{token?.icon}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {p.name}
                {p.id === me && (
                  <span className="ml-1 text-[10px] font-normal opacity-60">({en.game.you})</span>
                )}
              </span>
              {p.kind === 'bot' && (
                <span className="flex items-center gap-[1px] rounded bg-black/10 px-1 text-[10px] font-bold">
                  <Bot size={11} />
                  {(p.botLevel ?? 'easy')[0]?.toUpperCase()}
                </span>
              )}
              {p.inJail && <Lock size={13} aria-label={en.game.inJail} />}
            </div>
            <div className="flex items-center justify-between gap-1">
              {p.bankrupt ? (
                <span className="text-[12px] font-semibold">{en.game.bankrupt}</span>
              ) : (
                <Money
                  map={map}
                  amount={p.cash}
                  className="text-[12px] font-bold whitespace-nowrap"
                />
              )}
              <div className="flex shrink-0 gap-[1px]">
                {groups.map(({ g, owned, full }) => (
                  <span
                    key={g}
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: owned ? `var(--g-${g})` : 'transparent',
                      border: owned ? undefined : '1px solid rgba(0,0,0,.15)',
                      outline: full ? '1.5px solid var(--m-text)' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
            <ReactionFloat player={p.id} />
            <AnimatePresence>
              {floats
                .filter((f) => f.player === p.id)
                .map((f) => (
                  <motion.div
                    key={f.id}
                    className={`pointer-events-none absolute top-1/2 right-2 rounded bg-white/90 px-1 text-[13px] font-bold ${
                      f.amount > 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: -10 }}
                    exit={{ opacity: 0, y: -22 }}
                    transition={{ duration: 0.5 }}
                  >
                    {f.amount > 0 ? '+' : '−'}
                    {formatMoney(map, Math.abs(f.amount), { compact: true })}
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        );
      })}
      {online && <ReactionBar />}
    </div>
  );
}
