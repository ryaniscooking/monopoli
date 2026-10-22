import type { ColorGroup } from '@monopoli/engine';

/** One letter per color group, so groups can be told apart without color (spec 12.9). */
export const GROUP_LETTER: Record<ColorGroup, string> = {
  brown: 'B',
  lightblue: 'L',
  pink: 'P',
  orange: 'O',
  red: 'R',
  yellow: 'Y',
  green: 'G',
  darkblue: 'D',
};

/** Groups light enough to need dark text on top. */
export const LIGHT_GROUPS: readonly ColorGroup[] = ['yellow', 'lightblue'];
