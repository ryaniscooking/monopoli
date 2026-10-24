// Starting, resuming and leaving solo games.
import { makeSettings, type BotLevel, type GameState, type SeatInit } from '@monopoli/engine';
import { LocalGameClient } from '../clients/LocalGameClient';
import { useUi, type SoloSetup } from '../store/ui';
import { applyTheme, getMap } from './maps';
import { saveStore, type LocalSave } from './saves';
import { forgetRoom } from '../online/lobby';
import { leaveReactions } from '../online/reactions';
import { startTable, stopTable, useTable } from './table';

/** Dev / e2e hook (spec 15.5): reach UI scenarios without playing up to them. */
function exposeTestHook(client: LocalGameClient): void {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('test')) return;
  (window as unknown as { __monopoli?: unknown }).__monopoli = {
    client,
    patch(fn: (s: GameState) => void) {
      const next = structuredClone(client.state);
      fn(next);
      client.debugSetState(next);
    },
  };
}

function persist(save: LocalSave): void {
  const job = save.state.phase === 'game_over' ? saveStore.remove(save.mapId) : saveStore.put(save);
  job.catch(() => {
    /* storage unavailable: keep playing without saves */
  });
}

function randomSeed(): number {
  // Playwright tests pin the dice with ?seed=N.
  const fromUrl = new URLSearchParams(location.search).get('seed');
  if (fromUrl && /^\d+$/.test(fromUrl)) return Number(fromUrl);
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function buildSeats(setup: SoloSetup): SeatInit[] {
  const map = getMap(setup.mapId);
  const token = map.tokens.some((t) => t.id === setup.token) ? setup.token! : map.tokens[0]!.id;
  const colors = map.theme.playerColors;
  const color = setup.color && colors.includes(setup.color) ? setup.color : colors[0]!;
  const otherTokens = shuffled(map.tokens.filter((t) => t.id !== token));
  const otherColors = colors.filter((c) => c !== color);
  const names = shuffled(map.botNames);
  const bots = Math.min(5, Math.max(1, setup.bots));

  const seats: SeatInit[] = [
    { name: setup.nickname.trim() || 'Player', token, color, kind: 'human' },
  ];
  for (let i = 0; i < bots; i++) {
    seats.push({
      name: names[i] ?? `Bot ${i + 1}`,
      token: otherTokens[i]?.id ?? token,
      color: otherColors[i] ?? color,
      kind: 'bot',
      botLevel: (setup.botLevels?.[i] ?? 'normal') as BotLevel,
    });
  }
  return seats;
}

export function newSoloGame(setup: SoloSetup): void {
  const map = getMap(setup.mapId);
  const client = LocalGameClient.create(
    {
      map,
      settings: makeSettings(setup.preset ?? 'official', setup.house ?? {}),
      seats: buildSeats(setup),
      seed: randomSeed(),
      now: Date.now(),
    },
    persist,
  );
  exposeTestHook(client);
  applyTheme(map);
  startTable(client);
  useUi.getState().selectTile(null);
  useUi.getState().go('game');
}

export function resumeGame(save: LocalSave): void {
  const map = getMap(save.mapId);
  const client = LocalGameClient.fromSave(map, save, persist);
  exposeTestHook(client);
  applyTheme(map);
  startTable(client);
  useUi.getState().selectTile(null);
  useUi.getState().go('game');
}

/** Leave the table; the save stays for Resume (online: the seat can be rejoined). */
export function exitGame(): void {
  // A finished online game has nothing to rejoin.
  if (useTable.getState().online && useTable.getState().view?.phase === 'game_over') forgetRoom();
  stopTable();
  leaveReactions();
  useUi.getState().go('home');
}

/** Online: give the seat to a bot for good (spec 10.5). */
export async function leaveOnlineGame(): Promise<void> {
  const client = useTable.getState().client;
  await client?.leave().catch(() => undefined);
  stopTable();
  leaveReactions();
  forgetRoom();
  useUi.getState().go('home');
}

export async function quitGame(mapId: string): Promise<void> {
  stopTable();
  await saveStore.remove(mapId).catch(() => undefined);
  useUi.getState().go('home');
}
