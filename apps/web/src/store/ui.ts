import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MAP_ID } from '../game/maps';
import { safeStorage } from './settings';

export type Screen = 'home' | 'setup' | 'game' | 'settings' | 'howto';
export type Sheet = null | 'properties' | 'log' | 'menu';

interface UiState {
  screen: Screen;
  /** Where Settings returns to. */
  back: Screen;
  selectedTile: string | null;
  sheet: Sheet;
  go: (screen: Screen) => void;
  selectTile: (tile: string | null) => void;
  openSheet: (sheet: Sheet) => void;
}

/** UI-only state (spec 12.7): never holds game rules or game state. */
export const useUi = create<UiState>()((set, get) => ({
  screen: 'home',
  back: 'home',
  selectedTile: null,
  sheet: null,
  go: (screen) =>
    set({ screen, back: get().screen === 'settings' ? get().back : get().screen, sheet: null }),
  selectTile: (selectedTile) => set({ selectedTile }),
  openSheet: (sheet) => set({ sheet }),
}));

export interface SoloSetup {
  mapId: string;
  nickname: string;
  bots: number;
  token: string | null;
  color: string | null;
}

interface SetupState extends SoloSetup {
  update: (patch: Partial<SoloSetup>) => void;
}

/** Last used solo setup, remembered on this device. */
export const useSetup = create<SetupState>()(
  persist(
    (set) => ({
      mapId: DEFAULT_MAP_ID,
      nickname: '',
      bots: 3,
      token: null,
      color: null,
      update: (patch) => set(patch),
    }),
    { name: 'monopoli:setup', storage: safeStorage },
  ),
);
