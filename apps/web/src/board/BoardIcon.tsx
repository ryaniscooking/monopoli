import { ICON_PATHS, type IconName } from './iconPaths';

/** A one-color board icon (see iconPaths.ts). */
export function BoardIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="block shrink-0">
      <path d={ICON_PATHS[name]} fill={color} fillRule="evenodd" />
    </svg>
  );
}
