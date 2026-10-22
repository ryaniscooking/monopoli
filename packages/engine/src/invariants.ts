// State invariants checked after every step by the simulator and property tests (spec 15.2).
import { BOARD_SIZE, CLASSIC_BANK, JAIL_INDEX } from './map/classic';
import type { GameEvent, GameSecrets, GameState, Party, ResolvedMap } from './types';

export function checkInvariants(map: ResolvedMap, s: GameState, sec: GameSecrets): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);
  const ids = new Set(s.players.map((p) => p.id));

  for (const p of s.players) {
    if (!Number.isInteger(p.position) || p.position < 0 || p.position >= BOARD_SIZE)
      err(`${p.id}: position ${p.position} off the board`);
    if (!Number.isInteger(p.cash) || p.cash < 0)
      err(`${p.id}: cash ${p.cash} is not a whole non-negative amount`);
    if (p.jailCards !== p.jailCardIds.length) err(`${p.id}: jailCards out of sync`);
    if (p.inJail && p.position !== JAIL_INDEX) err(`${p.id}: in Jail but not on the Jail tile`);
    if (p.jailTurns < 0 || p.jailTurns > 3) err(`${p.id}: jailTurns ${p.jailTurns}`);
    if (p.bankrupt && (p.cash !== 0 || p.jailCards !== 0 || p.inJail))
      err(`${p.id}: bankrupt player still holds cash, cards or a Jail spot`);
  }

  let housesInPlay = 0;
  let hotelsInPlay = 0;
  for (const id of map.buyable) {
    const prop = s.properties[id];
    if (!prop) {
      err(`${id}: missing property state`);
      continue;
    }
    if (prop.owner !== null) {
      if (!ids.has(prop.owner)) err(`${id}: unknown owner ${prop.owner}`);
      else if (s.players.find((p) => p.id === prop.owner)?.bankrupt)
        err(`${id}: owned by a bankrupt player`);
    }
    if (prop.owner === null && (prop.mortgaged || prop.buildings > 0))
      err(`${id}: bank-owned but mortgaged or built`);
    if (prop.mortgaged && prop.buildings > 0) err(`${id}: mortgaged with buildings`);
    const tile = map.byId[id];
    if (prop.buildings > 0) {
      if (tile?.type !== 'property') err(`${id}: buildings on a non-property tile`);
      else if (
        !map.groups[tile.group].every((g) => {
          const other = s.properties[g];
          return other?.owner === prop.owner && !other.mortgaged;
        })
      ) {
        err(`${id}: buildings without the full unmortgaged color set`);
      }
    }
    if (prop.buildings === 5) hotelsInPlay++;
    else housesInPlay += prop.buildings;
  }
  if (!s.settings.unlimitedBuildings) {
    if (housesInPlay + s.bank.houses !== CLASSIC_BANK.houses) err('house count is not conserved');
    if (hotelsInPlay + s.bank.hotels !== CLASSIC_BANK.hotels) err('hotel count is not conserved');
  }

  for (const deck of ['chance', 'chest'] as const) {
    const order = deck === 'chance' ? sec.chanceOrder : sec.chestOrder;
    if (order.length !== s.deckCounts[deck]) err(`${deck}: deckCounts does not match the deck`);
    const held = s.players
      .flatMap((p) => p.jailCardIds)
      .filter((id) => map.cards[id]?.deck === deck);
    const all = [...order, ...held].sort();
    const expected = [...map.decks[deck].cardIds].sort();
    if (all.join() !== expected.join()) err(`${deck}: cards lost or duplicated`);
  }

  if (s.parkingPot < 0) err('parking pot is negative');
  if (!s.settings.freeParkingPot && s.parkingPot !== 0)
    err('parking pot used while the rule is off');

  const pend = s.pending;
  if (pend?.kind === 'debt') {
    const d = s.players.find((p) => p.id === pend.debtor);
    if (!d || d.bankrupt) err('debt: debtor missing or bankrupt');
    if (pend.amount <= 0) err('debt: non-positive amount');
  } else if (pend?.kind === 'buy') {
    if (s.properties[pend.tile]?.owner !== null) err('buy: tile is already owned');
  } else if (pend?.kind === 'auction') {
    for (const id of pend.active) {
      if (s.players.find((p) => p.id === id)?.bankrupt !== false) err(`auction: ${id} cannot bid`);
    }
    if (pend.highBidder) {
      const hb = s.players.find((p) => p.id === pend.highBidder);
      if (!hb || hb.cash < pend.highBid) err('auction: high bidder cannot cover the bid');
      if (!pend.active.includes(pend.highBidder)) err('auction: high bidder withdrew');
    }
  }

  const outgoing = new Set<string>();
  for (const t of s.trades) {
    if (outgoing.has(t.from)) err(`${t.from}: more than one open offer`);
    outgoing.add(t.from);
    for (const id of [t.from, t.to]) {
      if (s.players.find((p) => p.id === id)?.bankrupt !== false)
        err(`trade ${t.id}: ${id} not in game`);
    }
  }
  if (new Set(s.auctionQueue).size !== s.auctionQueue.length) err('auction queue has duplicates');

  const alive = s.players.filter((p) => !p.bankrupt);
  if (s.phase === 'game_over') {
    if (!s.winner || !alive.some((p) => p.id === s.winner)) err('game over without a winner');
    if (s.endReason === 'last_standing' && alive.length !== 1)
      err('last standing but others remain');
  } else {
    if (alive.length < 2) err('game continues with fewer than two players');
    if (s.players.find((p) => p.id === s.current)?.bankrupt) err('current player is bankrupt');
    if (s.winner !== null) err('winner set before game over');
  }
  return errors;
}

/**
 * Shadow ledger built only from money_transfer events. If the engine ever changes cash without an
 * event (or mis-reports one), the ledger and the state disagree.
 */
export class MoneyLedger {
  private balances = new Map<Party, number>();

  constructor(s: GameState) {
    for (const p of s.players) this.balances.set(p.id, p.cash);
    this.balances.set('pot', s.parkingPot);
  }

  apply(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'money_transfer') continue;
      if (e.from !== 'bank') this.balances.set(e.from, (this.balances.get(e.from) ?? 0) - e.amount);
      if (e.to !== 'bank') this.balances.set(e.to, (this.balances.get(e.to) ?? 0) + e.amount);
    }
  }

  check(s: GameState): string[] {
    const errors: string[] = [];
    for (const p of s.players) {
      if (this.balances.get(p.id) !== p.cash) {
        errors.push(`${p.id}: cash ${p.cash} but ledger says ${this.balances.get(p.id)}`);
      }
    }
    if (this.balances.get('pot') !== s.parkingPot) errors.push('parking pot disagrees with ledger');
    return errors;
  }
}
