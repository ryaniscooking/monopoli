# မိုနိုပိုလီ — Digital Board Game: Build Specification

- **App name (display):** မိုနိုပိုလီ (Myanmar Unicode, NOT Zawgyi)
- **Repo / package slug:** `monopoli`
- **Spec version:** 1.0 (2026-10-22)
- **Audience:** Claude Code (vibe-coding workflow). Read the whole file before writing code.
- **Legal note:** Personal use only. The game follows Monopoly-style rules and uses its own map content. If it is ever published or shared publicly, rename it and re-check trademark and branding first.

---

## 0. How to use this document (instructions for Claude Code)

1. Read this entire file once. Then copy Section 19 into `CLAUDE.md` at the repo root.
2. Work **one phase at a time** (Section 17). At the start of each phase, write a short plan and wait for confirmation. At the end of each phase, run lint, typecheck and tests, then commit.
3. The **engine is the single source of truth for rules**. Never put game rules in UI code or in Edge Function glue code.
4. Every rule in Section 7 has an ID (`R-xxx`). Write at least one unit test per rule ID and name the test with the ID.
5. Where this spec says "verify", check the current official docs (Supabase, vite-plugin-pwa, iOS Safari behavior) before relying on remembered API details. Versions and limits change.
6. If something is ambiguous, pick the simplest option that keeps the engine pure and testable, and list the assumption in `docs/DECISIONS.md`.
7. **The user creates the GitHub repo, the Vercel project and the Supabase project personally.** Claude Code must NOT try to create accounts or projects. Instead, at the right moment (Section 20) Claude Code stops and gives the user clear, numbered, step-by-step instructions, then waits for the user to confirm and send back the non-secret values it needs.

---

## 1. Product summary

A Monopoly-style property trading game for **iPhone (landscape only)**, built as a **PWA web app**, with two content packs ("maps") at launch: **Myanmar (MMK)** and **Dubai (AED)**. More maps must be addable by adding data files only.

**Modes**
- **Solo vs bots:** fully offline, runs entirely in the browser, installable PWA, autosaves locally.
- **Online with friends:** Supabase Realtime rooms with a 6-character room code and share link, server-authoritative.

**Players:** 2–6 per game, any mix of humans and bots (solo mode: 1 human + 1–5 bots; online: humans + optional bots).

**Non-goals (for now):** native App Store build, accounts and profiles, public matchmaking, in-game chat (only emoji reactions), UI languages other than English, voice chat, monetization.

---

## 2. Locked decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Modes | Solo offline vs bots + online rooms with friends; PWA |
| 2 | Players | 2–6, humans and bots mixed |
| 3 | Bot levels | Easy / Normal / Hard (Section 9) |
| 4 | Disconnect | A bot takes over after a grace period; the player can reclaim the seat |
| 5 | Rule sets | Host picks **Official** or **House (Custom)** before the game starts; official defaults |
| 6 | Toggles | All toggles in Section 7.12, editable only in House mode |
| 7 | End of game | Last player standing; optional time limit ends the game by net worth |
| 8 | Maps | Myanmar + Dubai, data-driven JSON; more maps later |
| 9 | Currency | MMK for Myanmar, AED for Dubai, per-map multiplier |
| 10 | Server | Authoritative Supabase Edge Functions + Postgres; clients send intents only |
| 11 | Join | 6-character room code + shareable link |
| 12 | Auth | No accounts; nickname + Supabase anonymous auth |
| 13 | Lobby | Room settings, ready-up, host can kick |
| 14 | Engine | One pure TypeScript package used by client (solo) and Edge Functions (online) |
| 15 | Chat | Emoji reactions only |
| 16 | Orientation | **Landscape only** (rotate-device overlay in portrait) |
| 17 | Board | Square classic board, tap-to-zoom on tiles, pinch-zoom, free view |
| 18 | Style | Clean flat; distinct theme color per map |
| 19 | Audio/animation | Dice, token movement, money changes, SFX; mute toggle |
| 20 | Language | English UI only; the app title is Burmese |
| 21 | Hosting | Vercel (frontend) + Supabase (backend) |
| 22 | Testing | Engine unit tests + bot-vs-bot simulations + integration tests |
| 23 | Scope | Phased delivery (Section 17) |
| 24 | Cheat protection | Required (Section 11) |

---

## 3. Architecture overview

```
                    +--------------------------+
                    |  packages/engine (pure TS)|
                    |  rules, reducer, bots     |
                    +------------+-------------+
                                 |  (same code)
              +------------------+-------------------+
              |                                      |
   apps/web (React PWA)                 supabase/functions (Deno)
   - LocalGameClient (solo, offline)    - validates + applies actions
   - RemoteGameClient (online)  <-----> - writes Postgres, Realtime fans out
```

**Key principles**
- `applyAction(state, action)` is a **pure function**: no `Date.now()`, no `Math.random()`, no I/O. Time (`now`) and randomness (`rng`) are injected.
- The UI talks to a `GameClient` interface with two implementations: `LocalGameClient` (engine runs in the browser) and `RemoteGameClient` (sends intents to Edge Functions, listens to Realtime).
- Online: **clients never write game tables**. They call Edge Functions; the server validates against the engine, persists, and Realtime broadcasts the new state and events.
- Bots are pure functions in the engine package (`decide(view, playerId, level, rng) -> Action`). Locally they are scheduled by the client; online they run server-side inside the same function call that applied the previous action.

---

## 4. Repository layout (pnpm workspace)

```
monopoli/
  CLAUDE.md
  docs/
    DECISIONS.md
    RULES.md               # generated/curated from Section 7
  packages/
    engine/                # pure TS, zero runtime deps except zod
      src/
        types.ts
        rng.ts             # seeded PRNG (solo/tests) + crypto adapter
        map/               # schema (zod), loader, scaling, validators
        rules/             # one file per rule area (movement, rent, jail, build, ...)
        reducer.ts         # applyAction
        legal.ts           # getLegalActions
        cards.ts
        net-worth.ts
        bots/              # easy.ts normal.ts hard.ts valuation.ts
        index.ts
      test/
    maps/                  # data only
      myanmar/map.json
      dubai/map.json
      schema-tests/
  apps/
    web/                   # React + Vite + TS PWA
      src/
        app/ routes/ screens/ components/ board/ game/ lobby/
        clients/           # GameClient, LocalGameClient, RemoteGameClient
        audio/ store/ pwa/ strings/en.ts
      public/              # icons, fonts subset, sfx
  supabase/
    migrations/
    functions/
      _shared/             # bundled engine + helpers (generated, see 10.9)
      create-room/ join-room/ leave-room/ update-room/ set-ready/
      start-game/ game-action/ game-tick/ send-reaction/
    config.toml
  scripts/
    sim.ts                 # bot-vs-bot simulation harness
    build-engine-for-edge.ts
  .github/workflows/ci.yml
```

---

## 5. Tech stack

Use latest stable versions at project start (verify), TypeScript `strict: true`.

- **Frontend:** React, Vite, Zustand (state), Tailwind CSS with CSS variables for map themes, `motion` (Framer Motion) for animations, `@use-gesture/react` for pinch/pan/double-tap, `lucide-react` for icons, `howler` for audio, `idb-keyval` for local saves, `vite-plugin-pwa` (Workbox) for offline.
- **Engine:** TypeScript, `zod` for map and action validation. No DOM or Node APIs.
- **Backend:** Supabase (Postgres, Realtime, Anonymous Auth, Edge Functions), Supabase CLI for migrations and local stack.
- **Testing:** Vitest, `fast-check` (property tests), Playwright (UI, landscape viewport), Supabase local stack for integration tests.
- **Hosting:** Vercel for `apps/web`, Supabase cloud for backend.
- **Tooling:** pnpm, ESLint, Prettier, GitHub Actions.

---

## 6. Domain model (TypeScript, authoritative shapes)

Money is always an **integer in the map's currency units** after scaling (map JSON stores values in "classic units" and the loader multiplies by `currency.multiplier`).

