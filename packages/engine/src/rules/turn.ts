// Turn flow (R-010 .. R-014), jail rolls (R-072, R-073) and game end (R-085).
import { netWorth } from '../net-worth';
import type { PlayerId } from '../types';
import { alivePlayers, getPlayer, money, type Ctx } from './ctx';
import { landOn } from './landing';
import { finesTo, settle } from './money';
import { moveForward, rollDice, sendToJail } from './movement';

export function doRoll(c: Ctx, player: PlayerId): void {
  const p = getPlayer(c.s, player);
  const r = rollDice(c, player, p.inJail ? 'jail' : 'move');
  c.s.lastRoll = r.dice;
  c.s.rolledThisTurn = true;

  if (p.inJail) {
    c.s.phase = 'post_roll'; // never an extra roll out of Jail (R-072)
    if (r.doubles) {
      p.inJail = false;
      p.jailTurns = 0;
      c.ev.push({ type: 'released', player, how: 'doubles' });
      moveForward(c, player, r.total);
      landOn(c, player);
      return;
    }
    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
      // R-073: third failure - pay the fine, then move by this roll.
      const fine = money(c, c.s.settings.jailFine);
      settle(c, [{ debtor: player, creditor: finesTo(c), amount: fine, reason: 'jail_fine' }], {
        kind: 'jail_move',
        player,
        steps: r.total,
      });
    }
    return;
  }

  if (r.doubles) {
    c.s.doublesCount += 1;
    if (c.s.doublesCount >= 3) {
      sendToJail(c, player, 'doubles'); // R-012: no move on the third double
      return;
    }
  }
  c.s.phase = r.doubles ? 'pre_roll' : 'post_roll'; // R-011
  moveForward(c, player, r.total);
  landOn(c, player);
}

/** Pass the turn to the next player still in the game, clockwise by seat. */
export function advanceTurn(c: Ctx): void {
  // R-101: once the time limit passes, the round is finished so everyone has equal turns.
  if (c.s.endsAt !== null && c.now >= c.s.endsAt && !c.s.lastRoundPending) {
    c.s.lastRoundPending = true;
    c.ev.push({ type: 'last_round', endsAt: c.s.endsAt });
  }
  const players = c.s.players;
  const cur = players.findIndex((p) => p.id === c.s.current);
  const firstSeat = players.findIndex((p) => p.id === c.s.firstPlayer);
  let crossed = false;
  let next = cur;
  for (let k = 1; k <= players.length; k++) {
    const idx = (cur + k) % players.length;
    if (idx === firstSeat) crossed = true;
    if (!players[idx]?.bankrupt) {
      next = idx;
      break;
    }
  }
  if (crossed && c.s.lastRoundPending) {
    endByNetWorth(c);
    return;
  }
  if (crossed) c.s.round += 1;
  const nextPlayer = players[next];
  if (!nextPlayer) throw new Error('No next player');
  c.s.current = nextPlayer.id;
  c.s.phase = 'pre_roll';
  c.s.doublesCount = 0;
  c.s.lastRoll = null;
  c.s.rolledThisTurn = false;
  c.s.proposalsThisTurn = {};
  c.ev.push({ type: 'turn_started', player: nextPlayer.id, round: c.s.round });
}

/** R-101: highest net worth wins; ties go to more cash, then more properties. */
export function endByNetWorth(c: Ctx): void {
  const owned = (id: PlayerId) =>
    c.map.buyable.filter((t) => c.s.properties[t]?.owner === id).length;
  const ranked = alivePlayers(c.s).sort(
    (a, b) =>
      netWorth(c.map, c.s, b.id) - netWorth(c.map, c.s, a.id) ||
      b.cash - a.cash ||
      owned(b.id) - owned(a.id),
  );
  const winner = ranked[0];
  if (!winner) throw new Error('No players left');
  c.s.phase = 'game_over';
  c.s.pending = null;
  c.s.auctionQueue = [];
  c.s.trades = [];
  c.s.winner = winner.id;
  c.s.endReason = 'time_limit';
  c.ev.push({ type: 'game_over', winner: winner.id, reason: 'time_limit' });
}

/** R-085: one player left standing wins. Returns true when the game is over. */
export function checkGameOver(c: Ctx): boolean {
  const alive = alivePlayers(c.s);
  if (alive.length !== 1) return false;
  const winner = alive[0] as (typeof alive)[number];
  c.s.phase = 'game_over';
  c.s.pending = null;
  c.s.auctionQueue = [];
  c.s.trades = [];
  c.s.winner = winner.id;
  c.s.endReason = 'last_standing';
  c.ev.push({ type: 'game_over', winner: winner.id, reason: 'last_standing' });
  return true;
}
