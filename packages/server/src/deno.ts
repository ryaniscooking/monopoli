// Deno entry: bundled into supabase/functions/_shared/server.js by `pnpm build:engine-edge`.
// Each function's index.ts calls serve('<name>').
import { handle, type ServerEnv } from './index';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

function readEnv(): ServerEnv {
  const url = Deno.env.get('SUPABASE_URL');
  // New secret keys arrive as JSON ({ default: "sb_secret_..." }); the legacy service role key is
  // the fallback (local CLI and older projects).
  let secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      secretKey = parsed.default ?? Object.values(parsed)[0] ?? secretKey;
    } catch {
      /* keep the fallback */
    }
  }
  if (!url || !secretKey) throw new Error('Missing SUPABASE_URL or a secret key');
  return { url, secretKey };
}

export function serve(name: string): void {
  const env = readEnv();
  Deno.serve((req) => handle(name, req, env));
}
