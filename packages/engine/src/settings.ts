import type { RuleSettings } from './types';

/** Official preset (spec 7.12). Money values are classic units. */
export const OFFICIAL_SETTINGS: Readonly<RuleSettings> = {
  preset: 'official',
  startingCash: 1500,
  goSalary: 200,
  doubleGoBonus: false,
  freeParkingPot: false,
  auctionOnDecline: true,
  evenBuild: true,
  unlimitedBuildings: false,
  doubleRentOnSet: true,
  noRentInJail: false,
  offTurnManagement: true,
  jailFine: 50,
  turnTimerSec: 0,
  timeLimitMin: 0,
  auctionTimerSec: 15,
  disconnectGraceSec: 60,
  takeoverBotLevel: 'normal',
};

/** Official mode locks every toggle; House mode applies the overrides. */
export function makeSettings(
  preset: RuleSettings['preset'],
  overrides: Partial<RuleSettings> = {},
): RuleSettings {
  if (preset === 'official') return { ...OFFICIAL_SETTINGS };
  return { ...OFFICIAL_SETTINGS, ...overrides, preset: 'house' };
}
