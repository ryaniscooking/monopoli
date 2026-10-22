// Edge Function router: one handler per function name (spec 10.5).
// Every function: CORS, JWT -> user (never trust ids in the body), zod-validated body.
import type { z } from 'zod';
import { adminClient, type Admin, type ServerEnv } from './db';
import { gameAction, gameTick } from './game';
import { ApiError, corsHeaders, errorResponse, json } from './http';
import { createRoom, joinRoom, leaveRoom, setReady, startGame, updateRoom } from './rooms';
import { CreateRoom, GameAction, JoinRoom, RoomOnly, SetReady, UpdateRoom } from './schemas';

export type { ServerEnv } from './db';

type Handler = (db: Admin, userId: string, body: unknown) => Promise<unknown>;

function route<S extends z.ZodType>(
  schema: S,
  fn: (db: Admin, userId: string, body: z.infer<S>) => Promise<unknown>,
): Handler {
  return async (db, userId, raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        'BAD_REQUEST',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return fn(db, userId, parsed.data);
  };
}

export const FUNCTIONS: Record<string, Handler> = {
  'create-room': route(CreateRoom, createRoom),
  'join-room': route(JoinRoom, joinRoom),
  'leave-room': route(RoomOnly, (db, u, b) => leaveRoom(db, u, b.roomId)),
  'update-room': route(UpdateRoom, updateRoom),
  'set-ready': route(SetReady, setReady),
  'start-game': route(RoomOnly, (db, u, b) => startGame(db, u, b.roomId)),
  'game-action': route(GameAction, gameAction),
  'game-tick': route(RoomOnly, (db, u, b) => gameTick(db, u, b.roomId)),
};

/** The caller's user id from their JWT (spec 11.2). */
async function callerId(db: Admin, req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ApiError('UNAUTHORIZED', 'Sign in first');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ApiError('UNAUTHORIZED', 'Your session is not valid');
  return data.user.id;
}

export async function handle(name: string, req: Request, env: ServerEnv): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') throw new ApiError('BAD_REQUEST', 'Use POST');
    const handler = FUNCTIONS[name];
    if (!handler) throw new ApiError('NOT_FOUND', `Unknown function ${name}`);
    const db = adminClient(env);
    const userId = await callerId(db, req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError('BAD_REQUEST', 'Body must be JSON');
    }
    return json(await handler(db, userId, body));
  } catch (e) {
    return errorResponse(e);
  }
}
