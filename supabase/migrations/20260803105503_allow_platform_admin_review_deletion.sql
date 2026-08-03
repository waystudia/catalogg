revoke delete on table public.client_reviews from anon;
grant delete on table public.client_reviews to authenticated;

drop policy if exists "client reviews platform admins delete" on public.client_reviews;
create policy "client reviews platform admins delete"
on public.client_reviews
for delete
to authenticated
using ((select public.is_platform_admin()));
