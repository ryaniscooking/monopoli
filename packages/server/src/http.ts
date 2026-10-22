// HTTP helpers shared by every Edge Function: CORS, JSON, structured errors ({ code, message }).

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'NOT_MEMBER'
  | 'NOT_HOST'
  | 'ROOM_FULL'
  | 'ALREADY_STARTED'
  | 'NOT_STARTED'
  | 'NOT_READY'
  | 'TOO_MANY_ROOMS'
  | 'RATE_LIMITED'
  | 'STALE'
  | 'DUPLICATE'
  | 'ILLEGAL_ACTION'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NOT_MEMBER: 403,
  NOT_HOST: 403,
  ROOM_FULL: 409,
  ALREADY_STARTED: 409,
  NOT_STARTED: 409,
  NOT_READY: 409,
  TOO_MANY_ROOMS: 429,
  RATE_LIMITED: 429,
  STALE: 409,
  DUPLICATE: 409,
  ILLEGAL_ACTION: 422,
  INTERNAL: 500,
};

/** Thrown by handlers; turned into a structured JSON error response. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return json({ code: e.code, message: e.message, ...e.extra }, STATUS[e.code]);
  }
  console.error(e);
  return json({ code: 'INTERNAL', message: 'Something went wrong' }, 500);
}
