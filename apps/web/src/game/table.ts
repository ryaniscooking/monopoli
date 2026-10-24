// Presentation layer: plays each batch of engine events as animations, then shows the new state.
// Inputs are locked while the queue drains (spec 10.8 / 12.7); bots act once it is idle (spec 9.4).
import {
  cardText,
  type Action,
  type DeckId,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ResolvedMap,
} from '@monopoli/engine';
import { create } from 'zustand';
import type { TableClient } from '../clients/GameClient';
import { timeScale } from '../store/settings';
import { describeEvent } from './describe';
import { playSfx } from '../audio/sfx';

export interface MoneyFloat {
  id: number;
  player: PlayerId;
  amount: number;
}

export interface TableState {
  client: TableClient | null;
  map: ResolvedMap | null;
  /** The state the UI shows; lags the client state while animations play. */
  view: GameState | null;
  /** Token positions as currently drawn. */
  pos: Partial<Record<PlayerId, number>>;
  busy: boolean;
  dice: [number, number] | null;
  rolling: boolean;
  card: { deck: DeckId; deckName: string; text: string } | null;
  landed: number | null;
  floats: MoneyFloat[];
  log: { id: number; text: string }[];
  error: string | null;
  /** Online (RemoteGameClient) rather than solo. */
  online: boolean;
}

const empty = (): TableState => ({
  client: null,
  map: null,
  view: null,
  pos: {},
  busy: false,
  dice: null,
  rolling: false,
  card: null,
  landed: null,
  floats: [],
  log: [],
  error: null,
  online: false,
});

export const useTable = create<TableState>()(() => empty());

const set = useTable.setState;
const get = useTable.getState;

let queue: { state: GameState; events: GameEvent[] }[] = [];
let draining = false;
let botTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let nextId = 1;
/** Bumped on every start/stop so stale async work from an old game is ignored. */
let generation = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * timeScale()));

function positions(state: GameState): Partial<Record<PlayerId, number>> {
  return Object.fromEntries(state.players.map((p) => [p.id, p.position]));
}

export function startTable(client: TableClient): void {
  stopTable();
  const gen = generation;
  set({
    ...empty(),
    client,
    map: client.map,
    view: client.state,
    pos: positions(client.state),
    online: 'roomId' in client,
  });
  unsubscribe = client.subscribe((state, events) => {
    if (gen !== generation) return;
    queue.push({ state, events });
    void drain(gen);
  });
  scheduleBot();
}

export function stopTable(): void {
  generation++;
  if (tickTimer) clearTimeout(tickTimer);
  tickTimer = null;
  queue = [];
  draining = false;
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  get().client?.close?.();
  set(empty());
}

/** When this device started the dice tumbling before the server answered (online). */
let rollStartedAt: number | null = null;
/** A move from this device is on its way to the server. */
let inFlight = false;

/** A human intent from this device. Ignored while animations play. */
export async function act(action: Action): Promise<void> {
  const { client, busy } = get();
  // One intent at a time: a quick double tap must not send the move twice.
  if (!client || busy || inFlight) return;
  inFlight = true;
  // Online, the server decides the roll; start the tumble now so the tap feels instant.
  if (action.type === 'roll' && get().online) {
    rollStartedAt = performance.now();
    set({ rolling: true });
  }
  try {
    await client.dispatch(action);
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    inFlight = false;
    // No dice event arrived (an error, or the move was already applied): stop tumbling.
    if (rollStartedAt !== null && !draining) {
      rollStartedAt = null;
      set({ rolling: false });
    }
  }
}

async function drain(gen: number): Promise<void> {
  if (draining) return;
  draining = true;
  set({ busy: true });
  while (queue.length > 0 && gen === generation) {
    const batch = queue.shift();
    if (!batch) break;
    for (const e of batch.events) {
      if (gen !== generation) return;
      await play(e, batch.state);
    }
    if (gen !== generation) return;
    set({ view: batch.state, pos: positions(batch.state) });
  }
  draining = false;
  set({ busy: false });
  scheduleBot();
}

function log(text: string | null) {
  if (!text) return;
  set((s) => ({ log: [...s.log, { id: nextId++, text }].slice(-300) }));
}

function float(player: PlayerId, amount: number) {
  const id = nextId++;
  set((s) => ({ floats: [...s.floats, { id, player, amount }] }));
  setTimeout(() => set((s) => ({ floats: s.floats.filter((f) => f.id !== id) })), 1400);
}

