# Decisions and assumptions

Record assumptions, deviations from docs/BUILD_SPEC.md, and verified external limits here. Newest at the bottom.

## Phase 0 (2026-10-22)

- **Repo folder:** the project lives in `/Users/Oakar/monopoli` (moved from `Monopoly`) to match the `monopoli` slug. The spec is at `docs/BUILD_SPEC.md`.
- **Tool versions:** Node 24, pnpm 12.14.0 (pinned via `packageManager`, enabled with corepack).
- **TypeScript pinned to 6.0.x**, not 7.x: `typescript-eslint` 8.72 supports TypeScript `<6.1.0` only. Revisit when typescript-eslint supports TS 7.
- **Engine purity is enforced by lint:** `Math.random`, `Date.now`, `new Date`, and the `window`/`document`/`process`/`crypto` globals are lint errors inside `packages/engine/src`.
- **Placeholder scripts:** `sim`, `sim:smoke`, `maps:validate` and `build:engine-edge` exist as no-ops so CI and the CLAUDE.md workflow run end to end. They are implemented in Phase 1 (sim, maps) and Phase 4 (edge bundle).
- **Vercel settings live in `vercel.json`** (install, build, output directory, SPA rewrite, cache headers), so the dashboard needs no overrides.
