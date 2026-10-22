import {
  checkInvariants,
  decide,
  createSeededRng,
  getPendingActors,
  makeSettings,
  type GameEvent,
} from '@monopoli/engine';
import { describe, expect, it } from 'vitest';
import { getMap } from '../game/maps';
import { createMemorySaveStore, migrateSave, SAVE_VERSION, type LocalSave } from '../game/saves';
import { buildSeats } from '../game/session';
import { LocalGameClient } from './LocalGameClient';

const map = getMap('dubai');

function newGame(saves: LocalSave[] = [], seed = 42) {
  return LocalGameClient.create(
    {
      map,
      settings: makeSettings('official'),
      seats: buildSeats({
        mapId: 'dubai',
        nickname: 'Me',
        bots: 2,
        botLevels: ['hard', 'normal'],
        token: null,
        color: null,
        preset: 'official',
        house: {},
      }),
      seed,
      now: 0,
    },
    (s) => saves.push(structuredClone(s)),
  );
}

/** Play n actions: bots via stepBot, the human via the Easy bot logic through dispatch(). */
async function play(client: LocalGameClient, n: number) {
  const humanRng = createSeededRng(9);
  for (let i = 0; i < n && client.state.phase !== 'game_over'; i++) {
    if (client.stepBot()) continue;
    if (!getPendingActors(client.state).includes(client.me)) throw new Error('nobody to act');
    await client.dispatch(decide({ map, state: client.state }, client.me, 'easy', humanRng));
  }
}

describe('LocalGameClient', () => {
  it('seat 0 is the human; bots are the other seats', () => {
    const c = newGame();
    expect(c.me).toBe('p0');
    expect(c.state.players.map((p) => p.controlledBy)).toEqual(['human', 'bot', 'bot']);
    expect(c.state.players.map((p) => p.botLevel)).toEqual([undefined, 'hard', 'normal']);
  });

  it('notifies subscribers with state and events, and autosaves after every action', async () => {
    const saves: LocalSave[] = [];
    const c = newGame(saves);
    const seen: GameEvent[][] = [];
    c.subscribe((_, events) => seen.push(events));
    await play(c, 30);
    expect(seen.length).toBe(30);
    expect(saves.length).toBe(31); // initial save + one per action
    expect(saves.at(-1)?.state).toEqual(c.state);
    expect(checkInvariants(map, c.state, saves.at(-1)!.secrets)).toEqual([]);
  });

  it('rejects illegal intents from the human', async () => {
    const c = newGame();
    const notMyTurn = c.state.current !== 'p0';
    if (notMyTurn) await expect(c.dispatch({ type: 'roll' })).rejects.toThrow();
    await expect(c.dispatch({ type: 'pay_debt' })).rejects.toThrow();
  });

  it('a resumed save continues exactly like the original game (rng state is saved)', async () => {
    const saves: LocalSave[] = [];
    const original = newGame(saves);
    await play(original, 25);
    const snapshot = saves.at(-1)!;
    const resumed = LocalGameClient.fromSave(map, structuredClone(snapshot), () => undefined);
    await play(original, 40);
    await play(resumed, 40);
    expect(resumed.state).toEqual(original.state);
  });
});

describe('saves', () => {
  it('memory store keeps one slot per map, newest first, and drops finished games', async () => {
    const store = createMemorySaveStore();
    const a = newGame().toSave();
    await store.put({ ...a, savedAt: 1 });
    await store.put({ ...a, savedAt: 2 });
    expect(await store.list()).toHaveLength(1);
    await store.put({ ...a, state: { ...a.state, phase: 'game_over' } });
    expect(await store.list()).toHaveLength(0);
  });

  it('migrateSave rejects unknown versions and malformed data', () => {
    const save = newGame().toSave();
    expect(migrateSave(save)).not.toBeNull();
    expect(migrateSave({ ...save, version: SAVE_VERSION + 1 })).toBeNull();
    expect(migrateSave({ ...save, state: { ...save.state, schemaVersion: 999 } })).toBeNull();
    expect(migrateSave('nonsense')).toBeNull();
  });
});

describe('save upgrade', () => {
  it('a Phase 2 (state schema v1) save is upgraded, not discarded', () => {
    const save = newGame().toSave();
    const {
      trades: _t,
      tradeSeq: _s,
      proposalsThisTurn: _p,
      auctionQueue: _q,
      endReason: _e,
      ...rest
    } = save.state;
    const v1 = {
      ...save,
      state: {
        ...rest,
        schemaVersion: 1,
        players: rest.players.map(({ timeouts: _x, ...p }) => p),
      },
    };
    const upgraded = migrateSave(v1);
    expect(upgraded?.state.schemaVersion).toBe(2);
    expect(upgraded?.state.trades).toEqual([]);
    expect(upgraded?.state.players[0]?.timeouts).toBe(0);
  });
});
