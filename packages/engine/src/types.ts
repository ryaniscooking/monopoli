import type { CardEffect, ColorGroup, DeckId, MapConfig } from './map/schema';

export type {
  CardConfig,
  CardEffect,
  ColorGroup,
  DeckConfig,
  DeckId,
  MapConfig,
  Tile,
} from './map/schema';

export type PlayerId = `p${0 | 1 | 2 | 3 | 4 | 5}`;
export const PLAYER_IDS: readonly PlayerId[] = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
export type TileId = string;
export type BotLevel = 'easy' | 'normal' | 'hard';

// ---------- Resolved map (money scaled to map currency units) ----------
interface TileBase {
  id: TileId;
  name: string;
  index: number;
}
export interface PropertyTile extends TileBase {
  type: 'property';
  group: ColorGroup;
  slot: number;
  price: number;
  rent: readonly number[]; // base, 1-4 houses, hotel
  houseCost: number;
  mortgage: number;
}
export interface TransportTile extends TileBase {
  type: 'transport';
  icon: string;
  price: number;
  mortgage: number;
}
export interface UtilityTile extends TileBase {
  type: 'utility';
  icon: 'electricity' | 'water';
  price: number;
  mortgage: number;
}
export type BuyableTile = PropertyTile | TransportTile | UtilityTile;
export type ResolvedTile =
  | BuyableTile
  | (TileBase & { type: 'go' | 'jail' | 'free_parking' | 'go_to_jail' })
  | (TileBase & { type: 'tax'; amount: number })
  | (TileBase & { type: 'card'; deck: DeckId });

export interface ResolvedCard {
  id: string;
  deck: DeckId;
  /** Raw text with placeholders; format with cardText(). */
  text: string;
  /** Effect with all money amounts scaled to map units. */
  effect: CardEffect;
}

export interface ResolvedMap {
  config: MapConfig;
  id: string;
  name: string;
  currency: MapConfig['currency'];
  theme: MapConfig['theme'];
  /** Classic unit -> map unit. */
  m: number;
  tiles: readonly ResolvedTile[];
  byId: Readonly<Record<TileId, ResolvedTile>>;
  buyable: readonly TileId[];
  groups: Readonly<Record<ColorGroup, readonly TileId[]>>;
  transports: readonly TileId[];
  utilities: readonly TileId[];
  /** Transport rent by number owned (index 0 = one owned), scaled. */
  transportRent: readonly number[];
  cards: Readonly<Record<string, ResolvedCard>>;
  decks: Readonly<Record<DeckId, { name: string; cardIds: readonly string[] }>>;
  tokens: MapConfig['tokens'];
  botNames: readonly string[];
}

// ---------- Settings ----------
export interface RuleSettings {
  preset: 'official' | 'house';
  startingCash: number; // classic units, scaled at use
  goSalary: number;
  doubleGoBonus: boolean;
  freeParkingPot: boolean;
  auctionOnDecline: boolean;
  evenBuild: boolean;
  unlimitedBuildings: boolean;
  doubleRentOnSet: boolean;
  noRentInJail: boolean;
  offTurnManagement: boolean;
  jailFine: number;
  turnTimerSec: 0 | 30 | 60 | 90;
  timeLimitMin: 0 | 30 | 60 | 90 | 120;
  auctionTimerSec: number;
  disconnectGraceSec: number;
  takeoverBotLevel: BotLevel;
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
  controlledBy: 'human' | 'bot';
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  /** Card ids of held Get Out of Jail Free cards (so each returns to its own deck). */
  jailCardIds: string[];
  bankrupt: boolean;
  connected: boolean;
  /** Consecutive turn-timer timeouts (R-110). */
  timeouts: number;
}

export interface PropertyState {
  owner: PlayerId | null;
  mortgaged: boolean;
  buildings: 0 | 1 | 2 | 3 | 4 | 5; // 5 = hotel
}

export type TurnPhase = 'pre_roll' | 'post_roll' | 'game_over';

/** Who money moves between. 'pot' is the Free Parking pot (house rule). */
export type Party = PlayerId | 'bank' | 'pot';

export interface DebtEntry {
  debtor: PlayerId;
  creditor: Party;
  amount: number;
  reason: string;
}

/** Work that resumes once an open debt is paid. */
export type Continuation = { kind: 'jail_move'; player: PlayerId; steps: number };

export type AuctionItem =
  | { type: 'property'; tile: TileId }
  /** R-045 building shortage: one house or hotel, placed on the winner's set. */
  | { type: 'building'; building: 'house' | 'hotel'; requestedBy: PlayerId; tile: TileId };

export type Pending =
  | { kind: 'buy'; player: PlayerId; tile: TileId; price: number }
  | {
      kind: 'auction';
      item: AuctionItem;
      highBid: number;
      highBidder: PlayerId | null;
      /** Players still bidding (withdrawn players are removed). */
      active: PlayerId[];
      /** First bid must be at least this. */
      minBid: number;
      /** Epoch ms; every bid resets it (R-052). */
      deadline: number;
    }
  | {
      kind: 'debt';
      debtor: PlayerId;
      creditor: Party;
      amount: number;
      reason: string;
      queue: DebtEntry[];
      then: Continuation | null;
    };

