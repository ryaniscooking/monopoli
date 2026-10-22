// Supabase client for online play (spec 10.1): anonymous auth, session kept on the device.
// Only the public URL and publishable key are used here; RLS decides what can be read.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const onlineConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error('Online play is not configured');
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'monopoli:auth' },
  });
  return client;
}

/** Signed-in user id; signs in anonymously the first time on this device. */
export async function ensureSession(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const res = await sb.auth.signInAnonymously();
  if (res.error || !res.data.user) throw new Error(res.error?.message ?? 'Could not sign in');
  return res.data.user.id;
}

export class OnlineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * Call an Edge Function with the user's JWT. One retry on a 5xx or network error: game actions are
 * idempotent by clientActionId, so a retried action is never applied twice.
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const sb = supabase();
  const { data: s } = await sb.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new OnlineError('UNAUTHORIZED', 'Not signed in');
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${url}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          apikey: key ?? '',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status >= 500 && attempt === 0) continue;
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new OnlineError(
          String(json.code ?? 'ERROR'),
          String(json.message ?? res.statusText),
          json,
        );
      }
      return json as T;
    } catch (e) {
      if (e instanceof OnlineError) throw e;
      lastError = e;
    }
  }
  throw new OnlineError(
    'NETWORK',
    lastError instanceof Error ? lastError.message : 'Network error',
  );
}
