import {
  formatMoney,
  OFFICIAL_SETTINGS,
  type BotLevel,
  type ResolvedMap,
  type RuleSettings,
} from '@monopoli/engine';
import { Button, Modal } from '../components/ui';
import { en } from '../strings/en';

const r = en.rules;

type Toggle =
  | 'doubleGoBonus'
  | 'freeParkingPot'
  | 'auctionOnDecline'
  | 'evenBuild'
  | 'unlimitedBuildings'
  | 'doubleRentOnSet'
  | 'noRentInJail'
  | 'offTurnManagement';
const TOGGLES: Toggle[] = [
  'auctionOnDecline',
  'evenBuild',
  'doubleRentOnSet',
  'offTurnManagement',
  'freeParkingPot',
  'doubleGoBonus',
  'noRentInJail',
  'unlimitedBuildings',
];

type Choice =
  | 'startingCash'
  | 'goSalary'
  | 'jailFine'
  | 'timeLimitMin'
  | 'auctionTimerSec'
  | 'turnTimerSec'
  | 'disconnectGraceSec';
/** Money options are classic units; the label shows them in the map's currency (x multiplier). */
type Label = (n: number, map: ResolvedMap) => string;
const money: Label = (n, map) => formatMoney(map, n * map.m, { compact: true });

const CHOICES: { key: Choice; options: number[]; label: Label; online?: true }[] = [
  { key: 'startingCash', options: [1000, 1500, 2000, 2500], label: money },
  { key: 'goSalary', options: [100, 200, 300, 400], label: money },
  { key: 'jailFine', options: [50, 100], label: money },
  {
    key: 'timeLimitMin',
    options: [0, 30, 60, 90, 120],
    label: (n) => (n === 0 ? r.off : r.minutes(n)),
  },
  { key: 'auctionTimerSec', options: [10, 15, 20, 30], label: (n) => r.seconds(n) },
  {
    key: 'turnTimerSec',
    options: [0, 30, 60, 90],
    label: (n) => (n === 0 ? r.off : r.seconds(n)),
    online: true,
  },
  { key: 'disconnectGraceSec', options: [30, 60, 120], label: (n) => r.seconds(n), online: true },
];

/**
 * House-rule toggles (spec 7.12). Money values are classic units (scaled by the map).
 * Online rooms also offer the turn timer, reconnect grace period and takeover bot level.
 */
export function HouseRulesSheet({
  open,
  onClose,
  map,
  house,
  onChange,
  onOfficial,
  online = false,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Map whose currency the money options are shown in. */
  map: ResolvedMap;
  house: Partial<RuleSettings>;
  onChange: (house: Partial<RuleSettings>) => void;
  onOfficial: () => void;
  online?: boolean;
  readOnly?: boolean;
}) {
  const value = <K extends keyof RuleSettings>(k: K): RuleSettings[K] =>
    (house[k] ?? OFFICIAL_SETTINGS[k]) as RuleSettings[K];
  const set = (patch: Partial<RuleSettings>) => {
    if (!readOnly) onChange({ ...house, ...patch });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="h-[90vh] w-[min(680px,94vw)] pt-0"
      testId="house-rules"
    >
      <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between bg-tile px-4 pt-4 pb-2">
        <div className="text-lg font-bold">{r.house}</div>
        <div className="flex gap-1.5">
          {!readOnly && (
            <Button
              variant="light"
              onClick={() => {
                onOfficial();
                onClose();
              }}
            >
              {r.official}
            </Button>
          )}
          <Button onClick={onClose}>{en.game.close}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {CHOICES.filter((c) => online || !c.online).map(({ key, options, label }) => (
          <div key={key} className="col-span-2 flex items-center gap-1.5 text-sm">
            <span className="w-32 shrink-0 opacity-80">{r[key]}</span>
            {options.map((o) => (
              <Button
                key={o}
                variant={value(key) === o ? 'primary' : 'light'}
                className="min-h-8 flex-1 px-1 text-[12px]"
                disabled={readOnly && value(key) !== o}
                onClick={() => set({ [key]: o } as Partial<RuleSettings>)}
              >
                {label(o, map)}
              </Button>
            ))}
          </div>
        ))}
        {online && (
          <div className="col-span-2 flex items-center gap-1.5 text-sm">
            <span className="w-32 shrink-0 opacity-80">{r.takeoverBotLevel}</span>
            {(['easy', 'normal', 'hard'] as BotLevel[]).map((lvl) => (
              <Button
                key={lvl}
                variant={value('takeoverBotLevel') === lvl ? 'primary' : 'light'}
                className="min-h-8 flex-1 px-1 text-[12px]"
                disabled={readOnly && value('takeoverBotLevel') !== lvl}
                onClick={() => set({ takeoverBotLevel: lvl })}
              >
                {en.level[lvl]}
              </Button>
            ))}
          </div>
        )}
        {TOGGLES.map((key) => (
          <label
            key={key}
            className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[13px]"
          >
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={value(key)}
              disabled={readOnly}
              onChange={(e) => set({ [key]: e.target.checked } as Partial<RuleSettings>)}
            />
            {r[key]}
          </label>
        ))}
      </div>
    </Modal>
  );
}