```ts
export type PlayerId = `p${0|1|2|3|4|5}`;
export type TileId = string;
export type BotLevel = 'easy' | 'normal' | 'hard';
export type ColorGroup =
  | 'brown' | 'lightblue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'darkblue';

// ---------- Map ----------
export interface MapConfig {
  schemaVersion: 1;
  id: string;                       // 'myanmar' | 'dubai' | ...
  name: string;
  currency: {
    code: string;                   // 'MMK' | 'AED'
    symbol: string;                 // 'Ks' | 'AED'
    symbolPosition: 'prefix' | 'suffix';
    multiplier: number;             // classic unit -> map unit (MMK 1000, AED 1)
    compactFrom: number;            // show 60K / 1.5M at or above this value
    locale: string;                 // 'en-US'
  };
  theme: {
    primary: string; secondary: string; accent: string;
    boardBg: string; tileBg: string; text: string;
    groupColors: Record<ColorGroup, string>;
    playerColors: string[];         // 6 entries
  };
  tiles: Tile[];                    // exactly 40, array index = board position
  decks: { chance: DeckConfig; chest: DeckConfig };
  tokens: { id: string; name: string; icon: string }[]; // >= 8
  botNames: string[];               // >= 12
}

export type Tile =
  | { id: 'go'; type: 'go'; name: string }
  | { id: string; type: 'property'; name: string; group: ColorGroup; slot: number;
      price?: number; rent?: number[]; houseCost?: number; mortgage?: number }  // overrides, classic units
  | { id: string; type: 'transport'; name: string; icon: string }
  | { id: string; type: 'utility'; name: string; icon: 'electricity' | 'water' }
  | { id: string; type: 'tax'; name: string; amount: number }                    // classic units
  | { id: string; type: 'card'; deck: 'chance' | 'chest' }
  | { id: 'jail'; type: 'jail'; name: string }
  | { id: 'parking'; type: 'free_parking'; name: string }
  | { id: 'gotojail'; type: 'go_to_jail'; name: string };

export interface DeckConfig { name: string; cards: CardConfig[] } // 16 cards each

export type CardEffect =
  | { kind: 'advance_to'; tile: TileId; collectGoIfPassed: boolean }
  | { kind: 'advance_nearest'; tileType: 'transport'; rentMultiplier: 2 }
  | { kind: 'advance_nearest'; tileType: 'utility'; diceMultiplier: 10 }
  | { kind: 'collect'; amount: number }               // classic units
  | { kind: 'pay'; amount: number }
  | { kind: 'collect_each'; amount: number }
  | { kind: 'pay_each'; amount: number }
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  | { kind: 'move_back'; spaces: number }
  | { kind: 'go_to_jail' }
  | { kind: 'jail_free' };

export interface CardConfig { id: string; text: string; effect: CardEffect }
// Text placeholders: {amount} {goAmount} {perHouse} {perHotel} (formatted with the map currency)

// ---------- Settings ----------
export interface RuleSettings {
  preset: 'official' | 'house';
  startingCash: number;            // classic units, scaled at load (official 1500)
  goSalary: number;                // official 200
  doubleGoBonus: boolean;          // landing exactly on GO pays double (official false)
  freeParkingPot: boolean;         // taxes and fines feed a pot (official false)
  auctionOnDecline: boolean;       // official true
  evenBuild: boolean;              // official true
  unlimitedBuildings: boolean;     // official false (32 houses, 12 hotels)
  doubleRentOnSet: boolean;        // official true
  noRentInJail: boolean;           // official false
  offTurnManagement: boolean;      // build/mortgage/trade any time; official true
  jailFine: number;                // official 50
  turnTimerSec: 0 | 30 | 60 | 90;  // 0 = off (default)
  timeLimitMin: 0 | 30 | 60 | 90 | 120; // 0 = off (default)
  auctionTimerSec: number;         // default 15 (online and solo)
  disconnectGraceSec: number;      // default 60 (online)
  takeoverBotLevel: BotLevel;      // default 'normal' (online)
}

// ---------- Game state (PUBLIC; contains no hidden info) ----------
export interface PlayerState {
  id: PlayerId;
  seat: number;
  name: string;
  token: string;
  color: string;
  kind: 'human' | 'bot';
  botLevel?: BotLevel;
  controlledBy: 'human' | 'bot';       // online takeover flips this
  cash: number;
  position: number;                    // 0..39
  inJail: boolean;
  jailTurns: number;                   // failed attempts so far (0..2)
  jailCards: number;                   // Get Out of Jail Free cards held
  bankrupt: boolean;
  connected: boolean;
}

export interface PropertyState {
  owner: PlayerId | null;
  mortgaged: boolean;
  buildings: 0 | 1 | 2 | 3 | 4 | 5;    // 5 = hotel
}

export type TurnPhase = 'pre_roll' | 'post_roll' | 'game_over';

export type Pending =
  | { kind: 'buy'; player: PlayerId; tile: TileId; price: number }
  | { kind: 'auction'; tile: TileId; highBid: number; highBidder: PlayerId | null;
      active: PlayerId[]; deadline: number }              // epoch ms
  | { kind: 'debt'; debtor: PlayerId; creditor: PlayerId | 'bank'; amount: number;
      reason: string; queue: DebtEntry[] };

export interface TradeOffer {
  id: string; from: PlayerId; to: PlayerId;
  give: TradeBundle; get: TradeBundle;     // from's perspective
  expiresAt: number;
}
export interface TradeBundle { cash: number; tiles: TileId[]; jailCards: number }

export interface GameState {
  schemaVersion: number;
  mapId: string;
  settings: RuleSettings;
  players: PlayerState[];
  current: PlayerId;
  phase: TurnPhase;
  doublesCount: number;
  lastRoll: [number, number] | null;
  rolledThisTurn: boolean;
  pending: Pending | null;
  properties: Record<TileId, PropertyState>;
  bank: { houses: number; hotels: number };
  deckCounts: { chance: number; chest: number };
  parkingPot: number;
  trades: TradeOffer[];
  round: number;
  turnDeadline: number | null;
  endsAt: number | null;                  // time-limit end (epoch ms)
  lastRoundPending: boolean;              // time limit reached, finishing the round
  winner: PlayerId | null;
}

// ---------- Hidden (server only; never sent to clients) ----------
export interface GameSecrets { chanceOrder: string[]; chestOrder: string[] } // card ids, top first
```

**Engine API**
```ts
createGame(map: ResolvedMap, settings: RuleSettings, seats: SeatInit[], rng: Rng, now: number)
  : { state: GameState; secrets: GameSecrets; events: GameEvent[] }

applyAction(ctx: { map: ResolvedMap; rng: Rng; now: number },
            state: GameState, secrets: GameSecrets, actor: PlayerId | 'system', action: Action)
  : { ok: true; state; secrets; events: GameEvent[] } | { ok: false; error: RuleError }

getLegalActions(map: ResolvedMap, state: GameState, player: PlayerId): Action[]
netWorth(map, state, player): number
```

**Actions (intents)**
`roll`, `buy`, `decline_buy`, `auction_bid {amount}`, `auction_withdraw`, `build {tile}`, `sell_building {tile}`, `mortgage {tile}`, `unmortgage {tile}`, `pay_jail_fine`, `use_jail_card`, `end_turn`, `propose_trade {to, give, get}`, `accept_trade {id}`, `decline_trade {id}`, `cancel_trade {id}`, `pay_debt`, `declare_bankruptcy`, plus server-only `system_timeout`, `system_end_time_limit`, `system_takeover`.

**Events (for animation, sound, log)**
`turn_started`, `dice_rolled`, `moved {path}`, `passed_go`, `landed`, `bought`, `auction_started`, `auction_bid`, `auction_ended`, `rent_paid`, `tax_paid`, `card_drawn`, `money_transfer {from,to,amount,reason}`, `jailed`, `released`, `built`, `sold_building`, `mortgaged`, `unmortgaged`, `trade_proposed|accepted|declined|cancelled`, `debt_started|debt_cleared`, `bankrupt`, `game_over`.

---

## 7. Rules specification (official defaults)

Source: Hasbro's published Monopoly rulebook. Every rule has an ID for tests. "Official mode" locks all values below; "House mode" unlocks the toggles in 7.12.

### 7.1 Setup
- **R-001** 2–6 players. Each starts with `startingCash` (official 1500 classic units).
- **R-002** All properties start unowned. The bank starts with 32 houses and 12 hotels (unless `unlimitedBuildings`).
- **R-003** Decks (Chance, Community Chest) are shuffled at game start by the server's cryptographic RNG (online) or the seeded RNG (solo). Order is hidden information.
- **R-004** Turn order: each player rolls the dice (cosmetic roll-off); highest total goes first, ties re-roll; play proceeds clockwise by seat order.

### 7.2 Turn flow
- **R-010** On your turn you roll two dice and move clockwise by the total.
- **R-011** Doubles grant another roll after you finish resolving the landing.
- **R-012** Three doubles in a row sends you straight to Jail without moving that third time.
- **R-013** Passing or landing on GO pays `goSalary` (official 200). Not paid when sent to Jail or moved by a card that says not to.
- **R-014** Turn ends when you end it (after resolving all pending decisions). A turn also ends immediately when you are sent to Jail.

### 7.3 Landing outcomes
- **R-020 Unowned property:** you may buy at list price. If you decline (and `auctionOnDecline`), the bank auctions it (7.6).
- **R-021 Owned by another player, unmortgaged:** pay rent to the owner (7.4). No rent on mortgaged properties.
- **R-022 Own property:** nothing.
- **R-023 Tax tile:** pay the amount to the bank (or to the pot if `freeParkingPot`). Income Tax is a flat 200 (classic units); Luxury Tax is 100.
- **R-024 Card tile:** draw the top card, apply it, return it to the bottom (except Get Out of Jail Free, which is kept by the player until used or traded).
- **R-025 Go To Jail tile:** move directly to Jail (7.8). Do not pass GO.
- **R-026 Free Parking:** nothing happens (official). With `freeParkingPot`: collect the pot.
- **R-027 Jail tile (Just Visiting):** nothing.

### 7.4 Rent
- **R-030 Property, no buildings:** base rent; **doubled** if the owner owns every property in the color group and none of them is mortgaged (`doubleRentOnSet`).
- **R-031 With buildings:** rent from the tile's 1/2/3/4-house or hotel rent value.
- **R-032 Transport:** 25 / 50 / 100 / 200 (classic units) for 1 / 2 / 3 / 4 owned (unmortgaged) transport tiles.
- **R-033 Utility:** 4x the dice total if the owner owns one utility; 10x if both.
- **R-034 Cards override:** "nearest transport" pays **double** the normal rent; "nearest utility" pays **10x the dice total** (a fresh roll for the payer).
- **R-035** Rent is collected even while the owner is in Jail (unless `noRentInJail`).

