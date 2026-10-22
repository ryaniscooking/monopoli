import type { PlayerId } from '@monopoli/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { REACTIONS, sendReaction, useReactions } from '../online/reactions';
import { en } from '../strings/en';

/** Tap to open the emoji tray (online games only). */
export function ReactionBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        data-testid="reactions"
        aria-label={en.reactions}
        className="min-h-9 w-full rounded-lg bg-white/15 text-lg"
        onClick={() => setOpen((o) => !o)}
      >
        😀
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-30 grid w-[min(220px,40vw)] grid-cols-4 gap-1 rounded-xl bg-white p-1.5 shadow-lg">
          {REACTIONS.map((e) => (
            <button
              key={e}
              className="h-9 rounded-lg text-xl active:bg-black/10"
              onClick={() => {
                sendReaction(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Floating emoji on a player's card. */
export function ReactionFloat({ player }: { player: PlayerId }) {
  // Select the stable array, filter outside: a selector returning a new array each time
  // makes zustand re-render forever (React error #185).
  const all = useReactions((s) => s.shown);
  const shown = all.filter((r) => r.player === player);
  return (
    <AnimatePresence>
      {shown.map((r) => (
        <motion.div
          key={r.id}
          className="pointer-events-none absolute -top-1 right-8 text-2xl"
          initial={{ opacity: 0, scale: 0.5, y: 6 }}
          animate={{ opacity: 1, scale: 1.1, y: -6 }}
          exit={{ opacity: 0, y: -18 }}
        >
          {r.emoji}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
