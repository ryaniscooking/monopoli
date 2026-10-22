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
import type { LocalGameClient } from '../clients/LocalGameClient';
import { timeScale } from '../store/settings';
import { describeEvent } from './describe';

export interface MoneyFloat {
  id: number;
  player: PlayerId;
  amount: number;
}

export interface TableState {
  client: LocalGameClient | null;
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
  rentCollected: Partial<Record<PlayerId, number>>;
  error: string | null;
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
  rentCollected: {},
  error: null,
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

export function startTable(client: LocalGameClient): void {
  stopTable();
  const gen = generation;
  set({ ...empty(), client, map: client.map, view: client.state, pos: positions(client.state) });
  unsubscribe = client.subscribe((state, events) => {
    if (gen !== generation) return;
    queue.push({ state, events });
    void drain(gen);
  });
  scheduleBot();
}

export function stopTable(): void {
  generation++;
  queue = [];
  draining = false;
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  set(empty());
}

/** A human intent from this device. Ignored while animations play. */
export async function act(action: Action): Promise<void> {
  const { client, busy } = get();
  if (!client || busy) return;
  try {
    await client.dispatch(action);
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
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
  switch (e.type) {
    case 'dice_rolled':
      set({ rolling: true });
      await wait(650);
      set({ rolling: false, dice: e.dice });
      await wait(300);
      return;
    case 'moved':
      if (e.mode === 'jump') {
        set((s) => ({ pos: { ...s.pos, [e.player]: e.path.at(-1) } }));
        await wait(400);
        return;
      }
      for (const step of e.path) {
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
      set((s) => ({
        rentCollected: { ...s.rentCollected, [e.to]: (s.rentCollected[e.to] ?? 0) + e.amount },
      }));
      return;
    case 'jailed':
      await wait(500);
      return;
    case 'bought':
    case 'bankrupt':
      await wait(300);
      return;
    case 'turn_started':
      set({ landed: null });
      await wait(250);
      return;
    default:
      return;
  }
}

function scheduleBot(): void {
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
  const { client, view } = get();
  if (!client || !view || view.phase === 'game_over' || !client.botToAct()) return;
  const gen = generation;
  const delay = 600 + Math.random() * 1000; // human-like pause (spec 9.4)
  botTimer = setTimeout(() => {
    botTimer = null;
    if (gen !== generation || get().busy) return;
    try {
      client.stepBot();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  }, delay * timeScale());
}
