// Integration tests against the local Supabase stack (spec 15.6) incl. every Section 11 cheat test.
import { getLegalActions, minimumBid, resolveMap } from '@monopoli/engine';
import { RAW_MAPS } from '@monopoli/maps';
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, official, Player, playerIdOf, startedRoom } from './helpers';

/** New anonymous players (each host may only have 3 open rooms, spec 11.12). */
const fresh = async (n: 1 | 2 | 3) =>
  (await Promise.all(Array.from({ length: n }, () => Player.signIn()))) as [Player, Player, Player];

const dubai = resolveMap(RAW_MAPS.dubai);

let alice: Player;
let bob: Player;
let carol: Player;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([Player.signIn(), Player.signIn(), Player.signIn()]);
});

describe('lobby (spec 10.1, 10.2, 10.5)', () => {
  it('create, join by code (case-insensitive), add a bot, ready up, start', async () => {
    const created = await alice.call<{ roomId: string; code: string }>('create-room', {
      mapId: 'dubai',
      nickname: '  Alice\u0007 ',
      rules: official,
    });
    expect(created.status).toBe(200);
    const { roomId, code } = created.body;
    expect(code).toMatch(/^[A-HJ-KMNP-Z2-9]{6}$/);

    const joined = await bob.call('join-room', { code: code.toLowerCase(), nickname: 'Bob' });
    expect(joined.status).toBe(200);
    await alice.call('update-room', { roomId, patch: { addBot: { level: 'hard' } } });

    const { data: seats } = await bob.client
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('seat');
    expect(seats?.map((s) => s.nickname)).toEqual(['Alice', 'Bob', expect.any(String)]);
    expect(seats?.[2]).toMatchObject({ is_bot: true, bot_level: 'hard' });

    expect((await alice.call('start-game', { roomId })).body.code).toBe('NOT_READY');
    await bob.call('set-ready', { roomId, ready: true });
    const started = await alice.call<{ version: number }>('start-game', { roomId });
    expect(started.status).toBe(200);
    const game = await bob.game(roomId);
    expect(game.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob', seats?.[2]?.nickname]);
    expect(game.state.players[2]?.controlledBy).toBe('bot');
    expect(JSON.stringify(game.state)).not.toContain('chance01'); // deck order is not public

    expect((await carol.call('join-room', { code, nickname: 'Late' })).body.code).toBe(
      'ALREADY_STARTED',
    );
  });

  it('rooms are invisible to non-members', async () => {
    const [h, g] = await fresh(2);
    const { roomId } = await startedRoom(h, [g]);
    const seen = await carol.client.from('rooms').select('*').eq('id', roomId);
    expect(seen.data).toEqual([]);
    const games = await carol.client.from('games').select('*').eq('room_id', roomId);
    expect(games.data).toEqual([]);
  });

  it('the host leaving the lobby hands the room to the next player; kicking works', async () => {
    [alice, bob, carol] = await fresh(3);
    const created = await alice.call<{ roomId: string; code: string }>('create-room', {
      mapId: 'myanmar',
      nickname: 'Alice',
      rules: official,
    });
    const { roomId, code } = created.body;
    await bob.call('join-room', { code, nickname: 'Bob' });
    await carol.call('join-room', { code, nickname: 'Carol' });
    expect((await alice.call('update-room', { roomId, patch: { removeSeat: 2 } })).status).toBe(
      200,
    );
    expect((await carol.call('game-tick', { roomId })).body.code).toBe('NOT_MEMBER');
    await alice.call('leave-room', { roomId });
    const { data } = await admin.from('rooms').select('host_id').eq('id', roomId).single();
    expect(data?.host_id).toBe(bob.userId);
  });

  it('nicknames, tokens and colors are validated', async () => {
    [alice, bob] = await fresh(2);
    const bad = await alice.call('create-room', {
      mapId: 'dubai',
      nickname: '   ',
      rules: official,
    });
    expect(bad.status).toBe(400);
    const created = await alice.call<{ roomId: string; code: string }>('create-room', {
      mapId: 'dubai',
      nickname: 'A',
      rules: official,
    });
    const { roomId, code } = created.body;
    await bob.call('join-room', { code, nickname: 'B' });
    const { data } = await admin
      .from('room_players')
      .select('token')
      .eq('room_id', roomId)
      .eq('seat', 0)
      .single();
    const taken = await bob.call('update-room', { roomId, patch: { me: { token: data?.token } } });
    expect(taken.body.message).toBe('Token taken');
    expect(
      (await bob.call('update-room', { roomId, patch: { me: { color: '#123456' } } })).status,
    ).toBe(400);
  });
});

describe('playing (spec 10.6)', () => {
  it('the current human rolls; the version moves on and bots play their turns server-side', async () => {
    [alice, bob] = await fresh(2);
    const { roomId } = await startedRoom(alice, [bob], { bots: ['easy'] });
    for (let i = 0; i < 40; i++) {
      const game = await alice.game(roomId);
      const current = game.state.current;
      const who = (await playerIdOf(roomId, alice.userId)) === current ? alice : bob;
      const legal = getLegalActions(dubai, game.state, current);
      // Prefer simple progress actions.
      const pick =
        legal.find((a) => a.type === 'roll') ??
        legal.find((a) => a.type === 'end_turn') ??
        legal.find((a) => a.type === 'buy') ??
        legal.find((a) => a.type === 'pay_debt') ??
        legal.find((a) => a.type === 'auction_withdraw');
      if (!pick || game.state.pending?.kind === 'auction' || game.state.phase === 'game_over')
        break;
      const res = await who.act(roomId, pick, game.version);
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 150)); // human pace (rate limit is 10 actions/s)
      expect(res.body.version).toBeGreaterThan(game.version);
    }
    const { data: events } = await bob.client
      .from('game_events')
      .select('event')
      .eq('room_id', roomId);
    expect((events ?? []).some((e) => (e.event as { type: string }).type === 'dice_rolled')).toBe(
      true,
    );
  });

  it('realtime delivers the new game state to the other player', async () => {
    [alice, bob] = await fresh(2);
    const { roomId } = await startedRoom(alice, [bob]);
    const seen: number[] = [];
    let wake: () => void = () => undefined;
    // Wait until the subscription is live, then give the change feed a moment to warm up
    // (a freshly started stack, e.g. in CI, needs a few seconds).
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('realtime did not subscribe')), 20_000);
      bob.client
        .channel(`test-${roomId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` },
          (p) => {
            seen.push((p.new as { version: number }).version);
            wake();
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve();
          }
        });
    });
    await new Promise((r) => setTimeout(r, 3000));
    const game = await alice.game(roomId);
    const me = await playerIdOf(roomId, alice.userId);
    const mover = game.state.current === me ? alice : bob;
    const res = await mover.act(roomId, { type: 'roll' }, game.version);
    expect(res.status).toBe(200);
    const target = res.body.version;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no update for v${target}; saw ${seen.join(',')}`)),
        10_000,
      );
      wake = () => {
        if (seen.includes(target)) {
          clearTimeout(timer);
          resolve();
        }
      };
      wake();
    });
    await bob.client.removeAllChannels();
  });
});

describe('disconnects (spec 10.7)', () => {
  it('a silent seat is taken over by a bot, and reclaimed when its player returns', async () => {
    [alice, bob] = await fresh(2);
    const { roomId } = await startedRoom(alice, [bob], {
      rules: { preset: 'house', house: { disconnectGraceSec: 15 } },
    });
    const game = await alice.game(roomId);
    const bobId = await playerIdOf(roomId, bob.userId);
    const alicePlayer = await playerIdOf(roomId, alice.userId);
    // Make sure it is Bob's decision, then age his heartbeat.
    if (game.state.current === alicePlayer) {
      await alice.act(roomId, { type: 'roll' });
      const g2 = await alice.game(roomId);
      const legal = getLegalActions(dubai, g2.state, alicePlayer);
      const done =
        legal.find((a) => a.type === 'end_turn') ?? legal.find((a) => a.type === 'decline_buy');
      if (done) await alice.act(roomId, done);
    }
    await admin
      .from('room_players')
      .update({ last_seen: new Date(Date.now() - 60_000).toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', bob.userId);
    const tick = await alice.call<{ changed: boolean }>('game-tick', { roomId });
    expect(tick.status).toBe(200);
    const after = await alice.game(roomId);
    const bobState = after.state.players.find((p) => p.id === bobId);
    if (
      after.state.phase !== 'game_over' &&
      (await alice.game(roomId)).state.current !== alicePlayer
    ) {
      expect(bobState?.controlledBy).toBe('bot');
    }
    // Bob comes back.
    await bob.call('game-tick', { roomId });
    const back = await bob.game(roomId);
    expect(back.state.players.find((p) => p.id === bobId)?.controlledBy).toBe('human');
  });
});

describe('cheat protection (spec 11)', () => {
  let roomId: string;
  let me: Player;
  let other: Player;

  beforeAll(async () => {
    [alice, bob] = await fresh(2);
    ({ roomId } = await startedRoom(alice, [bob]));
    const game = await alice.game(roomId);
    me = (await playerIdOf(roomId, alice.userId)) === game.state.current ? alice : bob;
    other = me === alice ? bob : alice;
  });

  it('(a) acting out of turn is rejected', async () => {
    const res = await other.act(roomId, { type: 'roll' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ILLEGAL_ACTION');
  });

  it('(b) a request cannot name another seat (identity comes from the JWT only)', async () => {
    const game = await other.game(roomId);
    const res = await other.call('game-action', {
      roomId,
      clientActionId: crypto.randomUUID(),
      expectedVersion: game.version,
      action: { type: 'roll' },
      actor: game.state.current,
    });
    expect(res.status).toBe(400);
    const forged = await other.call('game-action', {
      roomId,
      clientActionId: crypto.randomUUID(),
      expectedVersion: game.version,
      action: { type: 'roll', player: game.state.current },
    });
    expect(forged.status).toBe(400);
  });

  it('(c) replaying an action id is rejected', async () => {
    const game = await me.game(roomId);
    const id = crypto.randomUUID();
    const body = {
      roomId,
      clientActionId: id,
      expectedVersion: game.version,
      action: { type: 'roll' },
    };
    const first = await me.call('game-action', body);
    expect(first.status).toBe(200);
    // Same id, even with an up-to-date version and a move that would be legal again: rejected.
    const current = (first.body as { version: number }).version;
    const replay = await me.call('game-action', {
      ...body,
      expectedVersion: current,
      action: { type: 'end_turn' },
    });
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('DUPLICATE');
    expect((await me.game(roomId)).version).toBe(current);
  });

  it('(d) a stale version is rejected and returns the latest state', async () => {
    const res = await me.call<{ version: number }>('game-action', {
      roomId,
      clientActionId: crypto.randomUUID(),
      expectedVersion: 1,
      action: { type: 'end_turn' },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE');
    expect(res.body.version).toBeGreaterThan(1);
  });

  it('(e) game_secrets cannot be read', async () => {
    const res = await me.client.from('game_secrets').select('*').eq('room_id', roomId);
    expect(res.data ?? []).toEqual([]);
    const all = await me.client.from('game_secrets').select('*');
    expect(all.data ?? []).toEqual([]);
  });

  it('(f) clients cannot write games (or any table) directly', async () => {
    const update = await me.client
      .from('games')
      .update({ version: 999 })
      .eq('room_id', roomId)
      .select();
    expect(update.error ?? update.data?.length === 0).toBeTruthy();
    const ins = await me.client
      .from('game_events')
      .insert({ room_id: roomId, version: 999, seq: 0, event: {} });
    expect(ins.error).not.toBeNull();
    const seat = await me.client
      .from('room_players')
      .update({ ready: true })
      .eq('room_id', roomId)
      .select();
    expect(seat.error ?? seat.data?.length === 0).toBeTruthy();
    const rpc = await me.client.rpc('commit_game', {});
    expect(rpc.error).not.toBeNull();
    const { data } = await admin.from('games').select('version').eq('room_id', roomId).single();
    expect(data?.version).toBeLessThan(999);
  });

  it('(g) bids above your cash are rejected', async () => {
    // Play until someone faces an auction, then bid more than our cash.
    [alice, bob] = await fresh(2);
    const { roomId: r } = await startedRoom(alice, [bob]);
    for (let i = 0; i < 60; i++) {
      const g = await alice.game(r);
      const s = g.state;
      if (s.pending?.kind === 'auction') {
        const bidder = s.pending.active[0];
        if (!bidder) break;
        const who = (await playerIdOf(r, alice.userId)) === bidder ? alice : bob;
        const cash = s.players.find((p) => p.id === bidder)?.cash ?? 0;
        const res = await who.act(r, { type: 'auction_bid', amount: cash + dubai.m }, g.version);
        expect(res.status).toBe(422);
        expect(minimumBid(dubai, s)).toBeLessThanOrEqual(cash);
        return;
      }
      const actor =
        s.pending?.kind === 'buy'
          ? s.pending.player
          : s.pending?.kind === 'debt'
            ? s.pending.debtor
            : s.current;
      const who = (await playerIdOf(r, alice.userId)) === actor ? alice : bob;
      const legal = getLegalActions(dubai, s, actor);
      const pick =
        legal.find((a) => a.type === 'decline_buy') ??
        legal.find((a) => a.type === 'roll') ??
        legal.find((a) => a.type === 'end_turn') ??
        legal.find((a) => a.type === 'pay_debt') ??
        legal.find((a) => a.type === 'declare_bankruptcy');
      if (!pick) break;
      await who.act(r, pick, g.version);
    }
    throw new Error('no auction happened in 60 actions');
  });

  it('(h) only the host may change settings, add bots or start', async () => {
    [alice, bob] = await fresh(2);
    const created = await alice.call<{ roomId: string; code: string }>('create-room', {
      mapId: 'dubai',
      nickname: 'A',
      rules: official,
    });
    const { roomId: r, code } = created.body;
    await bob.call('join-room', { code, nickname: 'B' });
    const house = { preset: 'house', house: { freeParkingPot: true } };
    expect((await bob.call('update-room', { roomId: r, patch: { rules: house } })).body.code).toBe(
      'NOT_HOST',
    );
    expect(
      (await bob.call('update-room', { roomId: r, patch: { addBot: { level: 'easy' } } })).body
        .code,
    ).toBe('NOT_HOST');
    expect((await bob.call('start-game', { roomId: r })).body.code).toBe('NOT_HOST');
    expect((await alice.call('update-room', { roomId: r, patch: { rules: house } })).status).toBe(
      200,
    );
  });

  it('unauthenticated calls never reach the game', async () => {
    const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/game-action`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('system timeouts cannot be sent by clients', async () => {
    const res = await me.act(roomId, { type: 'system_timeout' } as never);
    expect(res.status).toBe(400);
  });
});

describe('abuse limits (spec 11.12)', () => {
  it('a player can host at most 3 open rooms', async () => {
    const [h] = await fresh(1);
    for (let i = 0; i < 3; i++) {
      expect(
        (await h.call('create-room', { mapId: 'dubai', nickname: 'H', rules: official })).status,
      ).toBe(200);
    }
    const fourth = await h.call('create-room', { mapId: 'dubai', nickname: 'H', rules: official });
    expect(fourth.body.code).toBe('TOO_MANY_ROOMS');
  });
});
