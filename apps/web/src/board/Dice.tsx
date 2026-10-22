import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

// prettier-ignore
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

function Die({ value, size, rolling }: { value: number; size: number; rolling: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      animate={
        rolling ? { rotate: [0, 90, 180, 270, 360], y: [0, -6, 0, -4, 0] } : { rotate: 0, y: 0 }
      }
      transition={rolling ? { duration: 0.6, ease: 'easeInOut' } : { duration: 0.15 }}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="18"
        fill="white"
        stroke="rgba(0,0,0,.35)"
        strokeWidth="3"
      />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill="var(--m-text)" />
      ))}
    </motion.svg>
  );
}

/** Two flat dice; faces flicker while rolling (spec 14: ~700 ms tumble). */
export function Dice({
  dice,
  rolling,
  size,
}: {
  dice: [number, number] | null;
  rolling: boolean;
  size: number;
}) {
  const [flicker, setFlicker] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(
      () => setFlicker([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]),
      80,
    );
    return () => clearInterval(t);
  }, [rolling]);
  const shown = rolling ? flicker : (dice ?? [1, 1]);
  return (
    <div data-testid="dice" className={`flex gap-2 ${dice || rolling ? '' : 'opacity-40'}`}>
      <Die value={shown[0]} size={size} rolling={rolling} />
      <Die value={shown[1]} size={size} rolling={rolling} />
    </div>
  );
}