export interface GameState {
  schemaVersion: number;
  mapId: string;
  settings: RuleSettings;
  players: PlayerState[];
  current: PlayerId;
  /** Player who moved first; a new round starts each time play returns to their seat. */
  firstPlayer: PlayerId;
  phase: TurnPhase;
  doublesCount: number;
  lastRoll: [number, number] | null;
  rolledThisTurn: boolean;
  pending: Pending | null;
  properties: Record<TileId, PropertyState>;
  bank: { houses: number; hotels: number };
  deckCounts: Record<DeckId, number>;
  parkingPot: number;
  round: number;
  turnDeadline: number | null;
  endsAt: number | null;
  lastRoundPending: boolean;
  winner: PlayerId | null;
  endReason: 'last_standing' | 'time_limit' | null;
  trades: TradeOffer[];
  /** Next trade id number. */
  tradeSeq: number;
  /** Trade proposals made this turn, per player (anti-spam, max 3). */
  proposalsThisTurn: Partial<Record<PlayerId, number>>;
  /** Properties waiting to be auctioned one by one (bankruptcy to the bank, R-082). */
  auctionQueue: TileId[];
}

export interface TradeBundle {
  cash: number;
  tiles: TileId[];
  jailCards: number;
}

/** `give` and `get` are from the proposer's (`from`) point of view. */
export interface TradeOffer {
  id: string;
  from: PlayerId;
  to: PlayerId;
  give: TradeBundle;
  get: TradeBundle;
  expiresAt: number;
}

// ---------- Hidden (server only; never sent to clients) ----------
export interface GameSecrets {
  chanceOrder: string[]; // card ids, top first
  chestOrder: string[];
}

export interface SeatInit {
  name: string;
  token: string;
  color: string;
  kind: 'human' | 'bot';
  botLevel?: BotLevel;
}

// ---------- Actions (intents) ----------
export type Action =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline_buy' }
  | { type: 'mortgage'; tile: TileId }
  | { type: 'unmortgage'; tile: TileId }
  | { type: 'pay_jail_fine' }
  | { type: 'use_jail_card' }
  | { type: 'end_turn' }
  | { type: 'pay_debt' }
  | { type: 'declare_bankruptcy' }
  | { type: 'build'; tile: TileId }
  | { type: 'sell_building'; tile: TileId }
  | { type: 'auction_bid'; amount: number }
  | { type: 'auction_withdraw' }
  | { type: 'propose_trade'; to: PlayerId; give: TradeBundle; get: TradeBundle }
  | { type: 'accept_trade'; id: string }
  | { type: 'decline_trade'; id: string }
  | { type: 'cancel_trade'; id: string }
  /** Server/local clock tick: ends expired auctions, trades, turn timers, the time limit. */
  | { type: 'system_timeout' };

// ---------- Events (animation, sound, log) ----------
export type GameEvent =
  | { type: 'turn_order'; rolls: { player: PlayerId; total: number }[][]; first: PlayerId }
  | { type: 'turn_started'; player: PlayerId; round: number }
  | {
      type: 'dice_rolled';
      player: PlayerId;
      dice: [number, number];
      doubles: boolean;
      purpose: 'move' | 'jail' | 'utility';
    }
  | { type: 'moved'; player: PlayerId; path: number[]; mode: 'walk' | 'back' | 'jump' }
  | { type: 'passed_go'; player: PlayerId; amount: number }
  | { type: 'landed'; player: PlayerId; tile: TileId }
  | { type: 'bought'; player: PlayerId; tile: TileId; price: number }
  | { type: 'buy_declined'; player: PlayerId; tile: TileId }
  | { type: 'rent_paid'; from: PlayerId; to: PlayerId; tile: TileId; amount: number }
  | { type: 'tax_paid'; player: PlayerId; tile: TileId; amount: number }
  | { type: 'card_drawn'; player: PlayerId; deck: DeckId; card: string }
  | { type: 'money_transfer'; from: Party; to: Party; amount: number; reason: string }
  | { type: 'jailed'; player: PlayerId; reason: 'tile' | 'card' | 'doubles' }
  | { type: 'released'; player: PlayerId; how: 'doubles' | 'fine' | 'card' | 'forced_fine' }
  | { type: 'mortgaged'; player: PlayerId; tile: TileId; amount: number }
  | { type: 'unmortgaged'; player: PlayerId; tile: TileId; amount: number }
  | { type: 'debt_started'; debtor: PlayerId; creditor: Party; amount: number; reason: string }
  | { type: 'debt_cleared'; debtor: PlayerId }
  | { type: 'bankrupt'; player: PlayerId; creditor: Party }
  | { type: 'property_returned'; tile: TileId }
  | { type: 'built'; player: PlayerId; tile: TileId; buildings: number; cost: number }
  | { type: 'sold_building'; player: PlayerId; tile: TileId; buildings: number; amount: number }
  | { type: 'auction_started'; item: AuctionItem; minBid: number; deadline: number }
  | { type: 'auction_bid'; player: PlayerId; amount: number; deadline: number }
  | { type: 'auction_withdrew'; player: PlayerId }
  | { type: 'auction_ended'; item: AuctionItem; winner: PlayerId | null; amount: number }
  | { type: 'trade_proposed'; offer: TradeOffer }
  | { type: 'trade_accepted'; offer: TradeOffer }
  | { type: 'trade_declined'; id: string }
  | {
      type: 'trade_cancelled';
      id: string;
      reason: 'cancelled' | 'expired' | 'invalid' | 'bankrupt';
    }
  | { type: 'timed_out'; player: PlayerId; action: Action['type'] }
  | { type: 'control_changed'; player: PlayerId; controlledBy: 'human' | 'bot' }
  | { type: 'last_round'; endsAt: number }
  | { type: 'game_over'; winner: PlayerId; reason: 'last_standing' | 'time_limit' };

export interface RuleError {
  code: 'ILLEGAL_ACTION' | 'NOTHING_DUE';
  message: string;
}

export type ApplyResult =
  | { ok: true; state: GameState; secrets: GameSecrets; events: GameEvent[] }
  | { ok: false; error: RuleError };

export interface PublicView {
  map: ResolvedMap;
  state: GameState;
}
