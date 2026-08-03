create table public.restaurant_modules (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  package_code text not null default 'basic'
    check (package_code in ('basic', 'pos', 'pos_warehouse', 'full')),
  pos_enabled boolean not null default false,
  warehouse_enabled boolean not null default false,
  recipes_enabled boolean not null default false,
  finance_enabled boolean not null default false,
  promotions_enabled boolean not null default false,
  loyalty_enabled boolean not null default false,
  max_cashiers integer not null default 1 check (max_cashiers >= 0),
  max_devices integer not null default 1 check (max_devices >= 0),
  max_locations integer not null default 1 check (max_locations >= 0),
  max_warehouses integer not null default 0 check (max_warehouses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists restaurant_modules_updated_at on public.restaurant_modules;
create trigger restaurant_modules_updated_at
before update on public.restaurant_modules
for each row execute function public.set_updated_at();

alter table public.restaurant_modules enable row level security;

grant select, insert, update, delete on table public.restaurant_modules to authenticated;

create policy "platform admins and restaurant members read modules"
on public.restaurant_modules
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.catalog_members member
    where member.catalog_id = restaurant_modules.catalog_id
      and member.user_id = (select auth.uid())
  )
);

create policy "platform admins create modules"
on public.restaurant_modules
for insert
to authenticated
with check ((select public.is_platform_admin()));

create policy "platform admins update modules"
on public.restaurant_modules
for update
to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

create policy "platform admins delete modules"
on public.restaurant_modules
for delete
to authenticated
using ((select public.is_platform_admin()));
