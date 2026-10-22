// Emoji reactions (spec 10.8): a private Broadcast channel "room:<CODE>" that only room members
// may join (RLS on realtime.messages). Purely cosmetic: receivers accept only whitelisted emoji
// and show at most one per sender every 2 seconds.
import type { PlayerId } from '@monopoli/engine';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

export const REACTIONS = ['👍', '😂', '😮', '😡', '🎉', '😭', '🔥', '🙏'] as const;

interface Shown {
  id: number;
  player: PlayerId;
  emoji: string;
}

export const useReactions = create<{ shown: Shown[] }>()(() => ({ shown: [] }));

let channel: RealtimeChannel | null = null;
let me: PlayerId | null = null;
let nextId = 1;
const lastFrom = new Map<string, number>();

function show(player: PlayerId, emoji: string) {
  const now = Date.now();
  if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number])) return;
  if (!/^p[0-5]$/.test(player)) return;
  if (now - (lastFrom.get(player) ?? 0) < 2000) return;
  lastFrom.set(player, now);
  const id = nextId++;
  useReactions.setState((s) => ({ shown: [...s.shown, { id, player, emoji }] }));
  setTimeout(
    () => useReactions.setState((s) => ({ shown: s.shown.filter((x) => x.id !== id) })),
    2200,
  );
}

export function joinReactions(code: string, player: PlayerId): void {
  leaveReactions();
  me = player;
  channel = supabase()
    .channel(`room:${code}`, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const p = payload as { player?: unknown; emoji?: unknown };
      if (typeof p.player === 'string' && typeof p.emoji === 'string') {
        show(p.player as PlayerId, p.emoji);
      }
    })
    .subscribe();
}

export function leaveReactions(): void {
  if (channel) void supabase().removeChannel(channel);
  channel = null;
  me = null;
}

export function sendReaction(emoji: (typeof REACTIONS)[number]): void {
  if (!channel || !me) return;
  show(me, emoji);
  void channel.send({ type: 'broadcast', event: 'reaction', payload: { player: me, emoji } });
}

export function reactionsActive(): boolean {
  return channel !== null;
}
