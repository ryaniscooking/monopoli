import { OFFICIAL_SETTINGS, type RuleSettings } from '@monopoli/engine';
import { Button, Modal } from '../components/ui';
import { useSetup } from '../store/ui';
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

type Choice = 'startingCash' | 'goSalary' | 'jailFine' | 'timeLimitMin' | 'auctionTimerSec';
const CHOICES: { key: Choice; options: number[]; label: (n: number) => string }[] = [
  { key: 'startingCash', options: [1000, 1500, 2000, 2500], label: (n) => String(n) },
  { key: 'goSalary', options: [100, 200, 300, 400], label: (n) => String(n) },
  { key: 'jailFine', options: [50, 100], label: (n) => String(n) },
  {
    key: 'timeLimitMin',
    options: [0, 30, 60, 90, 120],
    label: (n) => (n === 0 ? r.off : r.minutes(n)),
  },
  { key: 'auctionTimerSec', options: [10, 15, 20, 30], label: (n) => r.seconds(n) },
];

/**
 * House-rule toggles (spec 7.12). Money values are classic units (scaled by the map).
 * The turn timer is online-only, so it is not offered for solo games.
 */
export function HouseRulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const house = useSetup((s) => s.house);
  const update = useSetup((s) => s.update);
  const value = <K extends keyof RuleSettings>(k: K): RuleSettings[K] =>
    (house[k] ?? OFFICIAL_SETTINGS[k]) as RuleSettings[K];
  const set = (patch: Partial<RuleSettings>) =>
    update({ house: { ...house, ...patch }, preset: 'house' });

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
          <Button
            variant="light"
            onClick={() => {
              update({ house: {}, preset: 'official' });
              onClose();
            }}
          >
            {r.official}
          </Button>
          <Button onClick={onClose}>{en.game.close}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {CHOICES.map(({ key, options, label }) => (
          <div key={key} className="col-span-2 flex items-center gap-1.5 text-sm">
            <span className="w-32 shrink-0 opacity-80">{r[key]}</span>
            {options.map((o) => (
              <Button
                key={o}
                variant={value(key) === o ? 'primary' : 'light'}
                className="min-h-8 flex-1 px-1 text-[12px]"
                onClick={() => set({ [key]: o } as Partial<RuleSettings>)}
              >
                {label(o)}
              </Button>
            ))}
          </div>
        ))}
        {TOGGLES.map((key) => (
          <label
            key={key}
            className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[13px]"
          >
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={value(key)}
              onChange={(e) => set({ [key]: e.target.checked } as Partial<RuleSettings>)}
            />
            {r[key]}
          </label>
        ))}
      </div>
    </Modal>
  );
}
