# မိုနိုပိုလီ (Monopoli): UI design brief

A brief for redesigning the look of a finished, working game. Every feature below already exists and
works. **The goal is a new visual design: layout, components, colors, typography, motion.** Game
rules and behavior stay the same.

---

## 1. The product

- A Monopoly-style board game for **iPhone, landscape only**, installed from Safari as a web app
  (PWA, full screen, works offline for solo play).
- **Two maps** with their own look and currency:
  - **Myanmar**: money in kyat, e.g. `1,500,000 Ks` (compact `1.5M Ks`, `200K Ks`).
  - **Dubai**: money in dirham, e.g. `AED 1,500`.
- **Solo** against 1 to 5 bots (Easy / Normal / Hard), saved automatically on the phone.
- **Online** with friends: 2 to 6 players per room (empty seats can be bots), joined by a 6-letter
  room code or link.
- Players: friends and family, casual. Interface language: **English only**. The app name is
  Burmese (မိုနိုပိုလီ) and appears as a logo image.

## 2. Hard constraints

| Topic        | Requirement                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation  | Landscape only. Portrait shows a full-screen "Please rotate your phone" overlay.                                                                                     |
| Screen sizes | Design at **844 x 390** (iPhone 12-15). Must also fit **667 x 375** (iPhone SE, smallest) and **932 x 430** (Pro Max). No page scrolling; only panels scroll inside. |
| Safe areas   | Notch / Dynamic Island on the left or right edge, home indicator at the bottom. Keep content inside the safe area.                                                   |
| Touch        | Fingers only. Tap targets at least 40 x 40 pt. Text never below 8 px (board tiles), 11 px elsewhere.                                                                 |
| Theme        | Every color comes from the **active map's theme** (section 4). Switching maps re-themes the whole UI.                                                                |
| Style        | Flat: solid fills, rounded corners, soft shadow for floating panels only. (Open to a new direction; see section 12.)                                                 |
| Fonts        | System font (San Francisco). Numbers use tabular figures. Burmese appears only in the logo image (no Burmese font).                                                  |
| Performance  | 60 fps on iPhone 11+. Animate only position, scale and opacity. Avoid heavy blur.                                                                                    |

## 3. Navigation map

```
Home ─┬─ Resume (one per map with a save) ──────────────► Game
      ├─ Play Solo ─► Solo setup ─► Start game ─────────► Game
      ├─ Play Online ─► Online home ─► Create / Join ─► Lobby ─► Game
      ├─ How to Play
      └─ Settings
Game ─ sheets: Manage · Trade · Log · Menu (Settings, Save and exit, Quit)
     ─ panels that open by themselves: Auction · Raise cash (debt) · Card reveal · Game over
Global overlays: Rotate phone · Install on iPhone hint · Update available · Offline banner
```

## 4. Theme system (map data)

Each map defines these colors. The UI may only use these plus white, black and neutral greys.

| Token       | Use today                                              | Myanmar          | Dubai          |
| ----------- | ------------------------------------------------------ | ---------------- | -------------- |
| `primary`   | App background, board title, transport tiles           | `#7A1F2B` maroon | `#0B2A4A` navy |
| `secondary` | Secondary buttons, utilities                           | `#2E7D4F` green  | `#18A3A5` teal |
| `accent`    | Primary buttons, highlights, current-turn glow, timers | `#E0A526` gold   | `#C9A227` gold |
| `boardBg`   | Board center                                           | `#F6EBD0`        | `#F2E3C6`      |
| `tileBg`    | Tiles, cards, panels                                   | `#FFFBF0`        | `#FFF9EC`      |
| `text`      | Ink color                                              | `#2A1A14`        | `#12263A`      |

**Color groups** (same on both maps): brown `#8B5A3C`, lightblue `#8ED1F0`, pink `#D86FA6`,
orange `#F28C28`, red `#D62F2F`, yellow `#F2D338`, green `#2E9E5B`, darkblue `#1F3FA6`.
Yellow and lightblue need dark text on top; the others take white text.

