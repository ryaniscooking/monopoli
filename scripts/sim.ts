// pnpm sim - bot-vs-bot simulation harness (spec 15.4).
//   pnpm sim --games 1000 --map myanmar --bots easy,easy --seed 1 --max-turns 3000
//   pnpm sim:smoke   (100 games per map, used by CI)
// Every step: the bot's action must be legal, and all invariants + the money ledger must hold.
import { parseArgs } from 'node:util';
import {
  applyAction,
  botsToAct,
  checkInvariants,
  createGame,
  createSeededRng,
  decide,
  MoneyLedger,
  OFFICIAL_SETTINGS,
  resolveMap,
  somethingDue,
  type Action,
  type BotLevel,
  type PlayerId,
  type ResolvedMap,
  type SeatInit,
} from '@monopoli/engine';
import { MAP_IDS, RAW_MAPS } from '@monopoli/maps';

const { values } = parseArgs({
  options: {
    games: { type: 'string' },
    map: { type: 'string', default: 'all' },
    bots: { type: 'string', default: 'easy,easy' },
    seed: { type: 'string', default: '1' },
    'max-turns': { type: 'string', default: '3000' },
    smoke: { type: 'boolean', default: false },
    targets: { type: 'boolean', default: false },
  },
});

const games = Number(values.games ?? (values.smoke ? 100 : 1000));
const maxTurns = Number(values['max-turns']);
const baseSeed = Number(values.seed);
const levels = (values.bots ?? '').split(',') as BotLevel[];
const mapIds = values.map === 'all' ? MAP_IDS : [values.map as string];

if (
  levels.length < 2 ||
  levels.length > 6 ||
  levels.some((l) => !['easy', 'normal', 'hard'].includes(l))
) {
  console.error('--bots must list 2-6 levels from easy,normal,hard');
  process.exit(2);
}

interface Violation {
  map: string;
  seed: number;
  step: number;
  errors: string[];
}

function runGame(map: ResolvedMap, seed: number, levels: BotLevel[]) {
  const rng = createSeededRng(seed);
  const seats: SeatInit[] = levels.map((botLevel, i) => ({
    name: map.botNames[i] ?? `Bot ${i + 1}`,
    token: map.tokens[i]?.id ?? 'token',
    color: map.theme.playerColors[i] ?? '#000000',
    kind: 'bot',
    botLevel,
  }));
  let now = 0;
  let { state, secrets } = createGame(map, OFFICIAL_SETTINGS, seats, rng, now);
  const ledger = new MoneyLedger(state);
  let turns = 1;
  const maxSteps = maxTurns * 300;

  for (let step = 0; step < maxSteps; step++) {
    if (state.phase === 'game_over') return { turns, winner: state.winner, violation: null };
    if (turns >= maxTurns) return { turns, winner: null, violation: null };
    now += 500; // simulated clock for auction and trade timers
    const actor = botsToAct(map, state)[0];
    let errors: string[];
    try {
      let action: Action = { type: 'system_timeout' };
      let who: PlayerId | 'system' = 'system';
      if (actor) {
        const level = state.players.find((p) => p.id === actor)?.botLevel ?? 'easy';
        action = decide({ map, state }, actor, level, rng);
        who = actor;
      } else if (!somethingDue(state, now)) {
        return { turns, winner: null, violation: ['no bot has anything to do'], step };
      }
      const res = applyAction({ map, rng, now }, state, secrets, who, action);
      if (!res.ok) {
        errors = [`illegal ${who} action ${JSON.stringify(action)}: ${res.error.message}`];
      } else {
        state = res.state;
        secrets = res.secrets;
        ledger.apply(res.events);
        turns += res.events.filter((e) => e.type === 'turn_started').length;
        errors = [...checkInvariants(map, state, secrets), ...ledger.check(state)];
      }
    } catch (e) {
      errors = [`exception: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`];
    }
    if (errors.length > 0) return { turns, winner: null, violation: errors, step };
  }
  return { turns, winner: null, violation: [`no progress after ${maxSteps} steps`] };
}

const violations: Violation[] = [];
const started = performance.now();

// Spec 15.4 sanity targets: 1v1 win rates with seats alternated, draws (turn cap) count as losses.
if (values.targets) {
  const n = Number(values.games ?? 400);
  const matchups: [BotLevel, BotLevel, number][] = [
    ['hard', 'easy', 0.7],
    ['normal', 'easy', 0.6],
    ['hard', 'normal', 0.55],
  ];
  let failed = 0;
  for (const id of mapIds) {
    const map = resolveMap(RAW_MAPS[id]);
    for (const [a, b, target] of matchups) {
      let wins = 0;
      for (let g = 0; g < n; g++) {
        const order: BotLevel[] = g % 2 ? [a, b] : [b, a];
        const r = runGame(map, baseSeed + g, order);
        if (r.violation)
          violations.push({ map: id, seed: baseSeed + g, step: r.step ?? -1, errors: r.violation });
        const winnerLevel = r.winner ? order[Number(r.winner.slice(1))] : null;
        if (winnerLevel === a) wins++;
      }
      const rate = wins / n;
      const ok = rate >= target;
      if (!ok) failed++;
      console.log(
        `${ok ? '✓' : '✗'} ${id}: ${a} beats ${b} ${(rate * 100).toFixed(1)}% (target ≥ ${Math.round(target * 100)}%)`,
      );
    }
  }
  if (violations.length > 0) {
    console.error(`✗ ${violations.length} game(s) broke a rule check`, violations.slice(0, 3));
    process.exit(1);
  }
  process.exit(failed > 0 ? 1 : 0);
}

for (const id of mapIds) {
  const raw = RAW_MAPS[id];
  if (!raw) {
    console.error(`Unknown map "${id}". Known: ${MAP_IDS.join(', ')}`);
    process.exit(2);
  }
  const map = resolveMap(raw);
  const wins = new Map<string, number>();
  let finished = 0;
  let finishedTurns = 0;
  let capped = 0;

  for (let g = 0; g < games; g++) {
    const seed = baseSeed + g;
    const r = runGame(map, seed, levels);
    if (r.violation) {
      violations.push({ map: id, seed, step: r.step ?? -1, errors: r.violation });
      continue;
    }
    if (r.winner) {
      finished++;
      finishedTurns += r.turns;
      const key = `${r.winner} (${levels[Number(r.winner.slice(1))]})`;
      wins.set(key, (wins.get(key) ?? 0) + 1);
    } else {
      capped++;
    }
  }

  const pct = (n: number) => `${((100 * n) / games).toFixed(1)}%`;
  console.log(`\n${map.name} (${id}) - ${games} games, bots ${levels.join(' vs ')}`);
  console.log(`  finished:        ${finished} (${pct(finished)})`);
  console.log(`  hit ${maxTurns}-turn cap: ${capped} (${pct(capped)})`);
  if (finished > 0) console.log(`  avg turns (finished): ${Math.round(finishedTurns / finished)}`);
  for (const [who, n] of [...wins.entries()].sort()) console.log(`  wins ${who}: ${n} (${pct(n)})`);
}

const secs = ((performance.now() - started) / 1000).toFixed(1);
if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} game(s) broke a rule check (${secs}s). First ones:`);
  for (const v of violations.slice(0, 5)) {
    console.error(`  map=${v.map} seed=${v.seed} step=${v.step}\n    ${v.errors.join('\n    ')}`);
  }
  process.exit(1);
}
console.log(`\n✓ No invariant violations (${secs}s)`);