### 7.5 Buying and building
- **R-040 Building precondition:** you own all properties in the color group, none mortgaged. Build on your turn or any time if `offTurnManagement`.
- **R-041 Even build:** a group's buildings may differ by at most 1 (building up and selling down). Toggle `evenBuild`.
- **R-042 Houses:** up to 4 per property, then a hotel (a hotel replaces 4 houses, returning them to the bank).
- **R-043 Costs:** house cost by group: brown/lightblue 50, pink/orange 100, red/yellow 150, green/darkblue 200 (classic units). A hotel costs the same as one more house.
- **R-044 Selling:** buildings sell back to the bank for half cost; must sell evenly. Selling a hotel returns 4 houses only if the bank has 4 houses; otherwise you must sell the hotel down to zero houses (receiving half of all five building costs).
- **R-045 Shortage:** if the bank lacks the needed houses/hotels and more than one player wants them, the bank **auctions** them one at a time (7.6). With `unlimitedBuildings` there is no shortage.
- **R-046** Buildings are never trade assets; they must be sold to the bank first.

### 7.6 Auctions
- **R-050** An auction starts when a player declines to buy (`auctionOnDecline`), or for building shortages (R-045), or for bankruptcy to the bank (R-082).
- **R-051** Everyone not bankrupt may bid, **including the player who declined**. Bidding starts at 1 classic unit (the map multiplier); bids must be higher than the current high bid and no more than the bidder's cash.
- **R-052** Digital rule for timing: the auction ends when `auctionTimerSec` elapses with no new bid (each bid resets the timer), or when every bidder but one withdraws. The high bidder pays and gets the property. If no bids, the property stays with the bank.
- **R-053** Bids are cash only.

### 7.7 Mortgages
- **R-060** Only unimproved properties can be mortgaged; all buildings in the color group must be sold first.
- **R-061** Mortgaging pays the owner the mortgage value (half the price). Mortgaged properties earn no rent.
- **R-062** To unmortgage, pay the mortgage value + 10%, rounded half up to the nearest currency unit.
- **R-063** A player may still collect rent on the other properties in a group that has a mortgaged property, but the double-rent bonus is lost (R-030).
- **R-064** Receiving a mortgaged property (trade or bankruptcy): pay 10% of its mortgage value immediately, then either unmortgage it at once (paying the mortgage value) or keep it mortgaged (paying 10% again when later unmortgaged).

### 7.8 Jail
- **R-070** You go to Jail by: landing on Go To Jail, drawing a go-to-jail card, or rolling three consecutive doubles.
- **R-071** In Jail, on your turn, you may before rolling: pay `jailFine` (official 50), use a Get Out of Jail Free card, or roll.
- **R-072** Rolling doubles frees you: move that roll, but you **do not** roll again.
- **R-073** You get at most 3 turns in Jail. If you fail to roll doubles on the third turn you must pay `jailFine` and move by the roll you just made.
- **R-074** While in Jail you may still collect rent, buy and sell buildings, mortgage, trade and bid in auctions.
- **R-075** Paying the fine or using a card also returns the card or sends the fine to the bank (or pot).

### 7.9 Debt and bankruptcy
- **R-080** If you owe more than your cash, a `debt` pending decision opens. You must raise cash by selling buildings, mortgaging, or trading; once cash covers the debt, `pay_debt` becomes available (the UI offers one-tap pay).
- **R-081** **Bankruptcy to a player:** all assets (properties, mortgaged ones included, Get Out of Jail Free cards, remaining cash) transfer to the creditor; buildings are sold to the bank first (the debtor's sale proceeds go to the creditor as cash). The creditor handles mortgaged properties per R-064.
- **R-082** **Bankruptcy to the bank** (taxes, fines, cards): all properties are returned to the bank unmortgaged and auctioned one by one; Get Out of Jail Free cards return to the deck bottom.
- **R-083** A player may `declare_bankruptcy` at any time during a debt. The UI suggests it when liquidation value is below the debt.
- **R-084** Pay-each-player cards (pay_each) create a queue of debts, resolved in seat order.
- **R-085** The game ends when one non-bankrupt player remains: that player wins.

### 7.10 Trading
- **R-090** Players may trade properties (unimproved, color group has no buildings), cash and Get Out of Jail Free cards; trading is allowed any time except while an auction or someone's debt is pending (with `offTurnManagement`, otherwise only on the proposer's turn).
- **R-091** **No loans, no promises of future rent or favors.** Only the assets in the offer change hands.
- **R-092** Offers are validated at proposal and again at acceptance (ownership, no buildings, enough cash). Invalid offers auto-cancel.
- **R-093** One open outgoing offer per player; offers expire after 60 seconds.
- **R-094** Mortgaged properties may be traded; receiver pays R-064.

### 7.11 End of game
- **R-100** Last player standing wins (R-085).
- **R-101** Optional time limit (`timeLimitMin`): at `endsAt`, finish the current round so everyone has had equal turns, then the player with the highest **net worth** wins. Net worth = cash + property prices (mortgaged properties at mortgage value) + building costs (full cost). Tie-break: higher cash, then more properties.

### 7.12 Toggles (House mode only)
`startingCash`, `goSalary`, `doubleGoBonus`, `freeParkingPot`, `auctionOnDecline`, `evenBuild`, `unlimitedBuildings`, `doubleRentOnSet`, `noRentInJail`, `offTurnManagement`, `jailFine`, `turnTimerSec`, `timeLimitMin`, `auctionTimerSec`. Official preset = defaults above. The lobby shows an **Official / House** switch; choosing Official resets and locks every toggle.

### 7.13 Timers
- **R-110** If `turnTimerSec > 0`: a human who times out gets an auto-action in this order: roll if awaiting roll; decline buy; withdraw from auction; pay debt if possible else bot liquidation; end turn. Three consecutive timeouts flips the seat to bot control (online) or ends the game for that seat (solo does not use the timer).

---

## 8. Maps, currency and content

### 8.1 Data-driven maps
- Each map is `packages/maps/<id>/map.json` validated by a zod schema at build time and at load time.
- A **validator script** (`pnpm maps:validate`) and tests must assert: 40 tiles; positions per Table 8.2; 22 properties with group sizes 2,3,3,3,3,3,3,2; 4 transports; 2 utilities; 2 taxes; 3 Chance + 3 Community Chest tiles; 16 cards per deck; at least one Get Out of Jail Free per deck; all card tile references exist; theme colors are valid hex; at least 8 tokens; at least 12 bot names.
- Money values in JSON are in **classic units**; the loader multiplies by `currency.multiplier`. A property's economics come from the classic table (Appendix A) by `slot` unless overridden per tile.
- **Adding a new map = adding a folder with a `map.json` and registering it in `packages/maps/index.ts`.** No engine or UI code changes.

### 8.2 Board layout (shared by all maps)

| Idx | Tile | Idx | Tile | Idx | Tile | Idx | Tile |
|---|---|---|---|---|---|---|---|
| 0 | GO | 10 | Jail | 20 | Free Parking | 30 | Go To Jail |
| 1 | p01 | 11 | p06 | 21 | p12 | 31 | p18 |
| 2 | Chest 1 | 12 | Utility 1 (u1) | 22 | Chance 2 | 32 | p19 |
| 3 | p02 | 13 | p07 | 23 | p13 | 33 | Chest 3 |
| 4 | Income Tax | 14 | p08 | 24 | p14 | 34 | p20 |
| 5 | Transport 1 (t1) | 15 | Transport 2 (t2) | 25 | Transport 3 (t3) | 35 | Transport 4 (t4) |
| 6 | p03 | 16 | p09 | 26 | p15 | 36 | Chance 3 |
| 7 | Chance 1 | 17 | Chest 2 | 27 | p16 | 37 | p21 |
| 8 | p04 | 18 | p10 | 28 | Utility 2 (u2) | 38 | Luxury Tax |
| 9 | p05 | 19 | p11 | 29 | p17 | 39 | p22 |

Color groups by slot: brown p01-p02, lightblue p03-p05, pink p06-p08, orange p09-p11, red p12-p14, yellow p15-p17, green p18-p20, darkblue p21-p22.

### 8.3 Currency and scaling

| | Dubai | Myanmar |
|---|---|---|
| Code / symbol | AED / `AED` prefix | MMK / `Ks` suffix |
| Multiplier | x1 | x1000 |
| Starting cash | 1,500 | 1,500,000 |
| GO salary | 200 | 200,000 |
| Example price (p01) | 60 | 60,000 |
| Compact display from | 10,000 | 10,000 (60K, 1.5M) |

Display rules: full numbers with thousands separators in money panels and receipts; compact form (K/M) on board tiles. All UI money goes through one `formatMoney(map, amount, { compact })` helper.

### 8.4 Dubai map content

