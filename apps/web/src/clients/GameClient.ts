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
