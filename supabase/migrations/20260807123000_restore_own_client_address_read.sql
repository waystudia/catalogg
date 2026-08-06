-- client_addresses already had RLS enabled but no policy, so an authenticated
-- client could not restore even their own server-side saved address.
drop policy if exists "client addresses read own" on public.client_addresses;
create policy "client addresses read own" on public.client_addresses
for select
using (
  user_id = public.current_platform_user_id()
  and is_test = public.current_actor_is_test()
);