- **Theme:** primary `#0B2A4A` (navy), secondary `#18A3A5` (teal), accent `#C9A227` (gold), boardBg `#F2E3C6` (sand), tileBg `#FFF9EC`, text `#12263A`.
- **Properties by slot:** p01 Deira, p02 Al Karama, p03 International City, p04 Dubai Silicon Oasis, p05 Al Barsha, p06 Jumeirah Village Circle, p07 Dubai Sports City, p08 Dubai Festival City, p09 Dubai Hills Estate, p10 Jumeirah Lake Towers, p11 Dubai Creek Harbour, p12 Business Bay, p13 Dubai Marina, p14 Jumeirah Beach Residence, p15 Dubai Frame, p16 Dubai Mall, p17 Museum of the Future, p18 Downtown Dubai, p19 Bluewaters Island, p20 Emirates Hills, p21 Burj Khalifa, p22 Palm Jumeirah.
- **Transport:** t1 Dubai Metro, t2 Dubai Tram, t3 Palm Monorail, t4 Abra Water Taxi.
- **Utilities:** u1 Electricity, u2 Water.
- **Taxes:** Income Tax slot named "Municipality Fee" (200), Luxury Tax slot named "Salik Toll" (100).
- **Corners:** GO, Jail ("Jail / Just Visiting"), Free Parking named "Desert Oasis", Go To Jail.
- **Decks:** "Chance", "Community Chest".

### 8.5 Myanmar map content

- **Theme:** primary `#7A1F2B` (maroon), secondary `#2E7D4F` (green), accent `#E0A526` (gold), boardBg `#F6EBD0`, tileBg `#FFFBF0`, text `#2A1A14`.
- **Properties by slot:** p01 Hakha, p02 Loikaw, p03 Hpa-An, p04 Myitkyina, p05 Sittwe, p06 Dawei, p07 Myeik, p08 Magway, p09 Monywa, p10 Meiktila, p11 Pyin Oo Lwin, p12 Pyay, p13 Bago, p14 Pathein, p15 Ngapali, p16 Inle Lake, p17 Bagan, p18 Taunggyi, p19 Mawlamyine, p20 Naypyidaw, p21 Mandalay, p22 Yangon.
- **Transport:** t1 Yangon Circular Railway, t2 Myanmar Railways Express, t3 Irrawaddy River Ferry, t4 Yangon International Airport.
- **Utilities:** u1 Electricity, u2 Water.
- **Taxes:** Income Tax slot "Income Tax" (200), Luxury Tax slot "Commercial Tax" (100).
- **Corners:** GO, Jail ("Jail / Just Visiting"), Free Parking named "Teahouse", Go To Jail.
- **Decks:** "Chance", "Community Chest".

### 8.6 Shared color group palette (flat)
brown `#8B5A3C`, lightblue `#8ED1F0`, pink `#D86FA6`, orange `#F28C28`, red `#D62F2F`, yellow `#F2D338`, green `#2E9E5B`, darkblue `#1F3FA6`. Player colors: `#E63946`, `#1D7FE0`, `#2EAD5B`, `#F4A300`, `#8E44AD`, `#14B8A6`.

### 8.7 Tokens (8 per map)
- **Myanmar:** Chinthe (lion), Pagoda, Longyi, Bullock cart, Trishaw, Hintha bird, Mohinga bowl, Chinlone ball.
- **Dubai:** Dhow, Camel, Skyscraper, Falcon, Dallah coffee pot, Abra boat, Supercar, Date palm.
- Phase 2 uses emoji placeholders; Phase 5 replaces them with flat SVG icons (single-color silhouettes tinted by player color).

### 8.8 Cards
Full card lists for both maps are in **Appendix B** (16 per deck per map). Review the texts; effects are identical across maps, only flavor text and referenced tiles differ.

---

## 9. Bots

### 9.1 Interface
```ts
decide(view: PublicView, me: PlayerId, level: BotLevel, rng: Rng): Action
```
`PublicView` = `GameState` + resolved map (no secrets). Bots must only return actions from `getLegalActions`. For each decision type the bot code exposes a function: `shouldBuy`, `maxAuctionBid`, `buildPlan`, `liquidationPlan`, `jailChoice`, `tradeProposals`, `evaluateTrade`.

### 9.2 Property valuation
`value(tile) = price * groupWeight * (1 + setBonus + blockBonus)`
- `groupWeight`: brown 0.8, lightblue 1.0, pink 1.05, orange 1.25, red 1.2, yellow 1.1, green 1.0, darkblue 0.95, transport 1.05, utility 0.7.
- `setBonus`: +0.15 per owned property in the same group (max group), +0.6 if it completes the group.
- `blockBonus`: +0.4 if it stops an opponent who already owns all other properties in the group.

### 9.3 Level behavior

| Behavior | Easy | Normal | Hard |
|---|---|---|---|
| Buy decision | Buys 70% of the time when cash >= price; no reserve | Buys if cash after >= reserve and `value >= 0.9 * price` | Buys if `value >= 0.8 * price` and cash after >= dynamic reserve; always buys set-completing or blocking tiles even below reserve (down to 25% of reserve) |
| Cash reserve | 0 | `max(200 * m, top-3 opponent max rent exposure)` | Dynamic: `1.2 * expected rent exposure over the next 2 rounds`, min `150 * m` |
| Auction max bid | `0.7 * price` with +/-20% noise | `value` | `value * (1.15 if completes set or blocks, else 1.0)`, never below cash reserve unless completing a set |
| Building | Builds on a random eligible tile on 30% of turns | Builds evenly when owning a set while keeping reserve | Prioritizes groups with best landing frequency (orange, red, yellow first), builds to 3 houses on every tile of a set before going to 4/hotel, always keeps reserve; sells buildings only to avoid bankruptcy |
| Mortgaging | Only when in debt | Mortgages the cheapest low-value tiles to fund builds or pay debts | Mortgages isolated low-value tiles to fund builds on a set; unmortgages high-value tiles first when cash allows |
| Jail | Always pays to leave | Pays early game; stays late game if opponents have many buildings | Leaves immediately in the first ~10 rounds or when many properties are unowned; stays and rolls for doubles when opponents' rents are high |
| Trading | Never proposes; accepts if its net `value` gain > 0 | Proposes trades that give it a full set at a fair premium; accepts trades with net `value` gain >= 5% | Actively proposes 1-for-1 swaps to complete its sets (and avoids completing opponents'); accepts when net gain >= 10% and the trade does not complete an opponent set unless it also completes its own |
| Debt | Sells/mortgages cheapest first | Mortgages first, then sells buildings | Chooses the liquidation order that preserves its best sets |
| Mistakes | Makes non-optimal moves on purpose (random 15% skip of build or buy) | None | None |

### 9.4 UX timing
Locally, bot actions are scheduled with a human-like delay (600-1600 ms, scaled by the "Animation speed" setting) and are never blocking the UI thread. Online, bots resolve server-side; the client animates the returned events in order.

### 9.5 Bot names
Per map list in Appendix C. Bots show a small robot badge and level (E/N/H) next to the name.

---

## 10. Online multiplayer (Supabase)

### 10.1 Flow
1. App signs in anonymously (`supabase.auth.signInAnonymously()`), session persisted on the device.
2. Host calls `create-room` (map, settings) and gets a 6-character code. Link: `https://<domain>/r/<CODE>`.
3. Others open the link or enter the code, call `join-room`, pick nickname, token and color.
4. Lobby: players ready up; host can add bots (with level), remove bots, kick players, change map and rules.
5. Host calls `start-game` when 2-6 seats are filled and every human is ready.
6. Players send intents via `game-action`; all clients receive updates via Realtime.

### 10.2 Room codes
6 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1); unique; case-insensitive input. `join-room` is rate-limited (Section 11).

### 10.3 Schema (SQL migration)

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby','playing','finished','closed')),
  map_id text not null,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table room_players (
  room_id uuid not null references rooms(id) on delete cascade,
  seat int not null check (seat between 0 and 5),
  user_id uuid references auth.users(id),                   -- null for bot seats
  nickname text not null check (char_length(nickname) between 1 and 20),
  token text not null,
  color text not null,
  is_bot boolean not null default false,
  bot_level text check (bot_level in ('easy','normal','hard')),
  controlled_by text not null default 'human' check (controlled_by in ('human','bot')),
  ready boolean not null default false,
  connected boolean not null default true,
  last_seen timestamptz not null default now(),
  timeouts int not null default 0,
  primary key (room_id, seat)
);
create unique index room_players_user_unique on room_players(room_id, user_id) where user_id is not null;

create table games (
  room_id uuid primary key references rooms(id) on delete cascade,
  version int not null default 0,
  state jsonb not null,                                      -- PUBLIC state only
  turn_deadline timestamptz,
  updated_at timestamptz not null default now()
);

create table game_secrets (                                  -- NO client policies (deny all)
  room_id uuid primary key references rooms(id) on delete cascade,
  chance_order jsonb not null,
  chest_order jsonb not null
);

create table game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  version int not null,
  seq int not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, version, seq)
);

create table action_log (                                    -- idempotency
  room_id uuid not null references rooms(id) on delete cascade,
  client_action_id uuid not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  primary key (room_id, client_action_id)
);
```

### 10.4 Row Level Security
```sql
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table games enable row level security;
alter table game_secrets enable row level security;
alter table game_events enable row level security;
alter table action_log enable row level security;

create function is_room_member(r uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from room_players where room_id = r and user_id = auth.uid())
$$;

