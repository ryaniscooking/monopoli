// Payments, debt (R-080, R-084) and bankruptcy (R-081, R-082).
import type { Continuation, DebtEntry, Party, PlayerId } from '../types';
import { alivePlayers, getPlayer, type Ctx } from './ctx';
import { landOn } from './landing';
import { moveForward } from './movement';
import { advanceTurn, checkGameOver } from './turn';

/** Move money; every cash change in the engine goes through here (one money_transfer event). */
export function transfer(c: Ctx, from: Party, to: Party, amount: number, reason: string): void {
  if (amount <= 0) return;
  adjust(c, from, -amount);
  adjust(c, to, amount);
  c.ev.push({ type: 'money_transfer', from, to, amount, reason });
}

function adjust(c: Ctx, party: Party, delta: number): void {
  if (party === 'bank') return;
  if (party === 'pot') c.s.parkingPot += delta;
  else getPlayer(c.s, party).cash += delta;
}

/** Where fines and taxes go: the bank, or the Free Parking pot when that house rule is on. */
export function finesTo(c: Ctx): Party {
  return c.s.settings.freeParkingPot ? 'pot' : 'bank';
}

function isGone(c: Ctx, party: Party): boolean {
  return party !== 'bank' && party !== 'pot' && getPlayer(c.s, party).bankrupt;
}

/**
 * Pay a list of debts in order. Anything a debtor can afford is paid at once; the first one they
 * cannot afford opens a `debt` pending decision holding the rest of the queue and the continuation.
 */
export function settle(c: Ctx, entries: DebtEntry[], then: Continuation | null = null): void {
  const queue = [...entries];
  while (queue.length > 0) {
    const e = queue.shift() as DebtEntry;
    if (isGone(c, e.debtor) || isGone(c, e.creditor)) continue;
    if (getPlayer(c.s, e.debtor).cash >= e.amount) {
      transfer(c, e.debtor, e.creditor, e.amount, e.reason);
      continue;
    }
    c.s.pending = { kind: 'debt', ...e, queue, then };
    c.ev.push({ type: 'debt_started', ...e });
    return;
  }
  if (then) runContinuation(c, then);
}

export function charge(c: Ctx, debtor: PlayerId, creditor: Party, amount: number, reason: string) {
  settle(c, [{ debtor, creditor, amount, reason }]);
}

function runContinuation(c: Ctx, k: Continuation): void {
  const p = getPlayer(c.s, k.player);
  if (p.bankrupt) return;
  // R-073: fine paid after the third failed jail roll; now leave Jail and move by that roll.
  p.inJail = false;
  p.jailTurns = 0;
  c.ev.push({ type: 'released', player: p.id, how: 'forced_fine' });
  moveForward(c, p.id, k.steps);
  landOn(c, p.id);
}

/** R-080: the debtor has raised enough cash and pays. */
export function payDebt(c: Ctx): void {
  const d = c.s.pending;
  if (d?.kind !== 'debt') throw new Error('No open debt');
  c.s.pending = null;
  transfer(c, d.debtor, d.creditor, d.amount, d.reason);
  c.ev.push({ type: 'debt_cleared', debtor: d.debtor });
  settle(c, d.queue, d.then);
}

/** R-081 / R-082 / R-083: the debtor goes bankrupt to the creditor of the open debt. */
export function declareBankruptcy(c: Ctx): void {
  const d = c.s.pending;
  if (d?.kind !== 'debt') throw new Error('No open debt');
  c.s.pending = null;
  const p = getPlayer(c.s, d.debtor);
  const owned = c.map.buyable.filter((id) => c.s.properties[id]?.owner === p.id);
  const followUps: DebtEntry[] = [];

  if (d.creditor === 'bank' || d.creditor === 'pot') {
    // R-082: cash to the bank, properties back to the bank unmortgaged, jail cards to deck bottom.
    transfer(c, p.id, 'bank', p.cash, 'bankruptcy');
    for (const id of owned) {
      c.s.properties[id] = { owner: null, mortgaged: false, buildings: 0 };
      c.ev.push({ type: 'property_returned', tile: id });
    }
    for (const cardId of p.jailCardIds) returnJailCard(c, cardId);
  } else {
    // R-081: everything goes to the creditor; R-064: they pay 10% interest on mortgaged tiles.
    const creditor = getPlayer(c.s, d.creditor);
    transfer(c, p.id, creditor.id, p.cash, 'bankruptcy');
    for (const id of owned) {
      const prop = c.s.properties[id];
      if (!prop) continue;
      prop.owner = creditor.id;
      const tile = c.map.byId[id];
      if (prop.mortgaged && tile && 'mortgage' in tile) {
        followUps.push({
          debtor: creditor.id,
          creditor: 'bank',
          amount: mortgageInterest(tile.mortgage),
          reason: `mortgage_interest:${id}`,
        });
      }
    }
    creditor.jailCardIds.push(...p.jailCardIds);
    creditor.jailCards = creditor.jailCardIds.length;
  }

  p.jailCardIds = [];
  p.jailCards = 0;
  p.bankrupt = true;
  p.inJail = false;
  p.jailTurns = 0;
  c.ev.push({ type: 'bankrupt', player: p.id, creditor: d.creditor });

  if (checkGameOver(c)) return;
  const wasCurrent = c.s.current === p.id;
  const then = d.then?.player === p.id ? null : d.then;
  settle(c, [...d.queue, ...followUps], then);
  if (wasCurrent && alivePlayers(c.s).length > 1) advanceTurn(c);
}

/** 10% of the mortgage value, rounded half up (R-062, R-064). */
export function mortgageInterest(mortgage: number): number {
  return Math.round(mortgage / 10);
}

export function returnJailCard(c: Ctx, cardId: string): void {
  const card = c.map.cards[cardId];
  if (!card) throw new Error(`Unknown card ${cardId}`);
  const order = card.deck === 'chance' ? c.sec.chanceOrder : c.sec.chestOrder;
  order.push(cardId);
  c.s.deckCounts[card.deck] = order.length;
}
