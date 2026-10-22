// Lobby state and the online session flow (spec 10.1, 12.1.3).
import type { BotLevel, PlayerId, RuleSettings } from '@monopoli/engine';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { RemoteGameClient } from '../clients/RemoteGameClient';
import { applyTheme, getMap, MAPS } from '../game/maps';
import { startTable } from '../game/table';
import { useUi } from '../store/ui';
import { joinReactions } from './reactions';
import { callFunction, ensureSession, supabase } from './supabase';

export interface RoomRules {
  preset: RuleSettings['preset'];
  house: Partial<RuleSettings>;
}

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'finished' | 'closed';
  map_id: string;
  settings: RoomRules;
}

export interface SeatRow {
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
}

interface LobbyState {
  userId: string | null;
  room: RoomRow | null;
  seats: SeatRow[];
  busy: boolean;
  error: string | null;
}

export const useLobby = create<LobbyState>()(() => ({
  userId: null,
  room: null,
  seats: [],
  busy: false,
  error: null,
}));

const LAST_ROOM_KEY = 'monopoli:lastRoom';
let channel: RealtimeChannel | null = null;

/** The room to offer "Rejoin" for on Home (a game this device was playing). */
export function lastRoom(): { roomId: string; code: string } | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY);
    return raw ? (JSON.parse(raw) as { roomId: string; code: string }) : null;
  } catch {
    return null;
  }
}

function rememberRoom(room: { roomId: string; code: string } | null) {
  try {
    if (room) localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(room));
    else localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  useLobby.setState({ busy: true, error: null });
  try {
    return await fn();
  } catch (e) {
    useLobby.setState({ error: e instanceof Error ? e.message : String(e) });
    return undefined;
  } finally {
    useLobby.setState({ busy: false });
  }
}

async function refresh(roomId: string): Promise<void> {
  const sb = supabase();
  const [room, seats] = await Promise.all([
    sb.from('rooms').select('*').eq('id', roomId).maybeSingle<RoomRow>(),
    sb.from('room_players').select('*').eq('room_id', roomId).order('seat'),
  ]);
  const me = useLobby.getState().userId;
  const seatRows = (seats.data ?? []) as SeatRow[];
  if (!room.data || !seatRows.some((s) => s.user_id === me)) {
    // Kicked, or the room closed.
    closeLobby();
    useLobby.setState({ error: 'You are no longer in that room.' });
    useUi.getState().go('online');
    return;
  }
  useLobby.setState({ room: room.data, seats: seatRows });
  const map = MAPS[room.data.map_id];
  if (map) applyTheme(map);
  if (room.data.status === 'playing' && useUi.getState().screen !== 'game') {
    await enterGame(room.data.id, room.data.code);
  }
}

async function openLobby(roomId: string, code: string): Promise<void> {
  closeLobby();
  rememberRoom({ roomId, code });
  channel = supabase()
    .channel(`lobby:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      () => void refresh(roomId),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => void refresh(roomId),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void refresh(roomId);
    });
  await refresh(roomId);
  if (useUi.getState().screen !== 'game') useUi.getState().go('lobby');
}

export function closeLobby(): void {
  if (channel) void supabase().removeChannel(channel);
  channel = null;
}

export async function createOnlineRoom(nickname: string, mapId: string, rules: RoomRules) {
  await run(async () => {
    const userId = await ensureSession();
    useLobby.setState({ userId });
    const res = await callFunction<{ roomId: string; code: string }>('create-room', {
      mapId,
      nickname,
      rules,
    });
    await openLobby(res.roomId, res.code);
  });
}

export async function joinOnlineRoom(code: string, nickname: string) {
  await run(async () => {
    const userId = await ensureSession();
    useLobby.setState({ userId });
    const res = await callFunction<{ roomId: string; code: string }>('join-room', {
      code,
      nickname,
    });
    await openLobby(res.roomId, res.code);
  });
}

/** Seats in order map to p0, p1, ... once the game starts (same rule as the server). */
function myPlayerId(seats: SeatRow[], userId: string): PlayerId {
  const index = [...seats].sort((a, b) => a.seat - b.seat).findIndex((s) => s.user_id === userId);
  return `p${Math.max(0, index)}` as PlayerId;
}

let entering: Promise<void> | null = null;

/** Room and seat updates can both report "playing" at once: enter the game only once. */
function enterGame(roomId: string, code: string): Promise<void> {
  entering ??= doEnterGame(roomId, code).finally(() => {
    entering = null;
  });
  return entering;
}

async function doEnterGame(roomId: string, code: string): Promise<void> {
  const { room, seats, userId } = useLobby.getState();
  if (!room || !userId || useUi.getState().screen === 'game') return;
  const map = getMap(room.map_id);
  const me = myPlayerId(seats, userId);
  const client = await RemoteGameClient.connect(map, roomId, code, me);
  closeLobby();
  joinReactions(code, me);
  applyTheme(map);
  startTable(client);
  useUi.getState().selectTile(null);
  useUi.getState().go('game');
}

/** Rejoin the game or lobby this device was last in (seat reclaim, spec 10.7). */
export async function rejoin(nickname: string): Promise<void> {
  const last = lastRoom();
  if (!last) return;
  await joinOnlineRoom(last.code, nickname || 'Player');
}

export function forgetRoom(): void {
  rememberRoom(null);
}

const roomId = () => useLobby.getState().room?.id ?? '';

export const lobbyActions = {
  setReady: (ready: boolean) => run(() => callFunction('set-ready', { roomId: roomId(), ready })),
  addBot: (level: BotLevel) =>
    run(() => callFunction('update-room', { roomId: roomId(), patch: { addBot: { level } } })),
  removeSeat: (seat: number) =>
    run(() => callFunction('update-room', { roomId: roomId(), patch: { removeSeat: seat } })),
  setMap: (mapId: string) =>
    run(() => callFunction('update-room', { roomId: roomId(), patch: { mapId } })),
  setRules: (rules: RoomRules) =>
    run(() => callFunction('update-room', { roomId: roomId(), patch: { rules } })),
  setMe: (me: { nickname?: string; token?: string; color?: string }) =>
    run(() => callFunction('update-room', { roomId: roomId(), patch: { me } })),
  start: () => run(() => callFunction('start-game', { roomId: roomId() })),
  leave: async () => {
    await run(() => callFunction('leave-room', { roomId: roomId() }));
    closeLobby();
    forgetRoom();
    useLobby.setState({ room: null, seats: [] });
    useUi.getState().go('online');
  },
};