create policy rooms_select on rooms for select using (is_room_member(id));
create policy room_players_select on room_players for select using (is_room_member(room_id));
create policy games_select on games for select using (is_room_member(room_id));
create policy game_events_select on game_events for select using (is_room_member(room_id));
-- game_secrets and action_log: no policies at all. Only the service role (Edge Functions) can access them.
-- NO insert/update/delete policies on any table: all writes go through Edge Functions with the service role.
```
Add `rooms`, `room_players`, `games`, `game_events` to the `supabase_realtime` publication. Verify how Realtime Postgres Changes applies RLS and its limits in current docs.

### 10.5 Edge Functions

All functions: `verify_jwt = true`; derive the caller from the JWT (`auth.uid()`), never from the request body; validate every body with zod; return a structured error `{ code, message }`.

| Function | Input | Behavior |
|---|---|---|
| `create-room` | `{ mapId, nickname, settings }` | Creates room + host seat, returns `{ roomId, code }` |
| `join-room` | `{ code, nickname }` | Rate-limited; seats the caller in the first free seat; fails if full or started (unless the caller already has a seat: then it reclaims) |
| `leave-room` | `{ roomId }` | Lobby: frees seat; in-game: flips seat to bot control |
| `update-room` | `{ roomId, patch }` | Host only: map, settings, add/remove bot, kick, set token/color for self |
| `set-ready` | `{ roomId, ready }` | Caller's own seat only |
| `start-game` | `{ roomId }` | Host only; checks 2-6 seats and all humans ready; runs `createGame`; writes `games`, `game_secrets`, initial events |
| `game-action` | `{ roomId, clientActionId, expectedVersion, action }` | Core intent endpoint (10.6) |
| `game-tick` | `{ roomId }` | Heartbeat + deadline enforcement (10.7). Any member may call it |
| `send-reaction` | `{ roomId, emoji }` | Optional server-side validation if reactions go through the server |

### 10.6 `game-action` algorithm
1. Verify JWT and membership; map `uid -> seat -> PlayerId` from `room_players`.
2. Validate payload with zod; reject unknown action kinds.
3. Load `games` row and `game_secrets` with the service role.
4. If `expectedVersion != version`, return `409 STALE` with the latest state (client resyncs and retries if still valid).
5. Check the actor may act now (their turn, or an allowed off-turn action, or they are the debtor/bidder). The engine enforces this too.
6. `applyAction(...)` using the **server's** `now` and the cryptographic RNG. Never accept client time or client dice.
7. **Bot loop:** while the next decision belongs to a bot-controlled seat (and the game is not over), call `decide` + `applyAction`; cap at 200 actions per invocation; leftover work is finished by the next `game-tick`.
8. Commit atomically through a Postgres RPC `commit_game(room_id, expected_version, new_state, new_secrets, events[], client_action_id)` which: inserts into `action_log` (unique -> idempotent), checks and bumps `version`, updates `games` and `game_secrets`, inserts `game_events`. If the version check fails: retry from step 3 up to 3 times.
9. Return `{ version, state, events }` to the caller. Other clients get the change through Realtime.

### 10.7 Timers, heartbeats, disconnect and takeover
- Deadlines are stored server-side (`turnDeadline`, auction `deadline`). Clients only display countdowns.
- Each client calls `game-tick` every ~10 seconds (heartbeat) and immediately when a displayed deadline passes. `game-tick` updates `last_seen`, then if any deadline has expired or a needed seat is stale, it applies `system_timeout`/`system_takeover`. The server re-checks everything, so a malicious client gains nothing by calling it.
- Safety net: a pg_cron job (every minute) invokes tick for rooms with expired deadlines. Verify what pg_cron intervals are available.
- **Disconnect:** if the seat needed to act has `last_seen` older than `disconnectGraceSec`, set `controlled_by = 'bot'` (level from `takeoverBotLevel`) and let the bot act. A disconnected player who is not currently needed stays human-controlled.
- **Reclaim:** when that user returns (same anonymous session) and calls `game-tick` or `join-room`, flip `controlled_by` back to `human` at the next decision boundary.
- If a human is the only remaining human and all other humans left, the game continues with bots; the room closes after 24 h idle.

### 10.8 Client sync
- Subscribe to Postgres Changes on `games` (filter `room_id`), `game_events` (INSERT), `room_players`, `rooms`.
- On (re)connect: fetch the `games` row and any `game_events` with `version > lastSeenVersion`, then resume.
- The UI renders from `state` and plays cosmetic animation from `events` through a queue; inputs are locked while the queue drains.
- Emoji reactions use a Realtime broadcast channel `room:<code>`; receivers ignore any payload that is not in the 8-emoji whitelist and rate-limit display (1 per sender per 2 s). Prefer private channels with membership checks (verify current Realtime Authorization docs).

### 10.9 Sharing the engine with Deno
- Do not import the engine from outside `supabase/functions` at runtime. Build step `pnpm build:engine-edge` bundles `packages/engine` (+ maps) with esbuild to ESM into `supabase/functions/_shared/engine.js` (+ `.d.ts`), committed or generated in CI.
- The engine must not use Node-only APIs. Randomness and time are injected.
- Keep per-request CPU low (Supabase Edge Functions have CPU and wall-time limits; verify the current numbers). Hard-level bot heuristics must stay linear-time and cheap; avoid Monte Carlo on the server.

### 10.10 Housekeeping
Nightly pg_cron: close rooms idle > 24 h; delete finished/closed rooms older than 7 days (cascade deletes games, events, secrets).

---

## 11. Cheat protection (online)

Threat model: friends playing, but any player can open dev tools or replay requests. Rules: **nothing the client says is trusted**.

1. **Server authority:** the engine validates every action server-side. Clients cannot set state, money, positions or dice.
2. **Identity from JWT only.** The acting seat is derived from `auth.uid()` in the database; the request body never contains a player id.
3. **RLS everywhere**, no client write policies at all; writes only through Edge Functions using the service role. The service role key never ships to the client.
4. **Hidden information stays hidden:** deck order lives in `game_secrets` (no client policy). Dice and shuffles use the server's cryptographic RNG. No seeds are exposed.
5. **Optimistic concurrency + idempotency:** `expectedVersion` and a unique `clientActionId` stop replays, double-submits and race conditions.
6. **Server time only:** deadlines, auction timers and the time limit use the server clock.
7. **Input validation:** zod schemas for every payload; strict action allow-list; integer and range checks on amounts (bids <= cash, trades validated twice).
8. **Rate limiting:** per-user limits on `game-action` (e.g. 10/s burst, 3/s sustained), `join-room` (e.g. 10/min per user and per IP) and reaction events. Store counters in Postgres or an in-memory best-effort limiter.
9. **Host powers verified server-side:** only `rooms.host_id` may change settings, kick or start.
10. **Realtime channels:** game state only flows from database changes (read-only for clients). Any broadcast-based feature (reactions) validates payloads on receive and is cosmetic only.
11. **Audit trail:** `game_events` is an append-only log with version and sequence for debugging disputes.
12. **Abuse limits:** max 6 seats, nickname length 1-20 (trimmed, control characters stripped), max rooms per user (e.g. 3 open), room auto-expiry.
13. **Solo mode** is local and client-trusted by design; no protection needed.

Tests: include integration tests that attempt (a) acting out of turn, (b) forging another seat, (c) replaying an action id, (d) stale version, (e) reading `game_secrets`, (f) writing to `games` directly, (g) bidding above cash, (h) non-host updating settings. All must fail.

---

## 12. Frontend and UX

### 12.1 Screens
1. **Splash/Home:** large app title "မိုနိုပိုလီ" (logo asset, not font-dependent), buttons: Play Solo, Play Online, Resume (if a save exists), How to Play, Settings.
2. **Solo setup:** choose map (two big cards with theme color), your nickname, number of bots (1-5) with a level per bot, token/color, rules (Official / House with toggles).
3. **Online:** Create Room / Join with code. **Lobby:** player list with ready checks, map, rules, bot slots, share link and copy code, host controls (kick, add bot, start).
4. **Game screen** (12.3).
5. **Game over:** winner, final net worth ranking, simple stats (rent collected, properties owned), Play Again / Home.
6. **Settings:** sound effects, music (off by default), animation speed (fast/normal), reduced motion, haptics n/a on iOS.
7. **How to Play:** concise rules page generated from `docs/RULES.md`.

### 12.2 Landscape only
- Target viewports (landscape): 844x390 (iPhone 12-15), 932x430 (Pro Max), 667x375 (SE), plus iPad landscape for convenience.
- Manifest `"orientation": "landscape"` (works on Android). **iOS Safari/PWA ignores orientation lock**, so add a full-screen "Please rotate your phone" overlay shown when `window.matchMedia('(orientation: portrait)')` matches. The game keeps running underneath.
- Respect safe areas: `viewport-fit=cover` and `env(safe-area-inset-*)` padding (notch/home indicator).
- Prevent accidental zoom/scroll: `touch-action: none` on the board, `user-scalable=no` is NOT used; custom pinch is handled inside the board only.

### 12.3 Game screen layout (landscape)
- **Left rail (~22%):** player cards (token, name, cash, colored dots for owned groups, jail icon, bot/offline badge, current-turn glow).
- **Center:** square board, side = `min(viewportHeight - 2*safeMargin, 0.52 * viewportWidth)`. Unit `u = side / 12` (9 normal tiles + 2 corners at 1.5u per side).
- **Right rail (~26%):** contextual primary button (Roll / Buy / End Turn / Pay Debt), then Properties, Build, Trade, Log, Reactions, Menu.
- **Board center:** map title, dice area, deck stacks, free-parking pot if enabled.
- **Overlays:** property deed card, card-draw reveal, auction sheet, trade composer, debt panel, jail panel, settings.
- Minimum tap target 40 px; text on tiles >= 8 px; everything else readable without zoom.

### 12.4 Board interaction (inspired by the Marmalade iPhone Monopoly app)
- Tap a tile: smooth zoom to that tile and show its deed (name, price, rent table, house cost, owner, buildings, mortgage status).
- Pinch to zoom (1x-3x), drag to pan, double-tap to reset ("free view"), available **while other players take turns**.
- Auto-follow: the camera optionally follows the active token (toggle).
- Show ownership as a colored strip on owned tiles, house/hotel pips, and a "M" corner mark when mortgaged.

### 12.5 Visual style
Clean and flat: solid fills, 8-12 px radii, soft shadow only for modals, no gradients. Theme tokens come from `map.theme` as CSS variables; switching maps re-themes the whole UI. System font stack for all UI; tabular numerals for money. The Burmese title is rendered from an SVG/PNG logo and the HTML `<title>`/manifest use the Unicode string, so no Burmese font needs to be bundled for the UI. If any Burmese text must render live, bundle a subset of Noto Sans Myanmar (Unicode).

### 12.6 Flows
- **Buy:** landing on an unowned property opens a buy sheet (Buy / Auction). Auction sheet: current high bid, bidder, timer ring, quick bid buttons (+1x, +10x, +50x, +100x of the classic unit), custom amount, Withdraw.
- **Build/Manage:** a sheet listing color groups with +/- per tile, showing legality (even-build, cash, bank stock) and totals. Mortgage/unmortgage toggles per property.
- **Trade:** pick a player, then two columns (give/get) with cash input, property checklist, jail cards; Send. Incoming offers show a banner with Accept / Decline.
- **Debt:** a panel listing sellable/mortgageable assets with the amount still needed; Pay appears when enough; Declare Bankruptcy button with confirmation.
- **Card draw:** card flips in the center, then the effect runs.
- **Event log:** scrollable, newest at the bottom, one line per event.

### 12.7 State and clients
```ts
interface GameClient {
  state: GameState;                        // latest authoritative state
  subscribe(cb: (s: GameState, e: GameEvent[]) => void): () => void;
  dispatch(action: Action): Promise<void>;
  leave(): Promise<void>;
}
```
`LocalGameClient` runs `applyAction` in the browser and schedules bots. `RemoteGameClient` calls `game-action`, handles 409 resync, and subscribes to Realtime. Zustand stores UI-only state (selected tile, open sheets, camera, settings) separately from game state.

### 12.8 Accessibility and performance
Reduced-motion setting; color groups also carry a small letter or pattern for color-blind users (Phase 5). Memoize tiles; animate with `transform`/`opacity`; keep 60 fps on iPhone 11 or newer. Strings live in `strings/en.ts` so a Burmese UI could be added later.

---

## 13. PWA and offline

- `vite-plugin-pwa` with `registerType: 'prompt'` (show "Update available" toast). Precache the app shell, both maps' data, icons, SFX, and the small font subset if any.
- Manifest: `name`/`short_name` "မိုနိုပိုလီ", `display: standalone`, `orientation: landscape`, `background_color` and `theme_color` from the default map, icons 192, 512 (+ maskable), and `apple-touch-icon` 180x180. Add `<meta name="apple-mobile-web-app-title" content="မိုနိုပိုလီ">` and the iOS standalone meta tags. Verify the Burmese title displays correctly on the iOS home screen.
- **Solo mode works fully offline** (airplane mode): no network calls in `LocalGameClient`.
- **Saves:** autosave the full local game (state + secrets + settings + seed) to IndexedDB after every action; versioned with a migration function. One "Resume" slot per map at least.
- iOS may evict site storage after long inactivity; treat saves as non-permanent and say so in Settings.
- Online screens show an offline banner and disable online actions when `navigator.onLine` is false; reconnect logic resumes the room.
- Add an "Install on iPhone" hint (Share -> Add to Home Screen) on first visit in Safari.

---

## 14. Audio and animation

- **Animations (motion):** dice roll (flat 2D dice tumble ~700 ms), token hop tile-by-tile (~140 ms per step), money counter tick-up/down with +/- floating labels, card flip, tile highlight on landing, jail door shake, building pop-in, confetti on win. Honor "reduced motion".
- **Audio (howler):** unlock on first user gesture (iOS requirement). Effects: dice, step, buy, rent paid, rent received, card flip, jail, auction tick/gavel, turn ping, build, mortgage, bankrupt, win. Mute toggle in the HUD and settings, persisted. Music optional and off by default. Use only CC0 or self-made assets and record licenses in `public/sfx/LICENSES.md`.
- Animation speed setting scales bot delays and the event queue.

---

## 15. Testing and simulation

1. **Unit tests (engine):** one or more tests per rule ID (`R-xxx` in the test name). Table-driven tests for rent (all groups, set bonus, buildings, transport counts, utilities with dice), jail paths, doubles, cards (each effect), debt and bankruptcy, auctions, trades, mortgage math and rounding, even-build and shortage.
2. **Property-based tests (fast-check):** for random legal action sequences assert invariants after every step: total money is conserved except for documented bank in/out flows (track a ledger of `money_transfer` events); no negative cash outside an open debt; each property has at most one owner; houses/hotels in play + bank = 32/12; a hotel implies 5 buildings and no houses; positions within 0-39; at most one pending decision; game ends with exactly one winner.
3. **Map validation tests:** all map JSONs against the schema and the checks in 8.1.
4. **Simulation harness (`pnpm sim`):** runs thousands of bot-vs-bot games per map and level mix with a seeded RNG. Assertions: no exceptions; every game terminates within a turn cap (e.g. 3,000 turns; log outliers); invariants hold every step. Reports win rates and average game length. Sanity targets: in 1v1 Hard vs Easy, Hard wins >= 70%; Normal beats Easy >= 60%; Hard beats Normal >= 55%; average 4-player Hard game ends within a reasonable length (track and tune).
5. **Component/UI tests:** Playwright at 844x390 landscape and a portrait rotate-overlay check; scenarios: solo game start, buy, auction, build, trade, mortgage, bankrupt.
6. **Integration tests (Supabase local):** two or more anonymous users create/join/start a game and play a scripted sequence; reconnect and takeover; all cheat tests from Section 11.
7. **CI:** lint, typecheck, unit + property tests, map validation, short simulation smoke (e.g. 200 games), web build.

---

## 16. Deployment and environments

- **Environments:** local (Supabase CLI), preview (Vercel preview + Supabase staging project if desired), production.
- **Env vars (web):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Edge Functions use the built-in service role env vars; never expose them to the client.
- **Migrations:** only through `supabase/migrations`; applied by CLI.
- **Vercel:** build `pnpm --filter web build`; add a rewrite so `/r/:code` serves the SPA; set long-cache headers for hashed assets and no-cache for `sw.js` and `index.html`.
- **Edge deploy:** `pnpm build:engine-edge && supabase functions deploy`.
- Record free-tier limits you rely on (Realtime connections, Edge Function invocations) in `docs/DECISIONS.md`.

---

## 17. Build phases and acceptance criteria

### Phase 0: Scaffold
Monorepo, TypeScript strict, ESLint/Prettier, Vitest, CI, `CLAUDE.md`, `docs/DECISIONS.md`.
**User actions (Claude Code guides, Section 20):** create the GitHub repo (20.1), then the Vercel project (20.2).
**Done when:** CI is green on an empty engine test and a web "hello" page deploys to Vercel.

### Phase 1: Engine core + maps
Types, RNG, map schema/loader/validator, both `map.json` files (with cards from Appendix B), board, dice, movement, GO, buy, rent (all kinds), taxes, cards, jail, debt, basic bankruptcy, `getLegalActions`, `netWorth`, win condition. Easy bot. Simulation harness.
**Done when:** rule tests for R-001..R-035, R-070..R-085 pass; 1,000 Easy-vs-Easy games per map finish without invariant violations.

### Phase 2: Solo MVP UI (offline PWA)
Landscape layout + rotate overlay, board rendering for both maps with theme switching, tokens (emoji), dice, buy/decline (auction stubbed as "decline"), money panels, bot turns with delays, end screen, solo setup, local autosave/resume, PWA offline.
**Done when:** a full solo game vs Easy bots can be played on an iPhone in airplane mode from the home-screen app.

### Phase 3: Full rules
Houses/hotels with even build and shortage, mortgages, auctions (with timers), trades, off-turn management, house rule toggles and Official/House switch, time limit end, Normal and Hard bots, trade AI.
**Done when:** all R-xxx tests pass; simulation sanity targets (15.4) are met.

### Phase 4: Online
**User actions (Claude Code guides, Section 20.3):** create the Supabase project, enable anonymous sign-ins, and link the CLI. Claude Code must not start backend work until the user confirms these are done.
Supabase migrations + RLS, anonymous auth, `create/join/leave/update/ready/start/game-action/game-tick`, engine bundle for Deno, lobby UI, room codes and share links, Realtime sync with event queue, reconnect, bot takeover/reclaim, turn timers, emoji reactions, cheat-protection tests.
**Done when:** 4 real phones can finish a game over the internet; killing one phone's connection triggers takeover and reclaim; all Section 11 tests pass.

### Phase 5: Polish
SVG tokens, final animations and SFX, camera follow, color-blind markers, tutorial/How to Play, stats on game over, performance pass, iOS install hints.
**Done when:** 60 fps on iPhone 11+, all UI fits at 667x375, audio mutes correctly, no console errors.

### Phase 6: Hardening and extras (optional)
Security review of RLS and functions, load test with several rooms, "Short game" preset (verify the official short-game rules in Hasbro's rulebook before implementing), extra map via the data-only path to prove extensibility, optional login.

---

## 18. Open items and assumptions (record answers in `docs/DECISIONS.md`)

1. Token and logo artwork: placeholders first (emoji), flat SVG in Phase 5. The Burmese logo is produced as an asset.
2. Sound assets: choose CC0 sources and record licenses.
3. Rounding for unmortgage (+10%): round half up to the nearest unit (R-062).
4. Auction clock is a digital adaptation of free-form bidding (R-052).
5. Off-turn building/mortgaging/trading is on in Official mode as in the printed rules; if it causes UX trouble online, ship with `offTurnManagement` default off and call it a House setting.
6. Supabase limits (CPU time per Edge Function request, Realtime message and connection limits, pg_cron granularity): verify against current docs before Phase 4.
7. If "free view" or the board zoom feels cramped on small phones, allow a scaled-up "table mode" later.

---

## 19. CLAUDE.md (copy this block to the repo root)

```markdown
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
```

---

## 20. Accounts and infrastructure setup (done by the user; Claude Code guides)

### 20.0 Protocol Claude Code must follow
1. The user creates the GitHub repository, the Vercel project and the Supabase project personally. Claude Code never signs up, creates projects, or clicks through dashboards on the user's behalf.
2. When a step needs the user, Claude Code stops and writes a **numbered checklist in plain text** with the exact button and menu labels, then says what it needs back (only non-secret values) and waits for the user to reply "done".
3. Dashboard labels change over time. Claude Code should say "labels may differ slightly" and, if the user's screen does not match, ask the user to describe what they see and adapt. Verify current steps in the official docs when unsure.
4. **Secrets:** never ask for the database password, the Supabase service role (secret) key, GitHub tokens, or any password in chat. If the user pastes one by accident, tell them to rotate it. Real values go only into gitignored `.env.local` files that the user edits personally. Commit `.env.example` with variable names only.
5. Claude Code may run local commands itself (git, pnpm, Supabase CLI) once the user has finished the account-side steps. Commands that need a browser login (for example `supabase login`) are run by the user.
6. After each user step, Claude Code verifies the result (for example pushes a commit and confirms the Vercel deployment URL works) before moving on.

### 20.1 GitHub repository (Phase 0)
**Claude Code first:** run `git init` locally, create `.gitignore` (node_modules, dist, `.env*` except `.env.example`, `.vercel`, `supabase/.temp`), make the first commit.

**User steps:**
1. Sign in at github.com. Click **New repository** (the green button or the "+" menu).
2. Repository name: `monopoli`. Choose **Private**. Do **not** add a README, .gitignore or license (the local repo already has its own files).
3. Click **Create repository** and copy the repository URL (HTTPS or SSH).
4. Make sure you can push from your computer: either run `gh auth login` (GitHub CLI) and follow the prompts, or use SSH keys, or a personal access token entered only in your own terminal credential prompt.
5. Reply with the repository URL.

**Claude Code then:** `git branch -M main`, `git remote add origin <URL>`, `git push -u origin main`, and confirms the push worked. Adds a CI workflow (`.github/workflows/ci.yml`) and asks the user to check that the first run is green in the repository's **Actions** tab.

### 20.2 Vercel project (Phase 0, verified again in Phase 2)
**Claude Code first:** make sure the repo contains a working `apps/web` Vite app, a `vercel.json` with an SPA rewrite so `/r/:code` and all routes serve `index.html`, and a clear build setup for the pnpm workspace. Tell the user which Root Directory, Install Command, Build Command and Output Directory to enter (decide and verify against current Vercel monorepo docs; a typical setup is Root Directory = repository root, Install `pnpm install`, Build `pnpm --filter web build`, Output `apps/web/dist`).

**User steps:**
1. Sign in at vercel.com (using the GitHub login is easiest). Click **Add New...** then **Project**.
2. Under **Import Git Repository**, find `monopoli`. If it is not listed, click to adjust GitHub permissions (install or configure the Vercel GitHub app) and allow access to this repository.
3. Click **Import**. Set **Framework Preset** to **Vite**.
4. Enter the Root Directory, Install Command, Build Command and Output Directory exactly as Claude Code told you (use the **Override** toggles where needed).
5. Add Environment Variables (can be done now or after Supabase exists): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, for both **Production** and **Preview**. Skip this step until Phase 4 if Supabase is not created yet.
6. Click **Deploy**. When it finishes, open the generated `*.vercel.app` URL.
7. Reply with the production URL.

**Then verify (user on iPhone, Phase 2):** open the Vercel URL in Safari (HTTPS is required for the service worker), tap **Share** then **Add to Home Screen**, open the installed app, turn on airplane mode and confirm solo play still works. Optional: add a custom domain later under the project's **Settings** then **Domains**.

### 20.3 Supabase project (start of Phase 4)
**Claude Code first:** make sure migrations (`supabase/migrations`), RLS, Edge Functions and the engine bundle are ready, and list exactly which values it will need back.

**User steps:**
1. Sign in at supabase.com. Click **New project**. Choose an organization, then enter a project name (for example `monopoli`).
2. Set a strong **database password** and store it in your password manager. Do not paste it into chat or commit it.
3. Choose the **region closest to your players** (check the current region list). Click **Create new project** and wait until it finishes provisioning.
4. Turn on anonymous sign-ins: open **Authentication**, go to the sign-in/providers settings and enable **Anonymous sign-ins** (the label may read "Allow anonymous sign-ins"). Save.
5. Find the connection values in **Project Settings** then **API** (or the **Connect** panel): copy the **Project URL** and the **anon / publishable key** (this one is designed to be public in the browser). Also note the **Project ref** (the short ID in the project URL).
6. **Do not** copy the service role / secret key anywhere. Edge Functions receive it automatically.
7. Reply with: Project URL, Project ref, and confirmation that anonymous sign-ins are on. The anon key can be pasted into `.env.local` yourself, so you never need to send it.

**Local setup (user runs in their own terminal, Claude Code gives the exact commands):**
1. Install the Supabase CLI (follow the current install instructions).
2. `supabase login` (opens the browser).
3. In the repo: `supabase init` (if not already done), then `supabase link --project-ref <PROJECT_REF>` (it asks for the database password; type it in your terminal only).
4. `supabase db push` to apply migrations (tables, RLS, realtime publication).
5. Build and deploy functions: `pnpm build:engine-edge` then `supabase functions deploy`.
6. Create `apps/web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (copy from `.env.example`), and add the same two variables in Vercel under **Settings** then **Environment Variables** (Production and Preview). Redeploy.

