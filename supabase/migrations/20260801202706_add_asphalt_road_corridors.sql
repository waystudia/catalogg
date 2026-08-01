create table if not exists public.asphalt_road_corridors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  points jsonb not null check (
    jsonb_typeof(points) = 'array'
    and jsonb_array_length(points) between 2 and 100
  ),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asphalt_road_corridors is
  'Manually confirmed asphalt road corridors used as preferred delivery routing waypoints.';

alter table public.asphalt_road_corridors enable row level security;

grant select on table public.asphalt_road_corridors to anon, authenticated;
grant insert, update, delete on table public.asphalt_road_corridors to authenticated;

drop policy if exists "asphalt corridors are publicly readable" on public.asphalt_road_corridors;
create policy "asphalt corridors are publicly readable"
on public.asphalt_road_corridors
for select
to anon, authenticated
using (true);

drop policy if exists "platform admins create asphalt corridors" on public.asphalt_road_corridors;
create policy "platform admins create asphalt corridors"
on public.asphalt_road_corridors
for insert
to authenticated
with check ((select public.is_platform_admin()));

drop policy if exists "platform admins update asphalt corridors" on public.asphalt_road_corridors;
create policy "platform admins update asphalt corridors"
on public.asphalt_road_corridors
for update
to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

drop policy if exists "platform admins delete asphalt corridors" on public.asphalt_road_corridors;
create policy "platform admins delete asphalt corridors"
on public.asphalt_road_corridors
for delete
to authenticated
using ((select public.is_platform_admin()));