async function play(e: GameEvent, state: GameState): Promise<void> {
  const map = get().map;
  if (!map) return;
  log(describeEvent(map, state, e));
  const me = get().client?.me;
  switch (e.type) {
    case 'dice_rolled': {
      playSfx('dice');
      set({ rolling: true });
      // If the tumble already started on tap, only finish the rest of it.
      const spent = rollStartedAt === null ? 0 : performance.now() - rollStartedAt;
      rollStartedAt = null;
      await wait(Math.max(150, 650 - spent));
      set({ rolling: false, dice: e.dice });
      await wait(300);
      return;
    }
    case 'moved':
      if (e.mode === 'jump') {
        playSfx('step');
        set((s) => ({ pos: { ...s.pos, [e.player]: e.path.at(-1) } }));
        await wait(400);
        return;
      }
      for (const step of e.path) {
        playSfx('step');
        set((s) => ({ pos: { ...s.pos, [e.player]: step } }));
        await wait(150);
      }
      return;
    case 'landed':
      set({ landed: map.byId[e.tile]?.index ?? null });
      await wait(200);
      return;
    case 'card_drawn': {
      const card = map.cards[e.card];
      if (!card) return;
      playSfx('card');
      set({
        card: {
          deck: e.deck,
          deckName: map.decks[e.deck].name,
          text: cardText(map, card, state.settings),
        },
      });
      await wait(2400);
      set({ card: null });
      return;
    }
    case 'money_transfer':
      if (e.from !== 'bank' && e.from !== 'pot') float(e.from, -e.amount);
      if (e.to !== 'bank' && e.to !== 'pot') float(e.to, e.amount);
      await wait(120);
      return;
    case 'rent_paid':
      playSfx(e.to === me ? 'rentReceived' : e.from === me ? 'rentPaid' : 'coin');
      return;
    case 'jailed':
      playSfx('jail');
      await wait(500);
      return;
    case 'passed_go':
      playSfx('coin');
      return;
    case 'tax_paid':
      if (e.player === me) playSfx('rentPaid');
      return;
    case 'mortgaged':
    case 'unmortgaged':
      playSfx('mortgage');
      return;
    case 'bought':
      playSfx('buy');
      await wait(300);
      return;
    case 'bankrupt':
      playSfx('bankrupt');
      await wait(300);
      return;
    case 'auction_ended':
      playSfx('gavel');
      await wait(300);
      return;
    case 'trade_accepted':
      playSfx('buy');
      await wait(300);
      return;
    case 'game_over':
      playSfx(e.winner === me ? 'win' : 'bankrupt');
      return;
    case 'built':
    case 'sold_building':
      playSfx(e.type === 'built' ? 'build' : 'mortgage');
      set({ landed: map.byId[e.tile]?.index ?? null });
      await wait(250);
      return;
    case 'auction_bid':
      playSfx('tick');
      await wait(120);
      return;
    case 'turn_started':
      if (e.player === me) playSfx('turn');
      set({ landed: null });
      await wait(250);
      return;
    default:
      return;
  }
}

let tickTimer: ReturnType<typeof setTimeout> | null = null;

/** Wake up at the next deadline (auction timer, trade expiry, time limit) and apply the clock. */
function scheduleTick(): void {
  if (tickTimer) clearTimeout(tickTimer);
  tickTimer = null;
  const { client } = get();
  const deadline = client?.nextDeadline?.() ?? null;
  if (!client || deadline === null) return;
  const gen = generation;
  tickTimer = setTimeout(
    () => {
      tickTimer = null;
      if (gen !== generation) return;
      if (get().busy) return scheduleTick();
      void Promise.resolve(client.tick?.()).then((done) => {
        if (!done && gen === generation) scheduleTick();
      });
    },
    Math.max(0, deadline - Date.now()) + 50,
  );
}

function scheduleBot(): void {
  scheduleTick();
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
  const { client, view } = get();
  if (!client?.botToAct || !view || view.phase === 'game_over' || !client.botToAct()) return;
  const gen = generation;
  // Human-like pause (spec 9.4); quicker during auctions so bidding keeps moving.
  const delay =
    view.pending?.kind === 'auction' ? 300 + Math.random() * 500 : 600 + Math.random() * 1000;
  botTimer = setTimeout(() => {
    botTimer = null;
    if (gen !== generation || get().busy) return;
    try {
      client.stepBot?.();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  }, delay * timeScale());
}