**Dashboard checks Claude Code should ask the user to confirm:**
1. **Database** then **Publications** (or Replication): the tables `rooms`, `room_players`, `games`, `game_events` are in the `supabase_realtime` publication.
2. **Table Editor**: every table shows RLS enabled.
3. **Edge Functions**: all functions are listed as deployed.
4. **Extensions**: enable `pg_cron` for the idle-room cleanup and the timer safety net (verify availability and intervals).
5. **Authentication** then URL configuration: add the Vercel production URL (and local dev URL) if the dashboard asks for allowed URLs.

**Notes Claude Code should relay to the user:**
- Free-tier projects may be paused after a period of inactivity (check the current policy). If the online mode stops working after a long break, restore the project from the dashboard.
- Anonymous sign-ins can be abused by bots; consider enabling the dashboard's bot protection (CAPTCHA) or rate limits later (verify current options).
- Optional: create a second Supabase project for staging so tests never touch production data.

### 20.4 When Claude Code asks the user for help
| Moment | User does | User sends back |
|---|---|---|
| Start of Phase 0 | Create the GitHub repo (20.1) | Repo URL |
| End of Phase 0 | Import the repo into Vercel (20.2) | Vercel URL |
| Phase 2 testing | Install the PWA on iPhone and test offline | Pass/fail and screenshots if something is wrong |
| Start of Phase 4 | Create the Supabase project and enable anonymous sign-ins (20.3) | Project URL, project ref |
| Phase 4 | Run the CLI login/link/deploy commands | Command output if an error appears (secrets removed) |
| Phase 4 testing | Join a room from 2-4 phones | Pass/fail |

