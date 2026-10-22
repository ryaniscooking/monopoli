import {
  cardText,
  formatMoney,
  type GameEvent,
  type GameState,
  type Party,
  type ResolvedMap,
} from '@monopoli/engine';

export function partyName(state: GameState, party: Party): string {
  if (party === 'bank') return 'the bank';
  if (party === 'pot') return 'the pot';
  return state.players.find((p) => p.id === party)?.name ?? party;
}

export function tileName(map: ResolvedMap, id: string): string {
  return map.byId[id]?.name ?? id;
}

/** One log line per meaningful event (spec 12.6); null for purely visual events. */
export function describeEvent(map: ResolvedMap, state: GameState, e: GameEvent): string | null {
  const name = (p: Party) => partyName(state, p);
  const money = (n: number) => formatMoney(map, n);
  switch (e.type) {
    case 'turn_order':
      return `${name(e.first)} goes first`;
    case 'turn_started':
      return `— ${name(e.player)}’s turn —`;
    case 'dice_rolled':
      return `${name(e.player)} rolled ${e.dice[0]} + ${e.dice[1]}${e.doubles ? ' (doubles)' : ''}`;
    case 'passed_go':
      return `${name(e.player)} collected ${money(e.amount)} at GO`;
    case 'bought':
      return `${name(e.player)} bought ${tileName(map, e.tile)} for ${money(e.price)}`;
    case 'buy_declined':
      return `${name(e.player)} didn’t buy ${tileName(map, e.tile)}`;
    case 'rent_paid':
      return `${name(e.from)} paid ${name(e.to)} ${money(e.amount)} rent`;
    case 'tax_paid':
      return `${name(e.player)} paid ${tileName(map, e.tile)}: ${money(e.amount)}`;
    case 'card_drawn': {
      const card = map.cards[e.card];
      const text = card ? cardText(map, card, state.settings) : e.card;
      return `${name(e.player)} drew ${map.decks[e.deck].name}: “${text}”`;
    }
    case 'jailed':
      return `${name(e.player)} went to Jail`;
    case 'released':
      return {
        doubles: `${name(e.player)} rolled doubles and left Jail`,
        fine: `${name(e.player)} paid the fine and left Jail`,
        card: `${name(e.player)} used a Get Out of Jail Free card`,
        forced_fine: `${name(e.player)} paid the fine after three tries`,
      }[e.how];
    case 'mortgaged':
      return `${name(e.player)} mortgaged ${tileName(map, e.tile)} (+${money(e.amount)})`;
    case 'unmortgaged':
      return `${name(e.player)} unmortgaged ${tileName(map, e.tile)} (−${money(e.amount)})`;
    case 'debt_started':
      return `${name(e.debtor)} owes ${name(e.creditor)} ${money(e.amount)} and must raise cash`;
    case 'bankrupt':
      return `${name(e.player)} is bankrupt`;
    case 'game_over':
      return `${name(e.winner)} wins the game!`;
    default:
      return null;
  }
}
