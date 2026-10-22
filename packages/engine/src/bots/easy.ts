// Easy bot (spec 9.3): buys ~70% of the time, no reserve, mortgages only when in debt,
// always pays to leave Jail, and skips 15% of purchases on purpose.
import { getLegalActions } from '../legal';
import { chance, type Rng } from '../rng';
import type { Action, PlayerId, PublicView } from '../types';

export function decideEasy(view: PublicView, me: PlayerId, rng: Rng): Action {
  const { map, state } = view;
  const legal = getLegalActions(map, state, me);
  const find = (type: Action['type']) => legal.find((a) => a.type === type);
  const pending = state.pending;

  if (pending?.kind === 'debt' && pending.debtor === me) {
    const pay = find('pay_debt');
    if (pay) return pay;
    // Cheapest first.
    const mortgages = legal
      .filter((a): a is Extract<Action, { type: 'mortgage' }> => a.type === 'mortgage')
      .sort((a, b) => priceOf(view, a.tile) - priceOf(view, b.tile));
    if (mortgages[0]) return mortgages[0];
    return { type: 'declare_bankruptcy' };
  }

  if (pending?.kind === 'buy' && pending.player === me) {
    const buy = find('buy');
    if (buy && chance(rng, 0.7) && !chance(rng, 0.15)) return buy;
    return { type: 'decline_buy' };
  }

  if (state.current === me && !pending) {
    const leave = find('use_jail_card') ?? find('pay_jail_fine');
    if (leave) return leave;
    const next = find('roll') ?? find('end_turn');
    if (next) return next;
  }

  throw new Error(`Easy bot ${me} was asked to act but has no decision to make`);
}

function priceOf(view: PublicView, tile: string): number {
  const t = view.map.byId[tile];
  return t && 'price' in t ? t.price : 0;
}