---

## Appendix A: Classic economy table (classic units; scaled by map multiplier)

Rent columns: base, 1 house, 2 houses, 3 houses, 4 houses, hotel.

| Slot | Group | Price | Rent (base / 1 / 2 / 3 / 4 / hotel) | House cost | Mortgage |
|---|---|---|---|---|---|
| p01 | brown | 60 | 2 / 10 / 30 / 90 / 160 / 250 | 50 | 30 |
| p02 | brown | 60 | 4 / 20 / 60 / 180 / 320 / 450 | 50 | 30 |
| p03 | lightblue | 100 | 6 / 30 / 90 / 270 / 400 / 550 | 50 | 50 |
| p04 | lightblue | 100 | 6 / 30 / 90 / 270 / 400 / 550 | 50 | 50 |
| p05 | lightblue | 120 | 8 / 40 / 100 / 300 / 450 / 600 | 50 | 60 |
| p06 | pink | 140 | 10 / 50 / 150 / 450 / 625 / 750 | 100 | 70 |
| p07 | pink | 140 | 10 / 50 / 150 / 450 / 625 / 750 | 100 | 70 |
| p08 | pink | 160 | 12 / 60 / 180 / 500 / 700 / 900 | 100 | 80 |
| p09 | orange | 180 | 14 / 70 / 200 / 550 / 750 / 950 | 100 | 90 |
| p10 | orange | 180 | 14 / 70 / 200 / 550 / 750 / 950 | 100 | 90 |
| p11 | orange | 200 | 16 / 80 / 220 / 600 / 800 / 1000 | 100 | 100 |
| p12 | red | 220 | 18 / 90 / 250 / 700 / 875 / 1050 | 150 | 110 |
| p13 | red | 220 | 18 / 90 / 250 / 700 / 875 / 1050 | 150 | 110 |
| p14 | red | 240 | 20 / 100 / 300 / 750 / 925 / 1100 | 150 | 120 |
| p15 | yellow | 260 | 22 / 110 / 330 / 800 / 975 / 1150 | 150 | 130 |
| p16 | yellow | 260 | 22 / 110 / 330 / 800 / 975 / 1150 | 150 | 130 |
| p17 | yellow | 280 | 24 / 120 / 360 / 850 / 1025 / 1200 | 150 | 140 |
| p18 | green | 300 | 26 / 130 / 390 / 900 / 1100 / 1275 | 200 | 150 |
| p19 | green | 300 | 26 / 130 / 390 / 900 / 1100 / 1275 | 200 | 150 |
| p20 | green | 320 | 28 / 150 / 450 / 1000 / 1200 / 1400 | 200 | 160 |
| p21 | darkblue | 350 | 35 / 175 / 500 / 1100 / 1300 / 1500 | 200 | 175 |
| p22 | darkblue | 400 | 50 / 200 / 600 / 1400 / 1700 / 2000 | 200 | 200 |