**Player colors** (6): `#E63946` red, `#1D7FE0` blue, `#2EAD5B` green, `#F4A300` amber,
`#8E44AD` purple, `#14B8A6` teal.

**Color-blind letters** (setting, on by default): B, L, P, O, R, Y, G, D shown on each group's
color band wherever a group color appears.

Please show both maps' versions of the key screens.

## 5. Screens

### 5.1 Home

- Logo (Burmese wordmark image, `logo.png`; can be redesigned or framed).
- Buttons: **Resume** (one per saved map, with "Myanmar · round 12"), **Play Solo**, **Play Online**,
  **How to Play**, **Settings**.
- When a save exists, Resume is the primary button.

### 5.2 Solo setup

- **Map** picker: two big cards (name, currency code, a strip of group colors, map colors).
- **Your name** (text input, max 20).
- **Bots**: stepper 1 to 5.
- **Bot level** per bot: Easy / Normal / Hard (one row per bot, up to 5 rows).
- **Rules**: Official / House rules... (opens the House rules sheet).
- **Token** picker: the map's 8 tokens (silhouette icons, section 7.2).
- **Color** picker: 6 player colors.
- **Start game** (always visible, even at 667 x 375). Note under it if this replaces a save.

### 5.3 House rules sheet (modal, from setup or lobby)

- Header: "House rules", **Official** (reset) and **Close**.
- Choice rows (segmented buttons): Starting cash (4 options), GO salary (4), Jail fine (2),
  Time limit (Off, 30, 60, 90, 120 min), Auction timer (10/15/20/30 s).
  Online only: Turn timer (Off/30/60/90 s), Reconnect grace (30/60/120 s), Stand-in bot level.
- 8 on/off toggles: Auction properties nobody buys, Build evenly, Double rent on full color sets,
  Build/mortgage/trade any time, Free Parking pot, Double salary for landing on GO, No rent while in
  Jail, Unlimited houses and hotels.
- Read-only version for non-hosts in the lobby.

### 5.4 Online home

- Your name, **Create room**; or Room code (6 letters) + **Join**.
- "Rejoin room ABC234" when the player was in a room.
- Messages: offline ("You are offline..."), not configured.

### 5.5 Lobby

- Title "Room ABC234", **Share link** / Copy (shows "Link copied").
- **Players** list (up to 6 seats): token, name, "(You)", Host badge, Bot · level, Ready / Not ready,
  host-only Kick / Remove.
- Host: **Add bot** (with level), **Map** choice, **Rules** (Official / House rules), **Start game**
  (disabled until 2-6 players are all ready; hint "Need 2-6 players, everyone ready.").
- Guests: **I'm ready / Not ready**, "Waiting for the host to start...", View rules.
- Everyone: own **Token** (taken ones disabled) and **Color**; **Leave room**.

### 5.6 Game screen (the main screen; most of the design effort)

Three columns today: **players (22%) | board (square, full height) | actions (26%)**.

**Left: player rail** (2 to 6 cards, scrolls if needed). Each card:

- Token icon, name, "(You)", bot badge with level letter (E/N/H), jail lock icon.
- Cash (animated count up/down), or "Bankrupt" (card dimmed).
- 8 small dots, one per color group: filled when owning any of it, outlined ring when owning the
  whole set.
- Current player: glow ring in accent color.
- Floating "+150K Ks" / "-AED 50" when money changes; floating emoji reactions (online).
- Online only: a 😀 button opens an 8-emoji tray (👍 😂 😮 😡 🎉 😭 🔥 🙏).

**Center: the board** (section 6).

**Right: action rail**, top to bottom:

1. **Primary action**, changes with the situation:
   - Your turn: **Roll** (in Jail: "Roll for doubles" + "Pay AED 50" + "Use Jail card").
   - Landed on an unowned place: **Buy AED 200** + **Don't buy** (the deed shows below).
   - After rolling: **End turn**.
   - Otherwise a status line: "Hla Hla is playing...", "Your move", "Auction in progress".
2. Online turn timer: "⏱ 25s" (turns red under 10 s).
3. Scroll area: incoming / outgoing **trade offers** (section 5.8) and the **title deed** of the
   selected tile (section 7.1).
