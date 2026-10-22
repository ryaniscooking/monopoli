-- Security advisor (0028): Supabase grants EXECUTE on new public functions to `anon` by default.
-- Signed-out visitors never need is_room_member; signed-in players need it for the RLS policies.
revoke execute on function public.is_room_member(uuid) from anon;

-- Same default applies to the service-only functions; make sure no client role can call them.
revoke execute on function public.commit_game(uuid, int, jsonb, jsonb, jsonb, jsonb, timestamptz, uuid, uuid, text)
  from anon, authenticated;
revoke execute on function public.hit_rate_limit(uuid, text, int, int) from anon, authenticated;
revoke execute on function public.cleanup_rooms() from anon, authenticated;
