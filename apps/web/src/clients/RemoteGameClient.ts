// Online play (spec 10.8, 12.7): intents go to the game-action Edge Function; the authoritative
// state arrives from the server (response or Realtime), events replay as animations.
import type { Action, GameEvent, GameState, PlayerId, ResolvedMap } from '@monopoli/engine';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { callFunction, OnlineError, supabase } from '../online/supabase';
import type { GameClient, GameListener } from './GameClient';

const HEARTBEAT_MS = 10_000;

export class RemoteGameClient implements GameClient {
  private listeners = new Set<GameListener>();
  private channel: RealtimeChannel | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Serializes resyncs so batches are emitted in version order. */
  private syncing: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(
    readonly map: ResolvedMap,
    readonly me: PlayerId,
    readonly roomId: string,
    readonly code: string,
    private current: GameState,
    private version: number,
  ) {}

  static async connect(map: ResolvedMap, roomId: string, code: string, me: PlayerId) {
    const { data, error } = await supabase()
      .from('games')
      .select('version, state')
      .eq('room_id', roomId)
      .single<{ version: number; state: GameState }>();
    if (error || !data) throw new OnlineError('NOT_FOUND', error?.message ?? 'Game not found');
    const client = new RemoteGameClient(map, me, roomId, code, data.state, data.version);
    client.listen();
    return client;
  }

  get state(): GameState {
    return this.current;
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispatch(action: Action): Promise<void> {
    try {
      const res = await callFunction<{ version: number; state: GameState; events: GameEvent[] }>(
        'game-action',
        {
          roomId: this.roomId,
          clientActionId: crypto.randomUUID(),
          expectedVersion: this.version,
          action,
        },
      );
      this.accept(res.version, res.state, res.events);
    } catch (e) {
      // Someone else moved first, or our earlier attempt already landed: catch up, no error.
      if (e instanceof OnlineError && (e.code === 'STALE' || e.code === 'DUPLICATE')) {
        await this.resync();
        return;
      }
      throw e;
    }
  }

  /** Heartbeat / deadline tick (spec 10.7). The server re-checks everything. */
  async tick(): Promise<boolean> {
    if (this.closed) return false;
    try {
      const res = await callFunction<{ version: number | null }>('game-tick', {
        roomId: this.roomId,
      });
      if (res.version !== null && res.version > this.version) await this.resync();
      return true;
    } catch {
      return false; // offline: the next heartbeat retries
    }
  }

  nextDeadline(): number | null {
    const s = this.current;
    if (s.phase === 'game_over') return null;
    const times = [
      s.pending?.kind === 'auction' ? s.pending.deadline : null,
      ...s.trades.map((t) => t.expiresAt),
      s.endsAt !== null && !s.lastRoundPending ? s.endsAt : null,
      s.turnDeadline,
    ].filter((t): t is number => t !== null);
    return times.length > 0 ? Math.min(...times) + 300 : null; // a little after, server time rules
  }

  /** Leave the game: a bot takes over this seat (spec 10.5). */
  async leave(): Promise<void> {
    await callFunction('leave-room', { roomId: this.roomId }).catch(() => undefined);
    this.close();
  }

  /** Stop listening without leaving (e.g. app closed); the seat can be reclaimed later. */
  close(): void {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.channel) void supabase().removeChannel(this.channel);
    this.channel = null;
    this.listeners.clear();
  }

  private listen(): void {
    this.channel = supabase()
      .channel(`game:${this.roomId}:${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `room_id=eq.${this.roomId}` },
        (payload) => {
          const v = (payload.new as { version?: number }).version ?? 0;
          if (v > this.version) void this.resync();
        },
      )
      .subscribe((status) => {
        // (Re)connected: fetch anything missed while away (spec 10.8).
        if (status === 'SUBSCRIBED') void this.resync();
      });
    this.heartbeat = setInterval(() => void this.tick(), HEARTBEAT_MS);
    void this.tick();
  }

  private accept(version: number, state: GameState, events: GameEvent[]): void {
    if (version <= this.version) return;
    this.version = version;
    this.current = state;
    for (const l of this.listeners) l(state, events);
  }

  /** Fetch the latest state and every event since our version, as one animation batch. */
  resync(): Promise<void> {
    this.syncing = this.syncing.then(async () => {
      if (this.closed) return;
      const sb = supabase();
      const game = await sb
        .from('games')
        .select('version, state')
        .eq('room_id', this.roomId)
        .single<{ version: number; state: GameState }>();
      if (game.error || !game.data || game.data.version <= this.version) return;
      const evs = await sb
        .from('game_events')
        .select('event')
        .eq('room_id', this.roomId)
        .gt('version', this.version)
        .lte('version', game.data.version)
        .order('version')
        .order('seq');
      const events = (evs.data ?? []).map((r) => (r as { event: GameEvent }).event);
      this.accept(game.data.version, game.data.state, events);
    });
    return this.syncing;
  }
}
