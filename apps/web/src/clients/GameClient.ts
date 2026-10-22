import type { Action, GameEvent, GameState, PlayerId, ResolvedMap } from '@monopoli/engine';

export type GameListener = (state: GameState, events: GameEvent[]) => void;

/** What the UI talks to. Solo: LocalGameClient. Online (Phase 4): RemoteGameClient. */
export interface GameClient {
  readonly map: ResolvedMap;
  /** The seat this device plays. */
  readonly me: PlayerId;
  /** Latest authoritative state. */
  readonly state: GameState;
  subscribe(listener: GameListener): () => void;
  /** Send an intent as `me`. Rejects if the engine refuses it. */
  dispatch(action: Action): Promise<void>;
  leave(): Promise<void>;
}

/** What the table (animation queue) needs; local-only and online-only parts are optional. */
export interface TableClient extends GameClient {
  /** Local play: a bot with a decision to make now. */
  botToAct?(): PlayerId | null;
  /** Local play: let that bot act. */
  stepBot?(): boolean;
  /** Next deadline (auction, trade expiry, time limit, turn timer), epoch ms. */
  nextDeadline?(): number | null;
  /** Apply the clock (local) or ask the server to (online). */
  tick?(): boolean | Promise<boolean>;
  /** Stop listening without leaving. */
  close?(): void;
}
