// Solo play: the engine runs in the browser, bots are decided locally. No network calls at all.
import {
  applyAction,
  botsToAct,
  createGame,
  createSeededRng,
  decide,
  rngFromState,
  somethingDue,
  type Action,
  type GameSecrets,
  type GameState,
  type PlayerId,
  type ResolvedMap,
  type RuleSettings,
  type SeatInit,
  type SeededRng,
} from '@monopoli/engine';
import type { GameClient, GameListener } from './GameClient';
import { SAVE_VERSION, type LocalSave } from '../game/saves';

export interface NewLocalGame {
  map: ResolvedMap;
  settings: RuleSettings;
  seats: SeatInit[];
  seed: number;
  now: number;
}

export class LocalGameClient implements GameClient {
  private listeners = new Set<GameListener>();

  private constructor(
    readonly map: ResolvedMap,
    readonly me: PlayerId,
    private current: GameState,
    private secrets: GameSecrets,
    private rng: SeededRng,
    private readonly onSave: (save: LocalSave) => void,
  ) {}

  /** Seat 0 is the human; the rest are bots. */
  static create(game: NewLocalGame, onSave: (save: LocalSave) => void): LocalGameClient {
    const rng = createSeededRng(game.seed);
    const { state, secrets } = createGame(game.map, game.settings, game.seats, rng, game.now);
    const client = new LocalGameClient(game.map, 'p0', state, secrets, rng, onSave);
    client.save();
    return client;
  }

  static fromSave(map: ResolvedMap, save: LocalSave, onSave: (save: LocalSave) => void) {
    return new LocalGameClient(
      map,
      save.me,
      save.state,
      save.secrets,
      rngFromState(save.rngState),
      onSave,
    );
  }

  get state(): GameState {
    return this.current;
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispatch(action: Action): Promise<void> {
    this.apply(this.me, action);
  }

  async leave(): Promise<void> {
    this.listeners.clear();
  }

  /** A bot with a decision to make now (turn, auction bid, trade reply), if any. */
  botToAct(): PlayerId | null {
    return botsToAct(this.map, this.current)[0] ?? null;
  }

  /** Earliest pending deadline (auction, trade expiry, time limit, turn timer), epoch ms. */
  nextDeadline(): number | null {
    const s = this.current;
    if (s.phase === 'game_over') return null;
    const times = [
      s.pending?.kind === 'auction' ? s.pending.deadline : null,
      ...s.trades.map((t) => t.expiresAt),
      s.endsAt !== null && !s.lastRoundPending ? s.endsAt : null,
      s.turnDeadline,
    ].filter((t): t is number => t !== null);
    return times.length > 0 ? Math.min(...times) : null;
  }

  /** Apply the clock (auction end, trade expiry, time limit) if something is due. */
  tick(now = Date.now()): boolean {
    if (!somethingDue(this.current, now)) return false;
    this.apply('system', { type: 'system_timeout' }, now);
    return true;
  }

  /** Let the bot that must act make one decision. Returns false when no bot is due. */
  stepBot(): boolean {
    const bot = this.botToAct();
    if (!bot) return false;
    const p = this.current.players.find((x) => x.id === bot);
    const action = decide(
      { map: this.map, state: this.current },
      bot,
      p?.botLevel ?? 'easy',
      this.rng,
    );
    this.apply(bot, action);
    return true;
  }

  /** Test hook only (dev / ?test): replace the state to reach a scenario quickly. */
  debugSetState(state: GameState): void {
    this.current = state;
    this.save();
    for (const l of this.listeners) l(state, []);
  }

  toSave(): LocalSave {
    return {
      version: SAVE_VERSION,
      mapId: this.map.id,
      me: this.me,
      state: this.current,
      secrets: this.secrets,
      rngState: this.rng.getState(),
      savedAt: Date.now(),
    };
  }

  private apply(actor: PlayerId | 'system', action: Action, now = Date.now()): void {
    const res = applyAction(
      { map: this.map, rng: this.rng, now },
      this.current,
      this.secrets,
      actor,
      action,
    );
    if (!res.ok) throw new Error(res.error.message);
    this.current = res.state;
    this.secrets = res.secrets;
    this.save();
    for (const l of this.listeners) l(res.state, res.events);
  }

  private save(): void {
    this.onSave(this.toSave());
  }
}
