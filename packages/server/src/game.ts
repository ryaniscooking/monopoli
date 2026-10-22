// Server-authoritative game loop (spec 10.6, 10.7): validate with the engine, run bots, commit.
import {
  applyAction,
  botsToAct,
  createCryptoRng,
  decide,
  getPendingActors,
  resolveMap,
  setControlledBy,
  somethingDue,
  type Action,
  type GameEvent,
  type GameSecrets,
  type GameState,
  type PlayerId,
  type ResolvedMap,
} from '@monopoli/engine';
import { RAW_MAPS } from '@monopoli/maps';
import {
  getGame,
  getRoom,
  getSeats,
  getSecrets,
  playerIdOfSeat,
  rateLimit,
  seatOfPlayer,
  type Admin,
  type SeatRow,
} from './db';
import { ApiError } from './http';

/** Max actions applied in one invocation (bots included); leftovers finish on the next tick. */
const MAX_STEPS = 200;

const rng = createCryptoRng((buf) => crypto.getRandomValues(buf));
const mapCache = new Map<string, ResolvedMap>();

export function loadMap(mapId: string): ResolvedMap {
  let map = mapCache.get(mapId);
  if (!map) {
    const raw = RAW_MAPS[mapId];
    if (!raw) throw new ApiError('BAD_REQUEST', `Unknown map ${mapId}`);
    map = resolveMap(raw);
    mapCache.set(mapId, map);
  }
  return map;
}

interface Working {
  map: ResolvedMap;
  state: GameState;
  secrets: GameSecrets;
  events: GameEvent[];
}

function apply(w: Working, actor: PlayerId | 'system', action: Action, now: number): boolean {
  const res = applyAction({ map: w.map, rng, now }, w.state, w.secrets, actor, action);
  if (!res.ok) return false;
  w.state = res.state;
  w.secrets = res.secrets;
  w.events.push(...res.events);
  return true;
}

/** Let bot-controlled seats act (and the clock run) until a human must decide. */
export function runBots(w: Working, now: number): void {
  for (let step = 0; step < MAX_STEPS && w.state.phase !== 'game_over'; step++) {
    if (somethingDue(w.state, now)) {
      apply(w, 'system', { type: 'system_timeout' }, now);
      continue;
    }
    const bot = botsToAct(w.map, w.state)[0];
    if (!bot) return;
    const p = w.state.players.find((x) => x.id === bot);
    const level = p?.botLevel ?? w.state.settings.takeoverBotLevel;
    const action = decide({ map: w.map, state: w.state }, bot, level, rng);
    if (!apply(w, bot, action, now)) {
      console.error('bot produced an illegal action', bot, action);
      return;
    }
  }
}

/** Atomic commit through the commit_game RPC (idempotency + version check + events). */
export async function commit(
  db: Admin,
  roomId: string,
  expectedVersion: number,
  w: Working,
  clientActionId: string | null,
  userId: string | null,
): Promise<number> {
  const res = await db.rpc('commit_game', {
    p_room: roomId,
    p_expected_version: expectedVersion,
    p_state: w.state,
    p_chance_order: w.secrets.chanceOrder,
    p_chest_order: w.secrets.chestOrder,
    p_events: w.events,
    p_turn_deadline: w.state.turnDeadline ? new Date(w.state.turnDeadline).toISOString() : null,
    p_client_action_id: clientActionId,
    p_user: userId,
    p_room_status: w.state.phase === 'game_over' ? 'finished' : null,
  });
  if (res.error) {
    if (res.error.message.includes('STALE_VERSION')) throw new ApiError('STALE', 'Stale version');
    if (res.error.message.includes('DUPLICATE_ACTION')) {
      throw new ApiError('DUPLICATE', 'This action was already applied');
    }
    throw new ApiError('INTERNAL', res.error.message);
  }
  return res.data as number;
}

async function memberSeat(db: Admin, roomId: string, userId: string) {
  const seats = await getSeats(db, roomId);
  const seat = seats.find((s) => s.user_id === userId);
  if (!seat) throw new ApiError('NOT_MEMBER', 'You are not in this room');
  return { seats, seat };
}

async function touch(db: Admin, seat: SeatRow): Promise<void> {
  await db
    .from('room_players')
    .update({ last_seen: new Date().toISOString(), connected: true })
    .eq('room_id', seat.room_id)
    .eq('seat', seat.seat);
}

