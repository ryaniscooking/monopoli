# မိုနိုပိုလီ (monopoli) - project rules for Claude Code

## What this is

Monopoly-style board game, iPhone landscape-only PWA. Two maps: Myanmar (MMK) and Dubai (AED), data-driven (JSON). Modes: solo offline vs bots, and online rooms via Supabase (server-authoritative). Full spec: docs/BUILD_SPEC.md (this file). Personal use only.

## Stack

pnpm monorepo: packages/engine (pure TS), packages/maps (JSON), apps/web (React + Vite + TS + Zustand + Tailwind + motion), supabase/ (migrations + Deno Edge Functions). Hosting: Vercel + Supabase.

## Non-negotiable conventions

- The engine is pure: no Date.now(), Math.random(), DOM, Node APIs or I/O. Inject `now` and `rng`.
- Rules live ONLY in packages/engine. UI and Edge Functions never re-implement rules.
- Money = integers in map currency; map JSON stores classic units and is scaled by currency.multiplier at load.
- Every rule has an ID (R-xxx in the spec); tests are named with the ID.
- Maps are data only. Adding a map must not require code changes.
- Online: clients send intents only; identity comes from the JWT; all game writes use the service role in Edge Functions; deck order and secrets never reach clients.
- UI is English only, landscape only (portrait shows a rotate overlay), flat style, theme from map.theme.
- TypeScript strict. No `any` without a comment. Validate external input with zod.

## Workflow

1. Before each phase, write a short plan and wait for my OK.
2. Build in the phase order from the spec. Do not start online work before the solo game is complete.
3. After each phase: pnpm lint && pnpm typecheck && pnpm test && pnpm sim:smoke, then commit.
4. Verify against current docs before relying on Supabase / vite-plugin-pwa / iOS behavior.
5. Record assumptions and deviations in docs/DECISIONS.md.
6. I (the user) create the GitHub repo, Vercel project and Supabase project myself. When one is needed, STOP and give me numbered step-by-step instructions (spec Section 20), tell me exactly which non-secret values to send back, and wait for me to say "done". Never create accounts or projects yourself.
7. Secrets: never ask me to paste passwords, the Supabase service role key, or any secret key into chat, and never commit them. Put real values only in gitignored `.env.local` files that I fill in myself; commit `.env.example` with variable names only.

## Commands

pnpm dev | pnpm build | pnpm test | pnpm sim | pnpm sim:smoke | pnpm maps:validate | pnpm build:engine-edge
