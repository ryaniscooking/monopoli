import { formatMoney, type ResolvedMap } from '@monopoli/engine';
import { animate, AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { timeScale } from '../store/settings';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-ink font-semibold',
  secondary: 'bg-white/15 text-white',
  ghost: 'bg-transparent text-current underline-offset-2',
  danger: 'bg-red-700 text-white font-semibold',
  light: 'bg-white text-ink border border-black/10',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-10 rounded-lg px-3 text-sm transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

/** Centered panel over a dimmed backdrop. */
export function Modal({
  open,
  onClose,
  children,
  className = '',
  testId,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="safe fixed inset-0 z-40 flex items-center justify-center bg-black/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            data-testid={testId}
            className={`scroll-y max-h-full w-[min(560px,92vw)] rounded-xl bg-tile p-4 text-ink shadow-xl ${className}`}
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Money that counts up or down when it changes (spec 14). */
export function Money({
  map,
  amount,
  compact,
  className = '',
}: {
  map: Pick<ResolvedMap, 'currency'>;
  amount: number;
  compact?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(amount);
  const prev = useRef(amount);
  useEffect(() => {
    const from = prev.current;
    prev.current = amount;
    const controls = animate(from, amount, {
      duration: 0.6 * timeScale(),
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [amount]);
  return <span className={`tabular ${className}`}>{formatMoney(map, shown, { compact })}</span>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">
      {children}
    </div>
  );
}