/** game-action (spec 10.6). */
export async function gameAction(
  db: Admin,
  userId: string,
  body: { roomId: string; clientActionId: string; expectedVersion: number; action: Action },
) {
  await rateLimit(db, userId, 'action:s', 10, 1);
  await rateLimit(db, userId, 'action:m', 180, 60);
  const { seats, seat } = await memberSeat(db, body.roomId, userId);
  const room = await getRoom(db, body.roomId);
  if (room.status !== 'playing') throw new ApiError('NOT_STARTED', 'The game is not running');
  // Idempotency first (spec 11.5): a replayed or double-submitted action id never runs twice.
  const seen = await db
    .from('action_log')
    .select('client_action_id')
    .eq('room_id', body.roomId)
    .eq('client_action_id', body.clientActionId)
    .maybeSingle();
  const game = await getGame(db, body.roomId);
  if (seen.data) {
    // A client retrying after a lost response treats this as success and resyncs.
    throw new ApiError('DUPLICATE', 'This action was already applied', {
      version: game.version,
      state: game.state,
    });
  }
  if (game.version !== body.expectedVersion) {
    throw new ApiError('STALE', 'The game moved on', { version: game.version, state: game.state });
  }
  const actor = playerIdOfSeat(seats, seat.seat); // identity from the JWT only (spec 11.2)
  const w: Working = {
    map: loadMap(room.map_id),
    state: game.state,
    secrets: await getSecrets(db, body.roomId),
    events: [],
  };
  const now = Date.now(); // server time only (spec 11.6)
  const res = applyAction({ map: w.map, rng, now }, w.state, w.secrets, actor, body.action);
  if (!res.ok) throw new ApiError('ILLEGAL_ACTION', res.error.message);
  w.state = res.state;
  w.secrets = res.secrets;
  w.events.push(...res.events);
  runBots(w, now);
  const version = await commit(db, body.roomId, game.version, w, body.clientActionId, userId);
  await touch(db, seat);
  return { version, state: w.state, events: w.events };
}

/**
 * game-tick (spec 10.7): heartbeat, reclaim, disconnect takeover, deadlines, leftover bot work.
 * Any member may call it; the server re-checks everything.
 */
export async function gameTick(db: Admin, userId: string, roomId: string) {
  await rateLimit(db, userId, 'tick', 40, 60);
  const { seats, seat } = await memberSeat(db, roomId, userId);
  await touch(db, seat);
  const room = await getRoom(db, roomId);
  if (room.status !== 'playing') return { version: null, changed: false };

  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await getGame(db, roomId);
    const now = Date.now();
    const w: Working = {
      map: loadMap(room.map_id),
      state: game.state,
      secrets: await getSecrets(db, roomId),
      events: [],
    };
    const seatUpdates: { seat: number; controlled_by: 'human' | 'bot'; connected: boolean }[] = [];
    const control = (player: PlayerId, who: 'human' | 'bot') => {
      const r = setControlledBy(w.state, player, who);
      if (r.events.length === 0) return;
      w.state = r.state;
      w.events.push(...r.events);
      const s = seatOfPlayer(seats, player);
      if (s) seatUpdates.push({ seat: s.seat, controlled_by: who, connected: who === 'human' });
    };

    // Reclaim: the caller is back, so their seat returns to them.
    const me = playerIdOfSeat(seats, seat.seat);
    if (w.state.players.find((p) => p.id === me)?.controlledBy === 'bot') control(me, 'human');

    // Takeover: a needed human seat silent for longer than the grace period.
    const grace = w.state.settings.disconnectGraceSec * 1000;
    for (const player of getPendingActors(w.state)) {
      const s = seatOfPlayer(seats, player);
      if (!s || s.is_bot || s.user_id === userId) continue;
      if (now - Date.parse(s.last_seen) > grace) control(player, 'bot');
    }

    runBots(w, now);
    if (w.events.length === 0) return { version: game.version, changed: false };
    try {
      const version = await commit(db, roomId, game.version, w, null, null);
      for (const u of seatUpdates) {
        await db
          .from('room_players')
          .update({ controlled_by: u.controlled_by, connected: u.connected })
          .eq('room_id', roomId)
          .eq('seat', u.seat);
      }
      return { version, changed: true };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'STALE') continue; // someone else committed; retry
      throw e;
    }
  }
  return { version: null, changed: false };
}
