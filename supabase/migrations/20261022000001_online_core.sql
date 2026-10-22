-- Online multiplayer core (spec 10.3, 10.4, 11).
-- Clients may only READ their own room's rows. Every write goes through Edge Functions using the
-- service role; game_secrets and action_log are never readable by clients.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  map_id text not null,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_host_idx on public.rooms (host_id) where status in ('lobby', 'playing');
create index rooms_updated_idx on public.rooms (updated_at);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat int not null check (seat between 0 and 5),
  user_id uuid references auth.users (id) on delete set null, -- null for bot seats
  nickname text not null check (char_length(nickname) between 1 and 20),
  token text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_bot boolean not null default false,
  bot_level text check (bot_level in ('easy', 'normal', 'hard')),
  controlled_by text not null default 'human' check (controlled_by in ('human', 'bot')),
  ready boolean not null default false,
  connected boolean not null default true,
  last_seen timestamptz not null default now(),
  timeouts int not null default 0,
  primary key (room_id, seat)
);
create unique index room_players_user_unique on public.room_players (room_id, user_id)
  where user_id is not null;
create index room_players_user_idx on public.room_players (user_id);

create table public.games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version int not null default 0,
  state jsonb not null, -- PUBLIC state only (no deck order)
  turn_deadline timestamptz,
  updated_at timestamptz not null default now()
);

create table public.game_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  chance_order jsonb not null,
  chest_order jsonb not null
);

create table public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  version int not null,
  seq int not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, version, seq)
);

create table public.action_log (
  room_id uuid not null references public.rooms (id) on delete cascade,
  client_action_id uuid not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  primary key (room_id, client_action_id)
);

-- Per-user fixed-window rate limits (spec 11.8).
create table public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: read-only membership policies; NO insert/update/delete policies anywhere.
-- ---------------------------------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_events enable row level security;
alter table public.action_log enable row level security;
alter table public.rate_limits enable row level security;

create function public.is_room_member(r uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.room_players where room_id = r and user_id = auth.uid())
$$;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy rooms_select on public.rooms for select to authenticated
  using (public.is_room_member(id));
create policy room_players_select on public.room_players for select to authenticated
  using (public.is_room_member(room_id));
create policy games_select on public.games for select to authenticated
  using (public.is_room_member(room_id));
create policy game_events_select on public.game_events for select to authenticated
  using (public.is_room_member(room_id));
-- game_secrets, action_log, rate_limits: no policies at all (service role only).

-- Belt and braces: clients have no table privileges beyond SELECT on the readable tables.
revoke all on public.rooms, public.room_players, public.games, public.game_secrets,
  public.game_events, public.action_log, public.rate_limits from anon, authenticated;
grant select on public.rooms, public.room_players, public.games, public.game_events to authenticated;
-- The Edge Functions (service role) do all writes.
grant all on public.rooms, public.room_players, public.games, public.game_secrets,
  public.game_events, public.action_log, public.rate_limits to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------------------------
-- Atomic commit (spec 10.6 step 8): idempotency + optimistic concurrency + events, one transaction.
-- Raises 'DUPLICATE_ACTION' or 'STALE_VERSION'.
-- ---------------------------------------------------------------------------------------------
create function public.commit_game(
  p_room uuid,
  p_expected_version int,
  p_state jsonb,
  p_chance_order jsonb,
  p_chest_order jsonb,
  p_events jsonb,
  p_turn_deadline timestamptz,
  p_client_action_id uuid,
  p_user uuid,
  p_room_status text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  new_version int;
begin
  if p_client_action_id is not null then
    begin
      insert into public.action_log (room_id, client_action_id, user_id)
      values (p_room, p_client_action_id, p_user);
    exception when unique_violation then
      raise exception 'DUPLICATE_ACTION';
    end;
  end if;

  update public.games
     set version = version + 1, state = p_state, turn_deadline = p_turn_deadline, updated_at = now()
   where room_id = p_room and version = p_expected_version
  returning version into new_version;
  if new_version is null then
    raise exception 'STALE_VERSION';
  end if;

  update public.game_secrets
     set chance_order = p_chance_order, chest_order = p_chest_order
   where room_id = p_room;

  insert into public.game_events (room_id, version, seq, event)
  select p_room, new_version, (e.ordinality - 1)::int, e.value
    from jsonb_array_elements(p_events) with ordinality as e(value, ordinality);

  update public.rooms
     set updated_at = now(), status = coalesce(p_room_status, status)
   where id = p_room;
  return new_version;
end;
$$;
revoke all on function public.commit_game(uuid, int, jsonb, jsonb, jsonb, jsonb, timestamptz, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.commit_game(uuid, int, jsonb, jsonb, jsonb, jsonb, timestamptz, uuid, uuid, text)
  to service_role;

-- Fixed-window rate limit; returns true when the hit is allowed.
create function public.hit_rate_limit(p_user uuid, p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, w, 1)
  on conflict (user_id, bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  return n <= p_max;
end;
$$;
revoke all on function public.hit_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Realtime: database changes for the readable tables (RLS applies per subscriber).
-- ---------------------------------------------------------------------------------------------
alter publication supabase_realtime add table public.rooms, public.room_players, public.games,
  public.game_events;
-- DELETE events carry the old row (needed when a seat is freed in the lobby).
alter table public.room_players replica identity full;

-- Reactions use a private Broadcast channel "room:<CODE>"; only members may join or send.
create policy room_members_receive on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
       where rp.user_id = (select auth.uid())
         and 'room:' || r.code = (select realtime.topic())
    )
  );
create policy room_members_send on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
       where rp.user_id = (select auth.uid())
         and 'room:' || r.code = (select realtime.topic())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Housekeeping (spec 10.10): close rooms idle > 24 h; delete finished/closed rooms after 7 days.
-- ---------------------------------------------------------------------------------------------
create function public.cleanup_rooms() returns void
language sql security definer set search_path = public as $$
  update public.rooms set status = 'closed', updated_at = now()
   where status in ('lobby', 'playing') and updated_at < now() - interval '24 hours';
  delete from public.rooms
   where status in ('finished', 'closed') and updated_at < now() - interval '7 days';
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
revoke all on function public.cleanup_rooms() from public, anon, authenticated;
grant execute on function public.cleanup_rooms() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('monopoli-cleanup', '17 3 * * *', $$select public.cleanup_rooms()$$);