4. Bottom nav, 4 icon buttons: **Manage**, **Trade**, **Log**, **Menu**.

Other in-game states to design:

- Error toast at the top ("..." + OK).
- "Offline: reconnecting..." banner (online).

### 5.7 Manage sheet (modal)

- Header: "Manage", "Bank: 32 houses · 12 hotels" (∞ when unlimited), Close.
- Hint: "Own a whole color set (none mortgaged) to build. Build and sell evenly."
- Sections by color group, then transports, then utilities. Each owned place is a row:
  name, house/hotel indicators, "Mortgaged" tag, and buttons: **- AED 25** (sell), **+ AED 50**
  (build), **Mortgage +AED 30** / **Unmortgage -AED 33**. Disabled when not allowed.
- Empty state: "You don't own any properties yet."

### 5.8 Trade

**Trade builder (modal):**

- Header "Trade" with player tabs (who to trade with), Close.
- Two columns, **You give** / **You get**: Cash input (with max), Jail cards stepper, list of that
  player's tradable places (checkbox, color swatch, name, "M" if mortgaged, ⓘ opens its deed).
- **Send offer**. Empty state "No one to trade with."

**Offer card** (in the right rail; incoming and outgoing):

- "Saeed offers a trade" + countdown "60s" (offers expire after 60 s).
- "Gives you: AED 100 [Deira]" / "Wants: [Dubai Metro] [International City]". Places are colored
  chips; tap a chip to see its deed.
- Incoming: **Accept**, **Decline**, **View cards**. Outgoing: **Cancel offer**, **View cards**.

**Trade details (modal, "View cards"):** "Trade with Saeed", Accept / Decline / Close in the header,
two columns **You get** | **You give**, cash and Jail cards as text, every place as a full title deed.

### 5.9 Auction panel (opens for everyone during an auction)

- Left: the deed of the place being auctioned (or "One house, the bank is running low").
- Right: "Auction", circular **countdown ring** (resets on each bid), status "High bid AED 120 ·
  Omar" or "No bids yet · minimum AED 1".
- Quick bid buttons (+1, +10, +50, +100 in map units), custom amount input + **Bid**, **Drop out**.
- States: "You are the high bidder" (green), "You dropped out. Waiting for the auction to end...".

### 5.10 Raise cash (debt) panel

