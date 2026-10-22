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
