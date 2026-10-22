// Local saves (spec 13): the full solo game after every action, one slot per map, in IndexedDB.
// iOS may evict site storage after long inactivity, so saves are best-effort.
import {
  STATE_SCHEMA_VERSION,
  type GameSecrets,
  type GameState,
  type PlayerId,
} from '@monopoli/engine';
import { createStore, del, entries, set } from 'idb-keyval';

export const SAVE_VERSION = 1;

/** Engine state schema v1 (Phase 2) -> v2 (Phase 3): new fields with empty defaults. */
function upgradeState(state: Record<string, unknown>): GameState | null {
  if (state.schemaVersion === 1) {
    const players = (state.players as Record<string, unknown>[]).map((p) => ({
      timeouts: 0,
      ...p,
    }));
    state = {
      ...state,
      players,
      schemaVersion: 2,
      endReason: state.winner ? 'last_standing' : null,
      trades: [],
      tradeSeq: 1,
      proposalsThisTurn: {},
      auctionQueue: [],
    };
  }
  return state.schemaVersion === STATE_SCHEMA_VERSION ? (state as unknown as GameState) : null;
}

export interface LocalSave {
  version: number;
  mapId: string;
  me: PlayerId;
  state: GameState;
  secrets: GameSecrets;
  rngState: [number, number, number, number];
  savedAt: number;
}

export interface SaveStore {
  put(save: LocalSave): Promise<void>;
  remove(mapId: string): Promise<void>;
  list(): Promise<LocalSave[]>;
}

/**
 * Upgrade an older save to the current format, or return null if it cannot be used.
 * Add a step here whenever SAVE_VERSION or the engine's STATE_SCHEMA_VERSION changes.
 */
export function migrateSave(raw: unknown): LocalSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const save = raw as Partial<LocalSave>;
  if (save.version !== SAVE_VERSION || !save.state) return null;
  if (!save.secrets || !Array.isArray(save.rngState) || typeof save.mapId !== 'string') return null;
  const state = upgradeState(save.state as unknown as Record<string, unknown>);
  return state ? ({ ...save, state } as LocalSave) : null;
}

const key = (mapId: string) => `save:${mapId}`;

export function createIdbSaveStore(): SaveStore {
  const store = createStore('monopoli', 'saves');
  return {
    put: (save) => set(key(save.mapId), save, store),
    remove: (mapId) => del(key(mapId), store),
    async list() {
      const all = await entries(store);
      return all
        .map(([, value]) => migrateSave(value))
        .filter((s): s is LocalSave => s !== null && s.state.phase !== 'game_over')
        .sort((a, b) => b.savedAt - a.savedAt);
    },
  };
}

export function createMemorySaveStore(): SaveStore {
  const data = new Map<string, LocalSave>();
  return {
    async put(save) {
      data.set(key(save.mapId), structuredClone(save));
    },
    async remove(mapId) {
      data.delete(key(mapId));
    },
    async list() {
      return [...data.values()]
        .map((s) => migrateSave(s))
        .filter((s): s is LocalSave => s !== null && s.state.phase !== 'game_over')
        .sort((a, b) => b.savedAt - a.savedAt);
    },
  };
}

/** IndexedDB can be missing (private mode) or throw; the game must still run. */
export const saveStore: SaveStore = (() => {
  try {
    if (typeof indexedDB === 'undefined') return createMemorySaveStore();
    return createIdbSaveStore();
  } catch {
    return createMemorySaveStore();
  }
})();
