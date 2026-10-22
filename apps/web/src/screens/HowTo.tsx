import { Button } from '../components/ui';
import { useUi } from '../store/ui';

// Short rules summary (spec 12.1.7). The full tutorial arrives in Phase 5 from docs/RULES.md.
const RULES: [string, string][] = [
  ['Goal', 'Be the last player who is not bankrupt.'],
  [
    'Your turn',
    'Roll two dice and move. Doubles let you roll again; three doubles in a row send you to Jail.',
  ],
  ['GO', 'Collect your salary every time you pass or land on GO.'],
  ['Buying', 'Land on a property nobody owns and you may buy it at its price.'],
  [
    'Rent',
    'Land on someone else’s property and pay rent. Owning a whole color set doubles the base rent. Transports pay more the more you own; utilities charge a multiple of the dice.',
  ],
  [
    'Cards',
    'Chance and Community Chest cards move you, pay you, or charge you. Keep Get Out of Jail Free cards until you need them.',
  ],
  [
    'Jail',
    'Leave by rolling doubles, paying the fine, or using a card. After three failed tries you pay the fine and move.',
  ],
  [
    'Short of cash',
    'Mortgage properties to raise money. If you still cannot pay what you owe, you are bankrupt and out of the game.',
  ],
];

export function HowTo() {
  const go = useUi((s) => s.go);
  return (
    <div className="safe flex h-full justify-center bg-primary text-white">
      <div className="scroll-y flex w-[min(720px,92vw)] flex-col gap-2 py-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => go('home')}>
            Back
          </Button>
          <div className="text-lg font-bold">How to Play</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {RULES.map(([title, body]) => (
            <div key={title} className="rounded-xl bg-tile p-3 text-ink">
              <div className="font-bold text-primary">{title}</div>
              <div className="text-sm leading-snug">{body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
