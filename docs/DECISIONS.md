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
