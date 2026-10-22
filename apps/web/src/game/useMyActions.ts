import { getLegalActions, type Action } from '@monopoli/engine';
import { useTable } from './table';

/**
 * Legal actions for this device's player. While animations play this is [] unless
 * `evenWhenBusy` (then callers disable their buttons instead, to avoid flicker).
 */
export function useMyActions(evenWhenBusy = false): Action[] {
  const map = useTable((s) => s.map);
  const view = useTable((s) => s.view);
  const busy = useTable((s) => s.busy);
  const me = useTable((s) => s.client?.me);
  if (!map || !view || !me || (busy && !evenWhenBusy)) return [];
  return getLegalActions(map, view, me);
}
