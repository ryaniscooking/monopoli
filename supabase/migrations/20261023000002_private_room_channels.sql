-- Realtime "private only" projects reject public channels, so every live update now uses a private
-- channel for the room: "room:<CODE>" (reactions), "room:<CODE>:lobby", "room:<CODE>:game:<id>".
-- Only members of that room may join (receive) them; only members may broadcast (reactions).
drop policy if exists room_members_receive on realtime.messages;
drop policy if exists room_members_send on realtime.messages;

create policy room_members_receive on realtime.messages for select to authenticated
  using (
    exists (
      select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
       where rp.user_id = (select auth.uid())
         and (
           (select realtime.topic()) = 'room:' || r.code
           or starts_with((select realtime.topic()), 'room:' || r.code || ':')
         )
    )
  );

create policy room_members_send on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
       where rp.user_id = (select auth.uid())
         and (select realtime.topic()) = 'room:' || r.code
    )
  );