- "Raise cash", "You owe AED 300 · Owed to Saeed / the bank", "Still needed: AED 120".
- Mortgage buttons for each place ("Deira · +AED 30").
- **Pay AED 300** (enabled once cash is enough), **Declare bankruptcy** → confirm box
  ("Give up? ..." / Yes, I'm bankrupt / Keep playing).

### 5.11 Log sheet

- Scrollable list of recent events ("Omar rolled 4 + 3", "Saeed paid AED 24 rent to Layla",
  "Hla Hla drew Chance: ..."). Up to 300 lines.

### 5.12 Menu sheet

- Back to game, Settings, **Sound on / Sound off**, Save and exit (online: "Back to home (rejoin
  later)"), Quit game (online: "Leave game") with a red confirm box.

### 5.13 Game over (modal)

- "Game over", "**Saeed wins!**", reason (Last player standing / Time limit: highest net worth).
- Ranking table: rank, name, Net worth, Rent in, Rent out, Props, Built, Jail, Turns (up to 6 rows,
  must fit 667 x 375). Bankrupt players show "Bankrupt".
- **Play again**, **Home**.

### 5.14 How to Play

- Left: list of 14 sections (Goal, Your turn, Landing on a place, Rent, Building, Auctions,
  Mortgages, Jail, Owing money, Trading, House rules, Playing online, Board controls).
- Right: the section text (headings, paragraphs, bullet lists, bold). Content: `docs/RULES.md`.

### 5.15 Settings

- Animation speed (Normal / Fast), Reduced motion, Sound effects, Camera follows the moving token
  when zoomed in, Color-blind markers. A note about where solo games are saved.

### 5.16 Global overlays

- **Rotate phone** (portrait): icon + "Please rotate your phone" + "မိုနိုပိုလီ is played in
  landscape."
- **Install on iPhone** (Safari, home screen, first visits): "1. Tap Share [icon] 2. Choose 'Add to
  Home Screen' 3. Tap Add", explanation line, **Got it**.
- **Update available** toast with **Update**; "Ready to play offline." toast.

## 6. The board

- A square of **11 x 11 tile slots**: 4 corners + 9 tiles per side, 40 tiles total. In units of
  `u = side / 12`: corners are 1.5u x 1.5u, side tiles 1u x 1.5u. At 844 x 390 the board is about
  370 px square, so a side tile is about 31 x 46 px: **very small**. Text must stay readable (min
  8 px). Names wrap and may be shortened by size, never truncated with "...".
- Tile text faces the board center (bottom row upright, left side rotated 90°, top 180°, right 270°).
- Play goes clockwise from **GO** (bottom-right corner).
- **Tile types:**
  - **Property:** color band (with group letter), name, price (`200K`, `AED 60`). Owned: a thin
    bar in the owner's color. Houses (1-4 small squares) and hotel (1 bar) sit in the band.
    Mortgaged: faded.
  - **Transport** (4 per map, e.g. Dubai Metro, Yangon Circular Railway): icon, name, price.
  - **Utility** (Electricity ⚡, Water 💧), **Tax** (💰 + amount), **Chance** (?) and **Community
    Chest** (🎁).
  - **Corners:** GO ("Collect AED 200", arrow), Jail / Just Visiting (barred cell in the corner),
    Free Parking (Myanmar "Teahouse" 🍵, Dubai "Desert Oasis" 🏝️), Go To Jail (👮).
- **Board center:** map name ("MYANMAR" / "DUBAI"), two dice, Chance and Community Chest deck
  outlines, "Round 3", optional "Pot 450K Ks", optional "Time left 12:05" / "Last round".
- **Tokens:** circular pieces with the player's silhouette in the player's color; several tokens on
  one tile spread out; the current player's token is slightly larger with an accent ring; tokens
  in Jail sit inside the barred cell.
- **Highlight:** the tile just landed on, and the selected tile, get an accent ring.
- **Card reveal:** a card flips in over the board ("CHANCE" / "COMMUNITY CHEST" + card text) for
  about 2.4 s.
- **Interaction:** tap a tile → zoom in on it and show its deed in the right rail; pinch to zoom
  (1x-3x); drag to pan; double-tap to zoom back out. The board is clipped to its square.

### Example tile names (longest ones must fit)

- Myanmar: Hakha, Loikaw, Yangon Circular Railway, Hpa-An, Myitkyina, Sittwe, Dawei, Myeik, Magway,
  Myanmar Railways Express, Monywa, Meiktila, Pyin Oo Lwin, Teahouse, Pyay, Bago, Pathein,
  Irrawaddy River Ferry, Ngapali, Inle Lake, Bagan, Taunggyi, Mawlamyine, Naypyidaw, Yangon
  International Airport, Mandalay, Commercial Tax, Yangon.
- Dubai: Deira, Al Karama, Municipality Fee, Dubai Metro, International City, Dubai Silicon Oasis,
  Al Barsha, Jumeirah Village Circle, Dubai Sports City, Dubai Festival City, Dubai Tram, Dubai Hills
  Estate, Jumeirah Lake Towers, Dubai Creek Harbour, Desert Oasis, Business Bay, Dubai Marina,
  Jumeirah Beach Residence, Palm Monorail, Dubai Frame, Dubai Mall, Museum of the Future, Downtown
  Dubai, Bluewaters Island, Emirates Hills, Abra Water Taxi, Burj Khalifa, Salik Toll, Palm
  Jumeirah.

## 7. Shared components

### 7.1 Title deed card

Used in the right rail, auction panel, trade details and deed pop-ups. Printed-card style today:

- Header band in the group color: small "TITLE DEED" caption, name in capitals, group letter, close
  (x) when dismissible.
- Rows (label left, amount right): Price, Rent, Rent with color set, With 1-4 houses, With hotel,
  House cost, Mortgage value. Transport: Rent · 1/2/3/4 owned. Utility: one explanatory line.
- Footer: "Owner: ● Saeed" / "For sale", plus "Mortgaged" when it is.
- Must work at about 170-300 px wide.

### 7.2 Player tokens

Flat single-color silhouettes (24 x 24 SVG path, stored in map data), drawn in the player's color,
usually on a white disc with a colored ring.

- Myanmar: Chinthe (lion), Pagoda, Longyi, Bullock cart, Trishaw, Hintha bird, Mohinga bowl,
  Chinlone ball.
- Dubai: Dhow, Camel, Skyscraper, Falcon, Dallah coffee pot, Abra boat, Supercar, Date palm.
  New silhouettes are welcome: deliver each as a **single SVG path in a 24 x 24 box**, one color.

### 7.3 Others

- Buttons: primary (accent), secondary (translucent on the dark background), light (white),
  danger (red); pressed state scales down slightly; disabled at 40% opacity.
- Modal sheet: dimmed backdrop, rounded panel, sticky header with title and actions.
- Segmented choices, steppers (- 3 +), toggles/checkboxes, text inputs.
- Money: always formatted by the map (prefix `AED 1,500` or suffix `1,500,000 Ks`; compact forms
  `1.5M Ks`, `200K`).
- Dice: two white dice with pips.
- Countdown ring (auction), countdown text (trade offers, turn timer).

## 8. Motion and feedback (keep, can be restyled)

- Dice tumble (~0.65 s), then the token **hops tile by tile** (~0.15 s per step).
- Money pop-ups over the token and on the player card; cash counters animate.
- Card flip reveal; current-player glow; tile highlight on landing and building.
- Camera follow: when zoomed in, the board pans with the moving token.
- Sound effects for dice, steps, buy, rent paid / received, card, jail, auction tick and gavel,
  your-turn ping, build, mortgage, bankrupt, win.
- **Settings:** Fast speed halves durations; Reduced motion nearly removes movement.
- Inputs are locked while an animation plays (buttons may look disabled briefly).

## 9. States and edge cases to cover

- 2 players vs 6 players (left rail with 6 cards at 375 px height).
- Long names (20 characters) and big numbers (`12,500,000 Ks`).
- Your turn vs waiting for others vs online with a turn timer.
- In Jail; owning a full set with houses and a hotel; mortgaged places; bankrupt players.
- Auction you lead / you dropped out; debt you can / cannot pay.
- Incoming offer + your own outgoing offer at the same time.
- Myanmar (maroon/gold) and Dubai (navy/gold) themes.

## 10. Accessibility

- Color is never the only signal: group letters, text labels on states (Mortgaged, Bankrupt, In
  Jail), icons with labels.
- Contrast: text on group colors must stay readable (dark text on yellow and lightblue).
- Respect Reduced motion.

## 11. What to deliver

1. Visual direction: colors used from the theme, type scale, spacing, corner radius, shadows,
   button styles, for **both maps**.
2. Mockups at **844 x 390**, plus the game screen at **667 x 375**:
   Home, Solo setup, House rules, Online home, Lobby (host and guest), Game (your turn, buy decision,
   waiting, in Jail, zoomed in on a tile), Manage, Trade builder, Offer card, Trade details, Auction,
   Raise cash, Log, Menu, Game over, How to Play, Settings, overlays.
3. The board and tiles in detail (all tile types and states, at real size).
4. Component sheet: buttons, deed card, player card, offer card, sheets, inputs, chips, tokens.
5. Notes on motion if you want to change it.
6. HTML/CSS (Tailwind-friendly) is ideal; the app is React + Tailwind CSS 4, and colors must stay
   theme tokens (CSS variables), not fixed hex values.

## 12. Room for change

- The three-column layout, the left/right rails, the bottom nav and the board frame can all be
  rethought, as long as the board stays square and as large as possible, and every function above
  stays reachable in one or two taps.
- The flat style is the current choice, not a rule; a richer "board game on a table" feel is
  welcome if it stays fast and readable on a small phone.
- Out of scope: game rules, bot behavior, online behavior, new features.
