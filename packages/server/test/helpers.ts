import type { Action, GameState, PlayerId } from '@monopoli/engine';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';

export interface Reply<T = Record<string, unknown>> {
  status: number;
  body: T & { code?: string; message?: string };
}

/** A signed-in anonymous player with helpers to call the Edge Functions. */
export class Player {
  private constructor(
    readonly client: SupabaseClient,
    readonly token: string,
    readonly userId: string,
  ) {}

  static async signIn(): Promise<Player> {
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session || !data.user) throw new Error(`sign-in failed: ${error?.message}`);
    return new Player(client, data.session.access_token, data.user.id);
  }

  /** POST to an Edge Function; one retry on a 5xx (a recycled worker), like the app does. */
  async call<T = Record<string, unknown>>(fn: string, body: unknown): Promise<Reply<T>> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          apikey: publishable,
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status >= 500 && attempt === 0) {
        console.log(`retrying ${fn} after ${res.status}: ${(await res.text()).slice(0, 160)}`);
        continue;
      }
      return { status: res.status, body: (await res.json()) as Reply<T>['body'] };
    }
  }

  /** The game row as this player can read it (RLS). */
  async game(roomId: string): Promise<{ version: number; state: GameState }> {
    const { data, error } = await this.client
      .from('games')
      .select('version, state')
      .eq('room_id', roomId)
      .single();
    if (error) throw new Error(error.message);
    return data as { version: number; state: GameState };
  }

  /** Send an action; a DUPLICATE after a retried lost response counts as success (like the app). */
  async act(roomId: string, action: Action, expectedVersion?: number) {
    const version = expectedVersion ?? (await this.game(roomId)).version;
    const res = await this.call<{ version: number; state: GameState }>('game-action', {
      roomId,
      clientActionId: crypto.randomUUID(),
      expectedVersion: version,
      action,
    });
    if (res.body.code === 'DUPLICATE') {
      const g = await this.game(roomId);
      return { status: 200, body: { version: g.version, state: g.state } };
    }
    return res;
  }
}

/** Service-role client for test setup only (e.g. ageing last_seen). Local dev key. */
export const admin = createClient(url, secret, { auth: { persistSession: false } });

export const official = { preset: 'official', house: {} } as const;

/** Create a room as `host`, seat `others`, add bots, start. */
export async function startedRoom(
  host: Player,
  others: Player[],
  opts: { bots?: ('easy' | 'normal' | 'hard')[]; rules?: unknown; mapId?: string } = {},
) {
  const created = await host.call<{ roomId: string; code: string }>('create-room', {
    mapId: opts.mapId ?? 'dubai',
    nickname: 'Host',
    rules: opts.rules ?? official,
  });
  if (created.status !== 200) throw new Error(JSON.stringify(created.body));
  const { roomId, code } = created.body;
  for (const [i, p] of others.entries()) {
    const joined = await p.call('join-room', { code, nickname: `Guest ${i + 1}` });
    if (joined.status !== 200) throw new Error(JSON.stringify(joined.body));
    await p.call('set-ready', { roomId, ready: true });
  }
  for (const level of opts.bots ?? []) {
    await host.call('update-room', { roomId, patch: { addBot: { level } } });
  }
  const started = await host.call('start-game', { roomId });
  if (started.status !== 200) throw new Error(JSON.stringify(started.body));
  return { roomId, code };
}

/** The seat-ordered player id of a user in a room. */
export async function playerIdOf(roomId: string, userId: string): Promise<PlayerId> {
  const { data } = await admin
    .from('room_players')
    .select('seat, user_id')
    .eq('room_id', roomId)
    .order('seat');
  const index = (data ?? []).findIndex((r) => r.user_id === userId);
  return `p${index}` as PlayerId;
}
