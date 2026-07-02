-- Restaurant payment settings.
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.catalogs(id) on delete cascade,
  enable_transfer boolean not null default false,
  requisite_type text not null default 'phone' check (requisite_type in ('phone', 'card', 'account')),
  phone_number text not null default '',
  bank_name text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  middle_name text not null default '',
  display_name text not null default '',
  comment text not null default 'Оплата заказа переводом ресторану',
  allow_cash boolean not null default true,
  require_confirmation boolean not null default true,
  qr_image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

create index if not exists restaurant_payments_restaurant_id_idx on public.restaurant_payments(restaurant_id);

drop trigger if exists restaurant_payments_updated_at on public.restaurant_payments;
create trigger restaurant_payments_updated_at before update on public.restaurant_payments
for each row execute function public.set_updated_at();

alter table public.restaurant_payments enable row level security;

drop policy if exists "restaurant owners read payment settings" on public.restaurant_payments;
create policy "restaurant owners read payment settings" on public.restaurant_payments
for select using (
  public.is_platform_admin()
  or public.is_catalog_member(restaurant_id, array['owner','admin','editor','viewer']::public.catalog_role[])
);

drop policy if exists "restaurant owners manage payment settings" on public.restaurant_payments;
create policy "restaurant owners manage payment settings" on public.restaurant_payments
for all using (
  public.is_platform_admin()
  or public.is_catalog_member(restaurant_id, array['owner','admin']::public.catalog_role[])
)
with check (
  public.is_platform_admin()
  or public.is_catalog_member(restaurant_id, array['owner','admin']::public.catalog_role[])
);
