// Movement, GO salary (R-010, R-013) and going to Jail (R-025, R-070).
import { BOARD_SIZE, JAIL_INDEX } from '../map/classic';
import type { PlayerId } from '../types';
import { getPlayer, money, type Ctx } from './ctx';
import { pickDice } from './luck';
import { transfer } from './money';

export function rollDice(c: Ctx, player: PlayerId, purpose: 'move' | 'jail' | 'utility') {
  const dice = pickDice(c, player, purpose);
  const doubles = dice[0] === dice[1];
  c.ev.push({ type: 'dice_rolled', player, dice, doubles, purpose });
  return { dice, total: dice[0] + dice[1], doubles };
}

/** Walk clockwise; passing or landing on GO pays the salary when collectGo is true. */
export function moveForward(c: Ctx, player: PlayerId, steps: number, collectGo = true): void {
  const p = getPlayer(c.s, player);
  const path: number[] = [];
  let passedGo = false;
  for (let i = 0; i < steps; i++) {
    p.position = (p.position + 1) % BOARD_SIZE;
    path.push(p.position);
    if (p.position === 0) passedGo = true;
  }
  c.ev.push({ type: 'moved', player, path, mode: 'walk' });
  if (passedGo && collectGo) {
    const salary = money(c, c.s.settings.goSalary);
    const bonus = p.position === 0 && c.s.settings.doubleGoBonus ? salary : 0;
    c.ev.push({ type: 'passed_go', player, amount: salary + bonus });
    transfer(c, 'bank', player, salary + bonus, 'go_salary');
  }
}

/** Advance clockwise to a tile index (a full lap if already there). */
export function moveTo(c: Ctx, player: PlayerId, target: number, collectGo: boolean): void {
  const p = getPlayer(c.s, player);
  const steps = (target - p.position + BOARD_SIZE) % BOARD_SIZE || BOARD_SIZE;
  moveForward(c, player, steps, collectGo);
}

export function moveBack(c: Ctx, player: PlayerId, steps: number): void {
  const p = getPlayer(c.s, player);
  const path: number[] = [];
  for (let i = 0; i < steps; i++) {
    p.position = (p.position - 1 + BOARD_SIZE) % BOARD_SIZE;
    path.push(p.position);
  }
  c.ev.push({ type: 'moved', player, path, mode: 'back' });
}

/** Straight to Jail: no GO salary, doubles streak reset, turn ends (R-014). */
export function sendToJail(c: Ctx, player: PlayerId, reason: 'tile' | 'card' | 'doubles'): void {
  const p = getPlayer(c.s, player);
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  c.s.doublesCount = 0;
  c.ev.push({ type: 'moved', player, path: [JAIL_INDEX], mode: 'jump' });
  c.ev.push({ type: 'jailed', player, reason });
  c.jailed = player;
}
