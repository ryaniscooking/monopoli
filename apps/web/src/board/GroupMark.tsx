import type { ColorGroup } from '@monopoli/engine';
import { useSettings } from '../store/settings';
import { GROUP_LETTER, LIGHT_GROUPS } from './groups';

/** The group letter, shown when the color-blind markers setting is on. */
export function GroupMark({
  group,
  className = '',
  style,
}: {
  group: ColorGroup;
  className?: string;
  style?: React.CSSProperties;
}) {
  const on = useSettings((s) => s.groupMarkers);
  if (!on) return null;
  return (
    <span
      data-testid="group-mark"
      aria-hidden
      className={`font-black ${LIGHT_GROUPS.includes(group) ? 'text-black/70' : 'text-white/90'} ${className}`}
      style={style}
    >
      {GROUP_LETTER[group]}
    </span>
  );
}

/** A small color swatch for a group (with its letter when markers are on). */
export function GroupSwatch({ group }: { group: ColorGroup | null }) {
  const on = useSettings((s) => s.groupMarkers) && group !== null;
  return (
    <span
      className={`inline-flex h-3.5 shrink-0 items-center justify-center rounded-sm ${on ? 'w-3' : 'w-1.5'}`}
      style={{ background: group ? `var(--g-${group})` : 'var(--m-primary)' }}
    >
      {group && <GroupMark group={group} className="text-[8px] leading-none" />}
    </span>
  );
}
