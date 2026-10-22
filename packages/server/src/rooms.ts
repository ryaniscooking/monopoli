// Rooms and lobby (spec 10.1, 10.2, 10.5).
import {
  createGame,
  makeSettings,
  setControlledBy,
  type ResolvedMap,
  type RuleSettings,
  type SeatInit,
} from '@monopoli/engine';
import { commit, loadMap, runBots } from './game';
import {
  getGame,
  getRoom,
  getRoomByCode,
  getSeats,
  getSecrets,
  playerIdOfSeat,
  rateLimit,
  type Admin,
  type RoomRow,
  type SeatRow,
} from './db';
import { ApiError } from './http';
import type { RoomRulesInput } from './schemas';

/** Spec 10.2: no I, L, O, 0, 1. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_OPEN_ROOMS = 3;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function settingsOf(rules: RoomRulesInput | RoomRow['settings']): RuleSettings {
  return makeSettings(rules.preset, rules.house as Partial<RuleSettings>);
}

function freeToken(map: ResolvedMap, seats: SeatRow[]): string {
  const used = new Set(seats.map((s) => s.token));
  return (map.tokens.find((t) => !used.has(t.id)) ?? map.tokens[0])?.id ?? 'token';
}

function freeColor(map: ResolvedMap, seats: SeatRow[]): string {
  const used = new Set(seats.map((s) => s.color.toLowerCase()));
  return map.theme.playerColors.find((c) => !used.has(c.toLowerCase())) ?? '#888888';
}

function freeSeat(seats: SeatRow[]): number {
  for (let i = 0; i < 6; i++) if (!seats.some((s) => s.seat === i)) return i;
  throw new ApiError('ROOM_FULL', 'This room is full');
}

async function insertSeat(db: Admin, row: Partial<SeatRow> & { room_id: string; seat: number }) {
  const res = await db.from('room_players').insert(row);
  if (res.error) throw new ApiError('INTERNAL', res.error.message);
}

async function bump(db: Admin, roomId: string, patch: Record<string, unknown> = {}) {
  await db
    .from('rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', roomId);
}

async function requireHost(db: Admin, roomId: string, userId: string): Promise<RoomRow> {
  const room = await getRoom(db, roomId);
  if (room.host_id !== userId) throw new ApiError('NOT_HOST', 'Only the host can do that'); // spec 11.9
  return room;
}

export async function createRoom(
  db: Admin,
  userId: string,
  body: { mapId: string; nickname: string; rules: RoomRulesInput },
) {
  await rateLimit(db, userId, 'create', 10, 3600);
  const map = loadMap(body.mapId);
  settingsOf(body.rules);
  const open = await db
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('host_id', userId)
    .in('status', ['lobby', 'playing']);
  if ((open.count ?? 0) >= MAX_OPEN_ROOMS) {
    throw new ApiError('TOO_MANY_ROOMS', `You can host at most ${MAX_OPEN_ROOMS} open rooms`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const res = await db
      .from('rooms')
      .insert({ code, host_id: userId, map_id: map.id, settings: body.rules })
      .select('*')
      .single<RoomRow>();
    if (res.error) {
      if (res.error.code === '23505') continue; // code taken, try another
      throw new ApiError('INTERNAL', res.error.message);
    }
    await insertSeat(db, {
      room_id: res.data.id,
      seat: 0,
      user_id: userId,
      nickname: body.nickname,
      token: freeToken(map, []),
      color: freeColor(map, []),
      ready: true,
    });
    return { roomId: res.data.id, code };
  }
  throw new ApiError('INTERNAL', 'Could not allocate a room code');
}

export async function joinRoom(
  db: Admin,
  userId: string,
  body: { code: string; nickname: string },
) {
  await rateLimit(db, userId, 'join', 10, 60);
  const room = await getRoomByCode(db, body.code);
  if (room.status === 'closed' || room.status === 'finished') {
    throw new ApiError('NOT_FOUND', 'This room has closed');
  }
  const seats = await getSeats(db, room.id);
  const mine = seats.find((s) => s.user_id === userId);
  if (mine) {
    // Returning player: reclaim the seat (spec 10.7).
    await db
      .from('room_players')
      .update({ connected: true, last_seen: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('seat', mine.seat);
    if (room.status === 'playing') await reclaim(db, room, seats, mine);
    return { roomId: room.id, code: room.code, seat: mine.seat };
  }
  if (room.status !== 'lobby')
    throw new ApiError('ALREADY_STARTED', 'This game has already started');
  const map = loadMap(room.map_id);
  const seat = freeSeat(seats);
  await insertSeat(db, {
    room_id: room.id,
    seat,
    user_id: userId,
    nickname: body.nickname,
    token: freeToken(map, seats),
    color: freeColor(map, seats),
  });
  await bump(db, room.id);
  return { roomId: room.id, code: room.code, seat };
}

async function reclaim(db: Admin, room: RoomRow, seats: SeatRow[], seat: SeatRow) {
  const game = await getGame(db, room.id);
  const player = playerIdOfSeat(seats, seat.seat);
  const r = setControlledBy(game.state, player, 'human');
  if (r.events.length === 0) return;
  const w = {
    map: loadMap(room.map_id),
    state: r.state,
    secrets: await getSecrets(db, room.id),
    events: r.events,
  };
  try {
    await commit(db, room.id, game.version, w, null, null);
    await db
      .from('room_players')
      .update({ controlled_by: 'human' })
      .eq('room_id', room.id)
      .eq('seat', seat.seat);
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'STALE')) throw e; // next tick reclaims instead
  }
}

export async function leaveRoom(db: Admin, userId: string, roomId: string) {
  const room = await getRoom(db, roomId);
  const seats = await getSeats(db, roomId);
  const mine = seats.find((s) => s.user_id === userId);
  if (!mine) throw new ApiError('NOT_MEMBER', 'You are not in this room');

  if (room.status === 'lobby') {
    await db.from('room_players').delete().eq('room_id', roomId).eq('seat', mine.seat);
    const humans = seats.filter((s) => s.user_id && s.user_id !== userId);
    if (room.host_id === userId) {
      const next = humans[0];
      if (next?.user_id) await bump(db, roomId, { host_id: next.user_id });
      else await bump(db, roomId, { status: 'closed' });
    } else {
      await bump(db, roomId);
    }
    return { left: true };
  }

  if (room.status === 'playing') {
    // In a game the seat stays and a bot plays it (spec 10.5).
    const game = await getGame(db, roomId);
    const player = playerIdOfSeat(seats, mine.seat);
    const r = setControlledBy(game.state, player, 'bot');
    const w = {
      map: loadMap(room.map_id),
      state: r.state,
      secrets: await getSecrets(db, roomId),
      events: r.events,
    };
    runBots(w, Date.now());
    if (w.events.length > 0) await commit(db, roomId, game.version, w, null, null);
    await db
      .from('room_players')
      .update({ controlled_by: 'bot', connected: false })
      .eq('room_id', roomId)
      .eq('seat', mine.seat);
  }
  return { left: true };
}

export async function updateRoom(
  db: Admin,
  userId: string,
  body: {
    roomId: string;
    patch: {
      mapId?: string;
      rules?: RoomRulesInput;
      addBot?: { level: 'easy' | 'normal' | 'hard' };
      removeSeat?: number;
      me?: { nickname?: string; token?: string; color?: string };
    };
  },
) {
  const room = await getRoom(db, body.roomId);
  if (room.status !== 'lobby') throw new ApiError('ALREADY_STARTED', 'The game has started');
  const seats = await getSeats(db, body.roomId);
  const mine = seats.find((s) => s.user_id === userId);
  if (!mine) throw new ApiError('NOT_MEMBER', 'You are not in this room');
  const { patch } = body;
  const hostOnly = patch.mapId || patch.rules || patch.addBot || patch.removeSeat !== undefined;
  if (hostOnly) await requireHost(db, body.roomId, userId);
  let map = loadMap(room.map_id);

  if (patch.mapId && patch.mapId !== room.map_id) {
    map = loadMap(patch.mapId);
    await bump(db, room.id, { map_id: map.id });
    // Tokens are per map: give everyone a token of the new map.
    const assigned: SeatRow[] = [];
    for (const s of seats) {
      const token = freeToken(map, assigned);
      assigned.push({ ...s, token });
      await db.from('room_players').update({ token }).eq('room_id', room.id).eq('seat', s.seat);
    }
  }
  if (patch.rules) {
    settingsOf(patch.rules);
    await bump(db, room.id, { settings: patch.rules });
  }
  if (patch.addBot) {
    const seat = freeSeat(seats);
    const usedNames = new Set(seats.map((s) => s.nickname));
    await insertSeat(db, {
      room_id: room.id,
      seat,
      user_id: null,
      nickname: map.botNames.find((n) => !usedNames.has(n)) ?? `Bot ${seat + 1}`,
      token: freeToken(map, seats),
      color: freeColor(map, seats),
      is_bot: true,
      bot_level: patch.addBot.level,
      controlled_by: 'bot',
      ready: true,
    });
  }
  if (patch.removeSeat !== undefined) {
    if (patch.removeSeat === mine.seat)
      throw new ApiError('BAD_REQUEST', 'Use leave-room to leave');
    await db.from('room_players').delete().eq('room_id', room.id).eq('seat', patch.removeSeat);
  }
  if (patch.me) {
    const others = seats.filter((s) => s.seat !== mine.seat);
    const update: Record<string, string> = {};
    if (patch.me.nickname) update.nickname = patch.me.nickname;
    if (patch.me.token) {
      if (!map.tokens.some((t) => t.id === patch.me?.token))
        throw new ApiError('BAD_REQUEST', 'Unknown token');
      if (others.some((s) => s.token === patch.me?.token))
        throw new ApiError('BAD_REQUEST', 'Token taken');
      update.token = patch.me.token;
    }
    if (patch.me.color) {
      const c = patch.me.color.toLowerCase();
      if (!map.theme.playerColors.some((x) => x.toLowerCase() === c))
        throw new ApiError('BAD_REQUEST', 'Unknown color');
      if (others.some((s) => s.color.toLowerCase() === c))
        throw new ApiError('BAD_REQUEST', 'Color taken');
      update.color = patch.me.color;
    }
    if (Object.keys(update).length > 0) {
      await db.from('room_players').update(update).eq('room_id', room.id).eq('seat', mine.seat);
    }
  }
  await bump(db, room.id);
  return { ok: true };
}

export async function setReady(
  db: Admin,
  userId: string,
  body: { roomId: string; ready: boolean },
) {
  const room = await getRoom(db, body.roomId);
  if (room.status !== 'lobby') throw new ApiError('ALREADY_STARTED', 'The game has started');
  const res = await db
    .from('room_players')
    .update({ ready: body.ready })
    .eq('room_id', body.roomId)
    .eq('user_id', userId)
    .select('seat');
  if (res.error) throw new ApiError('INTERNAL', res.error.message);
  if (!res.data?.length) throw new ApiError('NOT_MEMBER', 'You are not in this room');
  await bump(db, body.roomId);
  return { ok: true };
}

export async function startGame(db: Admin, userId: string, roomId: string) {
  const room = await requireHost(db, roomId, userId);
  if (room.status !== 'lobby') throw new ApiError('ALREADY_STARTED', 'The game has started');
  const seats = await getSeats(db, roomId);
  if (seats.length < 2 || seats.length > 6)
    throw new ApiError('NOT_READY', 'A game needs 2-6 players');
  if (seats.some((s) => !s.is_bot && s.user_id !== userId && !s.ready)) {
    throw new ApiError('NOT_READY', 'Everyone must be ready');
  }
  const map = loadMap(room.map_id);
  const settings = settingsOf(room.settings);
  const now = Date.now();
  const rng = { nextUint32: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 };
  const inits: SeatInit[] = seats.map((s) => ({
    name: s.nickname,
    token: s.token,
    color: s.color,
    kind: s.is_bot ? 'bot' : 'human',
    ...(s.is_bot ? { botLevel: s.bot_level ?? 'normal' } : {}),
  }));
  const created = createGame(map, settings, inits, rng, now);

  const g = await db.from('games').insert({ room_id: roomId, version: 0, state: created.state });
  if (g.error) {
    if (g.error.code === '23505') throw new ApiError('ALREADY_STARTED', 'The game has started');
    throw new ApiError('INTERNAL', g.error.message);
  }
  const sec = await db.from('game_secrets').insert({
    room_id: roomId,
    chance_order: created.secrets.chanceOrder,
    chest_order: created.secrets.chestOrder,
  });
  if (sec.error) throw new ApiError('INTERNAL', sec.error.message);

  // Version 1: the opening events, plus any bot turns before a human must act.
  const w = { map, state: created.state, secrets: created.secrets, events: [...created.events] };
  runBots(w, now);
  const version = await commit(db, roomId, 0, w, null, null);
  await bump(db, roomId, { status: 'playing' });
  return { version };
}
