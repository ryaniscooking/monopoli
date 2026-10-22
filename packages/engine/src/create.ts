import { CLASSIC_BANK } from './map/classic';
import { rollDie, shuffle, type Rng } from './rng';
import {
  PLAYER_IDS,
  type GameEvent,
  type GameSecrets,
  type GameState,
  type PlayerId,
  type PlayerState,
  type ResolvedMap,
  type RuleSettings,
  type SeatInit,
} from './types';

export const STATE_SCHEMA_VERSION = 2;

/** R-001 .. R-004: a new game with shuffled decks and the roll-off for first player. */
export function createGame(
  map: ResolvedMap,
  settings: RuleSettings,
  seats: readonly SeatInit[],
  rng: Rng,
  now: number,
): { state: GameState; secrets: GameSecrets; events: GameEvent[] } {
  if (seats.length < 2 || seats.length > 6) {
    throw new Error(`A game needs 2-6 players, got ${seats.length}`);
  }

  const players: PlayerState[] = seats.map((seat, i) => ({
    id: PLAYER_IDS[i] as PlayerId,
    seat: i,
    name: seat.name,
    token: seat.token,
    color: seat.color,
    kind: seat.kind,
    ...(seat.kind === 'bot' ? { botLevel: seat.botLevel ?? 'easy' } : {}),
    controlledBy: seat.kind,
    cash: settings.startingCash * map.m,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    jailCardIds: [],
    bankrupt: false,
    connected: true,
    timeouts: 0,
  }));

  // R-004: everyone rolls; highest total starts, tied leaders re-roll.
  const rounds: { player: PlayerId; total: number }[][] = [];
  let contenders = players.map((p) => p.id);
  let first: PlayerId;
  for (;;) {
    const rolls = contenders.map((player) => ({ player, total: rollDie(rng) + rollDie(rng) }));
    rounds.push(rolls);
    const best = Math.max(...rolls.map((r) => r.total));
    const top = rolls.filter((r) => r.total === best);
    if (top.length === 1) {
      first = (top[0] as (typeof top)[number]).player;
      break;
    }
    contenders = top.map((r) => r.player);
  }

  const properties: GameState['properties'] = {};
  for (const id of map.buyable) properties[id] = { owner: null, mortgaged: false, buildings: 0 };

  // R-003: hidden deck order.
  const secrets: GameSecrets = {
    chanceOrder: shuffle(rng, map.decks.chance.cardIds),
    chestOrder: shuffle(rng, map.decks.chest.cardIds),
  };

  const state: GameState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    mapId: map.id,
    settings: { ...settings },
    players,
    current: first,
    firstPlayer: first,
    phase: 'pre_roll',
    doublesCount: 0,
    lastRoll: null,
    rolledThisTurn: false,
    pending: null,
    properties,
    bank: { ...CLASSIC_BANK },
    deckCounts: { chance: secrets.chanceOrder.length, chest: secrets.chestOrder.length },
    parkingPot: 0,
    round: 1,
    turnDeadline: null,
    endsAt: settings.timeLimitMin > 0 ? now + settings.timeLimitMin * 60_000 : null,
    lastRoundPending: false,
    winner: null,
    endReason: null,
    trades: [],
    tradeSeq: 1,
    proposalsThisTurn: {},
    auctionQueue: [],
  };

  const events: GameEvent[] = [
    { type: 'turn_order', rolls: rounds, first },
    { type: 'turn_started', player: first, round: 1 },
  ];
  return { state, secrets, events };
}
