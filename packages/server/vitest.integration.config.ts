import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Integration tests run against the local Supabase stack (`supabase start`, spec 15.6).
// Keys come from `supabase status` (local, well-known development keys only).
function localEnv(): Record<string, string> {
  if (process.env.SUPABASE_URL) return {};
  const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Record<
    string,
    string
  >;
  return {
    SUPABASE_URL: status.API_URL ?? '',
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? '',
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? '',
  };
}

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    env: localEnv(),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