Transports: price 200, rent 25 / 50 / 100 / 200 by count owned, mortgage 100.
Utilities: price 150, rent 4x or 10x dice total, mortgage 75.
Taxes: Income 200, Luxury 100. GO salary 200. Jail fine 50. Starting cash 1,500. Bank stock: 32 houses, 12 hotels.

---

## Appendix B: Card decks (16 per deck per map; for review)

Placeholders: `{amount}`, `{goAmount}`, `{perHouse}`, `{perHotel}`. Tile ids: `go`, `p06`, `p14`, `p22`, `t1`. "Advance" cards collect the GO salary when passing GO unless stated otherwise. Amounts are in classic units and scaled per map.

### B.1 Chance

| # | Effect | Myanmar text | Dubai text |
|---|---|---|---|
| 1 | `advance_to go` (collect GO) | Thingyan water festival begins! Advance to GO and collect {goAmount}. | Dubai Shopping Festival is here! Advance to GO and collect {goAmount}. |
| 2 | `advance_to p14` (collect if passed) | Take a road trip to Pathein. If you pass GO, collect {goAmount}. | Drive to JBR for the sunset. If you pass GO, collect {goAmount}. |
| 3 | `advance_to p06` (collect if passed) | Visit the southern coast: advance to Dawei. If you pass GO, collect {goAmount}. | A new launch in Jumeirah Village Circle catches your eye. Advance there. If you pass GO, collect {goAmount}. |
| 4 | `advance_nearest utility` (10x dice if owned) | The power grid is upgraded. Advance to the nearest utility. If unowned you may buy it; if owned, roll the dice and pay the owner 10 times the amount thrown. | A utility bill arrives. Advance to the nearest utility. If unowned you may buy it; if owned, roll the dice and pay the owner 10 times the amount thrown. |
| 5 | `advance_nearest transport` (double rent) | Catch the next train! Advance to the nearest transport. If owned, pay the owner double the rent. | Hop on the next ride! Advance to the nearest transport. If owned, pay the owner double the rent. |
| 6 | `advance_nearest transport` (double rent) | A ferry is about to leave! Advance to the nearest transport. If owned, pay the owner double the rent. | The next Metro is arriving! Advance to the nearest transport. If owned, pay the owner double the rent. |
| 7 | `collect 50` | Your tea-leaf shop earns a dividend. Collect {amount}. | Your investment fund pays a dividend. Collect {amount}. |
| 8 | `jail_free` | A lucky amulet! Get Out of Jail Free. Keep this card until needed or trade it. | Your lawyer files an appeal in time! Get Out of Jail Free. Keep this card until needed or trade it. |
| 9 | `move_back 3` | Heavy traffic on the road. Go back 3 spaces. | Stuck in rush-hour traffic on Sheikh Zayed Road. Go back 3 spaces. |
| 10 | `go_to_jail` | Go directly to Jail. Do not pass GO. Do not collect {goAmount}. | Go directly to Jail. Do not pass GO. Do not collect {goAmount}. |
| 11 | `repairs 25/100` | Monsoon rains damage your buildings. Pay {perHouse} per house and {perHotel} per hotel. | A sandstorm damages your buildings. Pay {perHouse} per house and {perHotel} per hotel. |
| 12 | `pay 15` | A traffic police fine. Pay {amount}. | A Salik gate fine. Pay {amount}. |
| 13 | `advance_to t1` (collect if passed) | Take a ride on the Yangon Circular Railway. If you pass GO, collect {goAmount}. | Take a ride on the Dubai Metro. If you pass GO, collect {goAmount}. |
| 14 | `advance_to p22` (collect if passed) | Advance to Yangon. | Advance to Palm Jumeirah. |
| 15 | `pay_each 50` | You are elected head of the pagoda trust. Pay each player {amount}. | You are elected chairman of the owners association. Pay each player {amount}. |
| 16 | `collect 150` | Your building loan matures. Collect {amount}. | Your building loan matures. Collect {amount}. |

### B.2 Community Chest

| # | Effect | Myanmar text | Dubai text |
|---|---|---|---|
| 1 | `advance_to go` (collect GO) | Festival of Lights! Advance to GO and collect {goAmount}. | UAE National Day celebrations! Advance to GO and collect {goAmount}. |
| 2 | `collect 200` | Bank error in your favor. Collect {amount}. | Bank error in your favor. Collect {amount}. |
| 3 | `pay 50` | Doctor's fee. Pay {amount}. | Doctor's fee. Pay {amount}. |
| 4 | `collect 50` | You sell your harvest at the market. Collect {amount}. | You sell some shares at a profit. Collect {amount}. |
| 5 | `jail_free` | A village elder vouches for you. Get Out of Jail Free. Keep this card until needed or trade it. | A character reference clears your name. Get Out of Jail Free. Keep this card until needed or trade it. |
| 6 | `go_to_jail` | Go directly to Jail. Do not pass GO. Do not collect {goAmount}. | Go directly to Jail. Do not pass GO. Do not collect {goAmount}. |
| 7 | `collect 100` | Your village savings circle pays out. Collect {amount}. | Your annual bonus arrives. Collect {amount}. |
| 8 | `collect 20` | Income tax refund. Collect {amount}. | Income tax refund. Collect {amount}. |
| 9 | `collect_each 10` | It is your birthday! Collect {amount} from each player. | It is your birthday! Collect {amount} from each player. |
| 10 | `collect 100` | Life insurance matures. Collect {amount}. | Life insurance matures. Collect {amount}. |
| 11 | `pay 100` | Hospital fees. Pay {amount}. | Hospital fees. Pay {amount}. |
| 12 | `pay 50` | School fees. Pay {amount}. | School fees. Pay {amount}. |
| 13 | `collect 25` | Consultancy fee. Collect {amount}. | Consultancy fee. Collect {amount}. |
| 14 | `repairs 40/115` | Street repairs: pay {perHouse} per house and {perHotel} per hotel. | Street repairs: pay {perHouse} per house and {perHotel} per hotel. |
| 15 | `collect 10` | You win second place in a chinlone tournament. Collect {amount}. | You win second place in a camel beauty contest. Collect {amount}. |
| 16 | `collect 100` | You inherit a family shop. Collect {amount}. | You inherit a share in a family villa. Collect {amount}. |

---

## Appendix C: Bot names

- **Myanmar:** Aung Aung, Hla Hla, Kyaw Kyaw, Thida, Su Su, Min Min, Nandar, Zaw Zaw, Htet Htet, Phyu Phyu, Ei Ei, Tun Tun.
- **Dubai:** Khalid, Fatima, Omar, Layla, Yousef, Mariam, Hamdan, Noor, Saeed, Aisha, Rashid, Sara.
