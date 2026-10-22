// Pure game engine. Rules are implemented here and nowhere else (see docs/BUILD_SPEC.md).
export const ENGINE_VERSION = '0.1.0';

export * from './types';
export { ActionSchema } from './actions';
export { decide } from './bots';
export { createGame, STATE_SCHEMA_VERSION } from './create';
export { cardText, formatMoney } from './format';
export { checkInvariants, MoneyLedger } from './invariants';
export { getActingPlayer, getLegalActions } from './legal';
export { BOARD_SIZE, CLASSIC_PROPERTIES, JAIL_INDEX } from './map/classic';
export { MapError, parseMap, resolveMap } from './map/load';
export { COLOR_GROUPS, MapConfigSchema } from './map/schema';
export { validateMapConfig } from './map/validate';
export { netWorth } from './net-worth';
export { applyAction, cloneState, type ApplyContext } from './reducer';
export {
  chance,
  createCryptoRng,
  createSeededRng,
  randomInt,
  rngFromState,
  rollDie,
  shuffle,
  type Rng,
  type SeededRng,
} from './rng';
export { canMortgage, canUnmortgage, unmortgageCost } from './rules/mortgage';
export { hasMonopoly, rentFor } from './rules/rent';
export { makeSettings, OFFICIAL_SETTINGS } from './settings';
