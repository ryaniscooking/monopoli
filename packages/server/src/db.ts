// Database access with the service role (bypasses RLS). Never used with client credentials.
import type { BotLevel, GameSecrets, GameState, PlayerId } from '@monopoli/engine';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './http';

export interface ServerEnv {
  url: string;
  /** Secret (service role) key. Injected by the Edge runtime; never sent to clients. */
  secretKey: string;
}

export type Admin = SupabaseClient;

export function adminClient(env: ServerEnv): Admin {
  return createClient(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'finished' | 'closed';
  map_id: string;
  settings: { preset: 'official' | 'house'; house: Record<string, unknown> };
  updated_at: string;
}

export interface SeatRow {
  room_id: string;
  seat: number;
  user_id: string | null;
  nickname: string;
  token: string;
  color: string;
  is_bot: boolean;
  bot_level: BotLevel | null;
  controlled_by: 'human' | 'bot';
  ready: boolean;
  connected: boolean;
  last_seen: string;
  timeouts: number;
}

export interface GameRow {
  room_id: string;
  version: number;
  state: GameState;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new ApiError('INTERNAL', `${what}: ${res.error.message}`);
  if (res.data === null) throw new ApiError('NOT_FOUND', `${what} not found`);
  return res.data;
}

export async function getRoom(db: Admin, roomId: string): Promise<RoomRow> {
  return check(await db.from('rooms').select('*').eq('id', roomId).maybeSingle<RoomRow>(), 'Room');
}

export async function getRoomByCode(db: Admin, code: string): Promise<RoomRow> {
  return check(await db.from('rooms').select('*').eq('code', code).maybeSingle<RoomRow>(), 'Room');
}

export async function getSeats(db: Admin, roomId: string): Promise<SeatRow[]> {
  const res = await db.from('room_players').select('*').eq('room_id', roomId).order('seat');
  if (res.error) throw new ApiError('INTERNAL', res.error.message);
  return (res.data ?? []) as SeatRow[];
}

export async function getGame(db: Admin, roomId: string): Promise<GameRow> {
  return check(
    await db
      .from('games')
      .select('room_id, version, state')
      .eq('room_id', roomId)
      .maybeSingle<GameRow>(),
    'Game',
  );
}

export async function getSecrets(db: Admin, roomId: string): Promise<GameSecrets> {
  const row = check(
    await db
      .from('game_secrets')
      .select('chance_order, chest_order')
      .eq('room_id', roomId)
      .maybeSingle<{ chance_order: string[]; chest_order: string[] }>(),
    'Game secrets',
  );
  return { chanceOrder: row.chance_order, chestOrder: row.chest_order };
}

/** Seats in order map to engine players p0, p1, ... (fixed once the game starts). */
export function playerIdOfSeat(seats: SeatRow[], seat: number): PlayerId {
  const index = [...seats].sort((a, b) => a.seat - b.seat).findIndex((s) => s.seat === seat);
  if (index < 0) throw new ApiError('NOT_MEMBER', 'Seat not found');
  return `p${index}` as PlayerId;
}

export function seatOfPlayer(seats: SeatRow[], player: PlayerId): SeatRow | undefined {
  return [...seats].sort((a, b) => a.seat - b.seat)[Number(player.slice(1))];
}

/** Allowed? Fixed-window counter in Postgres (spec 11.8). */
export async function rateLimit(
  db: Admin,
  userId: string,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const res = await db.rpc('hit_rate_limit', {
    p_user: userId,
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (res.error) throw new ApiError('INTERNAL', res.error.message);
  if (res.data !== true) throw new ApiError('RATE_LIMITED', 'Too many requests, slow down');
}
