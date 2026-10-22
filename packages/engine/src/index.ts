// Pure game engine. Rules are implemented here and nowhere else (see docs/BUILD_SPEC.md).
export const ENGINE_VERSION = '0.2.0';

export * from './types';
export { ActionSchema } from './actions';
export { botsToAct, decide } from './bots';
export { acquisitionValue, assessTrade, portfolioValue } from './bots/valuation';
export { createGame, STATE_SCHEMA_VERSION } from './create';
export { cardText, formatMoney } from './format';
export { checkInvariants, MoneyLedger } from './invariants';
export {
  checkAction,
  getActingPlayer,
  getLegalActions,
  getPendingActors,
  minimumBid,
} from './legal';
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
export { bankStock, canBuildOn, canSellOn, isShortage, nextBuilding } from './rules/build';
export { MAX_PROPOSALS_PER_TURN, TRADE_TTL_MS, tradeProblem, tradingOpen } from './rules/trade';
export { somethingDue } from './rules/timers';
export { hasMonopoly, rentFor } from './rules/rent';
export { makeSettings, OFFICIAL_SETTINGS } from './settings';
