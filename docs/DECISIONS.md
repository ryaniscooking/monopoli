# Decisions and assumptions

Record assumptions, deviations from docs/BUILD_SPEC.md, and verified external limits here. Newest at the bottom.

## Phase 0 (2026-10-22)

- **Repo folder:** the project lives in `/Users/Oakar/monopoli` (moved from `Monopoly`) to match the `monopoli` slug. The spec is at `docs/BUILD_SPEC.md`.
- **Tool versions:** Node 24, pnpm 12.14.0 (pinned via `packageManager`, enabled with corepack).
- **TypeScript pinned to 6.0.x**, not 7.x: `typescript-eslint` 8.72 supports TypeScript `<6.1.0` only. Revisit when typescript-eslint supports TS 7.
- **Engine purity is enforced by lint:** `Math.random`, `Date.now`, `new Date`, and the `window`/`document`/`process`/`crypto` globals are lint errors inside `packages/engine/src`.
- **Placeholder scripts:** `sim`, `sim:smoke`, `maps:validate` and `build:engine-edge` exist as no-ops so CI and the CLAUDE.md workflow run end to end. They are implemented in Phase 1 (sim, maps) and Phase 4 (edge bundle).
- **Vercel settings live in `vercel.json`** (build command, output directory, SPA rewrite, cache headers), so the dashboard needs no overrides.
- **Vercel uses pnpm via Corepack:** the Vercel project needs the env var `ENABLE_EXPERIMENTAL_COREPACK=1` so the `packageManager` pin (pnpm 12) is used. Without it Vercel infers pnpm 9/10 from `lockfileVersion: 9.0`. `vercel.json` sets no `installCommand`, because a custom install command can make Vercel use the oldest available pnpm (Vercel docs, checked 2026-10-22).
- **Repository is public** (owner's choice, 2026-10-22; the spec suggested private). Consequences: never commit secrets (already enforced by `.gitignore` and the `.env.example`-only rule), and per the spec's legal note, rename and re-check trademark/branding before promoting the app publicly.
- **Vercel:** production URL https://monopoli-eta.vercel.app. Project Root Directory is the repository root so `vercel.json` applies. Verified: `/r/:code` serves the SPA, hashed assets are `immutable`, `index.html` is revalidated.
- **Phase 0 done:** CI green on GitHub Actions, hello page deployed on Vercel.

## Phase 1 (2026-10-22)

- **Mortgaging pulled forward from Phase 3** (R-060..R-063) so debts can be paid off rather than only ending in bankruptcy. Buildings, trades and auctions stay in Phase 3.
- **No auctions yet:** `decline_buy` leaves the tile with the bank (Phase 2 also stubs auction as decline). Bankruptcy to the bank returns properties unowned instead of auctioning them (R-082 auction part comes in Phase 3).
- **Action set is Phase-1 only:** `roll, buy, decline_buy, mortgage, unmortgage, pay_jail_fine, use_jail_card, end_turn, pay_debt, declare_bankruptcy`. Build/sell, auction, trade and `system_*` actions are added with their phases. `applyAction` validates every action against `getLegalActions` (one source of truth for legality).
- **Additions to the spec's state shapes:**
  - `PlayerState.jailCardIds` (alongside `jailCards`) so a used/returned Get Out of Jail Free card goes back to its own deck.
  - `GameState.firstPlayer` so `round` increments when play returns to the first player's seat.
  - Debt `creditor` may be `'pot'` (Free Parking pot house rule); `Pending.debt.then` holds a continuation (only use: R-073 "pay the fine, then move").
  - No `trades` field until Phase 3.
- **Bankruptcy to the pot** (fines/taxes under the pot rule) is treated as bankruptcy to the bank (R-082): cash goes to the bank, not the pot.
- **R-064 on bankruptcy:** the creditor automatically pays 10% interest per mortgaged tile received (queued as a debt to the bank). The "unmortgage immediately instead" choice is a Phase 3 UI option.
- **`doubleGoBonus`** applies to any landing exactly on GO (dice or card).
- **R-004 roll-off** is simulated by the engine with the injected rng; its rolls are in the `turn_order` event for the UI.
- **Normal and Hard bots** play like Easy until Phase 3.
- **Map tests live in `packages/engine/test/maps.test.ts`** (not `packages/maps/schema-tests/`) so the maps package stays data-only with no test dependencies.
- **Map JSON** was generated once from Appendix B/C data and is committed as plain data; edit the JSON directly from now on.
- **Simulation result (acceptance):** 1,000 Easy-vs-Easy games per map, 0 invariant violations. Without houses ~95% of games hit the 3,000-turn cap (expected; building arrives in Phase 3). Invariants checked every step include a money ledger rebuilt only from `money_transfer` events.

## Phase 2 (2026-10-22)

- **vite-plugin-pwa pinned to 1.3.x** (supports Vite 8, documented API). 2.0.0 was released 2026-10-03 and only widens the `@vite-pwa/assets-generator` peer range; revisit later.
- **PWA:** `registerType: 'prompt'` with an "Update available" toast; Workbox precaches the whole build (JS ~590 kB / ~185 kB gzipped, CSS, HTML, icons, logo). Maps are bundled into the JS, so solo play needs no network. Verified by a Playwright test that reloads with the network off and starts a game.
- **Icons and the Burmese logo are generated** by `apps/web/scripts/gen-assets.mjs` (Playwright + Noto Sans Myanmar from Google Fonts at generation time) and committed as PNGs, so the app never ships a Burmese font.
- **No router** (see conversation): screens switch via a Zustand UI store; `/r/:code` handling comes in Phase 4.
- **Presentation queue (`apps/web/src/game/table.ts`):** every batch of engine events is animated in order, then the new state is shown; inputs are locked while it drains, and bots act 600-1600 ms (scaled by animation speed) after it is idle.
- **Saves:** IndexedDB via idb-keyval, one slot per map, written after every action (state + secrets + rng state), versioned with `migrateSave`. Falls back to in-memory if IndexedDB is unavailable.
- **Board tiles show prices without the currency symbol** ("60K", "200"): with symbols they do not fit 1u-wide tiles on iPhone SE. Full amounts are on the deed card and player cards.
- **Tile text stays ≥ 8 px**; long single-word names shrink to fit when possible and otherwise wrap. Tap-to-zoom + deed card is the way to read a tile on small phones. Short display names could be added in Phase 5.
- **Test hook:** with `?test` (or in dev) `window.__monopoli.patch(fn)` edits the local game state so UI tests can reach scenarios (debt, game over). Solo mode is client-trusted by design (spec 11.13); online play will not have it.
- **Sounds deferred to Phase 5** (spec phase list); Phase 2 has animations only.
- **Known limitation:** with no houses until Phase 3, solo games against Easy bots rarely end by bankruptcy (most simulated games pass 3,000 turns). Finishing a game is practical from Phase 3 (houses, time limit).

## Phase 3 (2026-10-22)

- **R-045 building shortage (digital adaptation):** a shortage exists when two or more players could build the same kind of building right now and the bank has fewer left than that. The build request then becomes a one-building auction among those players; the opening bid is the requested tile's house cost, the winner pays their bid (instead of the house cost) and the building is placed on the requested tile if the winner requested it, else on the winner's most valuable eligible tile.
- **Hotel sale with too few houses in the bank (R-044):** the hotel is sold down to nothing and the owner gets half of all five building costs.
- **Bids:** at least 1 classic unit above the high bid (1 AED / 1,000 Ks); the high bidder cannot withdraw. An auction with one remaining bidder and no bids continues until that bidder bids, withdraws, or the timer ends.
- **Trading is closed while any decision is pending** (buy, auction, debt) — R-090 names auctions and debts; a pending buy is included so a trade's mortgage interest can never open a debt on top of another decision.
- **Anti-spam:** at most 3 trade proposals per player per turn (online abuse limit, spec 11.8) in addition to R-093's one open offer.
- **R-064 on trades and bankruptcy:** the 10% interest is charged automatically; "unmortgage at once" is done afterwards with the normal Unmortgage button (same total cost).
- **Time limit (R-101):** `lastRoundPending` is set by a clock tick or at the next turn change after `endsAt`; the game ends when play returns to the first player.
- **Turn timer (R-110)** is implemented in the engine for online play; solo games do not offer it.
- **Bots:** Normal/Hard follow spec 9.3. Interpretations: Normal's reserve uses the average of the 3 highest rents it could owe; Hard's "expected rent over 2 rounds" assumes ~2.4 moves and a uniform 1/40 landing chance per tile. Tuning (ablation tests, 300-400 games each) changed Hard to: offer a 1.5x cash price for a set's last tile before trying a swap; never offer a swap that brings the opponent within one tile of a set; bid up to full value (keeping half its reserve unless the tile completes or blocks a set); raise debt cash by mortgaging bare tiles before selling houses.
- **Bot auction behaviour:** each bot's maximum bid is fixed per auction (a hash of bot, tile and round, not a fresh random number per decision; re-rolling caused a strong seat-order bias), and bots raise in steps of up to 10 classic units so auctions against bots finish in seconds.
- **Sanity targets (`pnpm sim:targets`, 400 games per matchup, seats alternated, turn-cap draws count as losses):** Hard beats Easy 80-82%, Normal beats Easy 79%, Hard beats Normal 68-69% on both maps (targets 70 / 60 / 55%).
- **Games now finish:** Easy-vs-Easy 1v1 ends in ~180 turns in ~87% of games; mixed-level 4-player games ~99% within the cap.
- **Saved games:** state schema v2; Phase 2 saves (v1) are upgraded on load.

## Phase 4 (2026-10-22)

- **Supabase keys (verified against current docs):** the web app uses the new **publishable key** (`VITE_SUPABASE_PUBLISHABLE_KEY`, replacing the spec's `VITE_SUPABASE_ANON_KEY`). Edge Functions read the secret key from `SUPABASE_SECRET_KEYS` (JSON) with the legacy `SUPABASE_SERVICE_ROLE_KEY` as fallback (local CLI). No secret ever reaches the client.
- **Auth:** `verify_jwt = true` on every function (the platform check accepts the project's asymmetric JWTs) **and** each handler resolves the user with `auth.getUser(token)`; request bodies never carry a player id (zod `.strict()` rejects extra keys).
- **Server code lives in `packages/server`** (strict TypeScript, typechecked with the monorepo) and is bundled with the engine, maps, zod and supabase-js into `supabase/functions/_shared/server.js` (~740 KB) by `pnpm build:engine-edge`; each function's `index.ts` just calls `serve('<name>')`. The generated folder is gitignored, so deploys always run the build first.
- **Idempotency is checked before the engine runs:** a repeated `clientActionId` returns `409 DUPLICATE` (with the current state) even if the repeated move would be legal again. Clients treat `DUPLICATE` after a retry as success and resync. Clients retry once on 5xx/network errors (Edge workers can be recycled mid-request).
- **Stale versions:** `409 STALE` with the latest version and state; the client resyncs (fetches the `games` row and all `game_events` since its version) and the player can act again.
- **Bot loop** runs inside the same invocation (max 200 actions), including clock timeouts (`system_timeout`), so a human's action returns only when a human must decide again.
- **Seat → player id:** seats in ascending order map to p0, p1, ... (fixed once the game starts; in-game "leave" keeps the seat and hands it to a bot).
- **Takeover/reclaim** (spec 10.7) via the engine's pure `setControlledBy` with a `control_changed` event. Reclaim happens immediately when the player calls `game-tick` or `join-room` (not "at the next decision boundary"), which is simpler and has the same effect for the player.
- **Safety net:** the spec's per-minute pg_cron tick (calling the Edge Function via pg_net with a stored secret) is **not** used. Every client heartbeats `game-tick` every 10 s and when a deadline passes; if every client is gone nobody is waiting on a deadline. Nightly cleanup runs as pure SQL via pg_cron (`cleanup_rooms`, 03:17 UTC).
- **Rate limits:** Postgres fixed windows per user — game-action 10/s and 180/min, game-tick 40/min, join-room 10/min, create-room 10/h, plus at most 3 open hosted rooms. No per-IP limit in our code: Supabase already limits anonymous sign-ins to 30 per hour per IP.
- **Reactions:** private Broadcast channel `room:<CODE>` with RLS policies on `realtime.messages` (members only). Receivers accept only the 8 whitelisted emoji, max one per sender per 2 s. For the private-channel check to be enforced, "Allow public access" must be off in the project's Realtime settings (cosmetic feature either way).
- **Realtime limits:** Postgres Changes with RLS on `games`, `game_events`, `rooms`, `room_players`; fine at friends scale (Supabase recommends Broadcast above ~3,000 subscribers).
- **Edge Function limits (checked 2026-10-22):** 2 s CPU per request, 150 s wall clock (Free), 256 MB memory, 20 MB bundle (CLI) / 5 MB (server-side bundling).
- **Local stack:** `edge_runtime.policy = "oneshot"` (a fresh worker per request) keeps integration tests deterministic; local anonymous sign-in limit raised for tests. Production is unaffected by `config.toml` runtime settings.
- **Tests:** 18 server integration tests on the local stack (lobby, play, Realtime, takeover/reclaim, abuse limits and all 8 spec-11 cheat tests) and a two-phone Playwright game; CI runs both in an `online` job.
- **Deployed (2026-10-23):** project `vbyydanktjjsimztjzlz` ("Monopoly", region ap-south-1 Mumbai). Migrations applied with `supabase db push`; the 8 functions deployed with `pnpm build:engine-edge && supabase functions deploy --project-ref vbyydanktjjsimztjzlz` (verify_jwt from `config.toml`). Live smoke test: unauthenticated call 401, create/leave room OK, `game_secrets` unreadable by a signed-in player.
- **Security advisor follow-up:** migration `20261023000001` revokes `EXECUTE` from `anon` on `is_room_member` (and, defensively, from `anon`/`authenticated` on the service-only functions), because Supabase grants new public functions to `anon` by default. Remaining advisor items are intended: tables with RLS and no policies are service-only; anonymous-user policies are the design (everyone signs in anonymously); `is_room_member` stays callable by signed-in users because the RLS policies need it and it only reveals the caller's own membership; `cron.*` findings are Supabase's own tables.
- **Realtime is private-only (fix after the first phone test, 2026-10-23):** with "Allow public access" off, the project rejects every public channel, so the lobby never updated (players, ready state, bots) and Start stayed disabled. All live updates now use private, members-only channels named after the room (`room:<CODE>`, `room:<CODE>:lobby`, `room:<CODE>:game:<id>`), authorized by RLS on `realtime.messages` (migration `20261023000002`). The lobby also refreshes right after the player's own actions and every 4 s, and a game polls every 3 s whenever its channel is not live, so a Realtime problem can slow updates but never freeze the lobby or a game. Local tests and the CI online job run with Realtime set to private-only too.
- **Phase 4 accepted (2026-10-23):** the user confirmed on phones that online games work and that switching a phone to airplane mode hands its seat to a bot and gives it back on reconnect.

## Phase 5 (2026-10-23)

- **Sound effects are synthesized with Web Audio** (`apps/web/src/audio/sfx.ts`) instead of CC0 sample files played with howler (spec 14 / open item 2). Nothing to license or download, nothing to precache, works offline. The audio context is created and resumed on the first tap or key press (iOS requirement); sounds before that are skipped. The iPhone silent switch also silences them. Music (optional, off by default in the spec) is not included.
- **Tokens are data:** each map token may carry `svg`, SVG path data in a 24x24 box (zod: path characters only, max 4,000), drawn in the player's color; the emoji `icon` stays as the fallback and for text. The 16 silhouettes were drawn for this project (self-made, no license needed). A new map can bring its own tokens without code changes.
- **Color-blind markers:** one letter per group (B, L, P, O, R, Y, G, D) on board tiles, title deeds and trade lists; on by default, switchable in Settings.
- **Camera follow:** when the board is zoomed in, it pans to keep the moving token in view (Settings toggle, on by default). At full-board zoom nothing moves.
- **Game-over stats come from the engine:** `GameState.stats` (optional, so old saves load) is folded from each action's events by the pure `tallyStats` (rent in/out, turns, times jailed, buildings built, GO passes). They are public and travel with the online state. The UI-only rent counter was removed.
- **How to Play is rendered from `docs/RULES.md`** (imported as text at build time, simple subset: `##` sections, paragraphs, `-` bullets, `**bold**`).
- **Smallest screen:** every screen is checked at 667x375 (iPhone SE) by `e2e/fit.spec.ts` (no page scroll, key controls in view, no console errors). The solo setup's Start button moved under the map cards so it is always visible.
- **Install hint:** numbered steps (Share, Add to Home Screen, Add), only in iPhone Safari (not Chrome/Firefox/Edge on iOS), only on the home screen, until dismissed.

## Tooling (2026-10-23)

- **Docker removed from the dev Mac:** the local Supabase stack is no longer available there; online integration tests run in CI only. Functions are deployed without Docker, bundled on Supabase's side: `pnpm build:engine-edge && supabase functions deploy --use-api --project-ref vbyydanktjjsimztjzlz`. `supabase db push` does not need Docker.

## Board restyle (2026-10-23)

- The live board follows `docs/board-templates/` (generated by `pnpm board:template`): a framed title plaque (logo image + MONOPOLI + map name) in the center, tilted Chance / Community Chest decks, dice and a round / pot / time pill below. Tile icons are one-color vectors shared with the templates (`apps/web/src/board/iconPaths.ts`) instead of emoji; the tax tile shows a coin with the map's currency symbol.
- Chance and Community Chest tiles show only their big icon (the name stays for screen readers): at ~31 px wide the names wrapped mid-word.
- Corners: GO with a diagonal "GO" and arrow, Jail with a barred cell toward the board and "Just / Visiting" on the outer edges, Free Parking with the map's name (the cup icon only when the name fits on one line), Go To Jail with an officer icon.
- **3D table view (setting, on by default):** the board leans back 22° with CSS perspective (scaled to 0.91 so the wider near edge stays in the board column at 667x375), shows a thickness edge and a shadow, and lies flat whenever the camera is zoomed in (tap a tile, pinch), so tile text stays readable. The game screen gets a "table" background: the map's main color with a static grain texture (SVG noise), a light pool and darker edges. The card reveal stays flat above the board. Turning the setting off restores the flat board and plain background.
- **Free zoom (2026-10-23):** zoomed in, the board is no longer clipped to its square: it fills the whole board column (clipped only at the column edges), and it can be dragged until its edge reaches the middle of the column, so any tile, corners included, can be centered. Gestures are taken by the whole column. Zooming back to 1x recenters the board (and tilts it again in the 3D table view).
- **Zoom keeps the tilt (2026-10-24, replaces "flat when zoomed" and the column clip):** the board lives in a full-screen layer under the rails. It rests in the middle column (measured from an empty placeholder there) and, zoomed in, keeps the 22° lean, like moving the camera closer, and continues under the player list and action rail, which float on top. Tapping a tile centers it in the resting square; drags are scaled for the lean.
- **Phone fixes (2026-10-24):** (1) the bottom safe-area padding is 40% of the home-indicator inset (min 6 px) instead of all of it, which left an empty strip in landscape; (2) the page itself can no longer be pinch-zoomed: `maximum-scale=1, user-scalable=no` plus cancelling WebKit `gesture*` events and multi-touch `touchmove` at the document (iOS ignores the meta tag alone); the board's own pinch still works; (3) the board's thickness edge and shadow are on the board surface, so they stay (and scale) when zoomed in.
- **Bug fix: selling buildings while in debt (2026-10-24):** the engine always allowed `sell_building` during a debt (R-080), but the Raise cash panel only listed mortgages and covers the Manage sheet, so a player owing rent with houses on a set could not sell them (and could not mortgage that set, R-060). The panel now lists "Sell a house / the hotel on X · +amount" (even-selling order), then mortgages, and explains that a set's properties can be mortgaged once its buildings are sold. Sale amounts come from the new pure engine helper `sellValue` (R-044, including a hotel that cannot be broken down). Server behavior is unchanged, so no Edge Function redeploy was needed.
- **Online speed (2026-10-24):** function logs showed game-action at ~490 ms average inside the same region as the database (ap-south-1), spent on ~10 sequential round trips. Now: the JWT is verified with `auth.getClaims` (signature checked against the project's cached JWKS, asymmetric keys; no Auth-server call per move; a revoked session stays valid until its token expires, about an hour), all reads run in parallel (rate limits, seats, room, idempotency check, game, secrets; nothing is returned before the membership check), and the commit runs together with the last-seen update. game-tick reads in parallel too. The client starts the dice tumble on tap for online rolls and sends one move at a time (double taps are ignored).
