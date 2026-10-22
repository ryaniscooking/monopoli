import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SettingsState {
  speed: 'normal' | 'fast';
  reducedMotion: boolean;
  installHintDismissed: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const prefersReducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Safe localStorage: private mode or blocked storage must not break the app. */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
}));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      speed: 'normal',
      reducedMotion: prefersReducedMotion,
      installHintDismissed: false,
      set: (patch) => set(patch),
    }),
    { name: 'monopoli:settings', storage: safeStorage },
  ),
);

/** Multiplier for every animation and bot delay (spec 9.4, 14). */
export function timeScale(): number {
  const s = useSettings.getState();
  if (s.reducedMotion) return 0.15;
  return s.speed === 'fast' ? 0.5 : 1;
}

export { safeStorage };
