alter table public.drivers add column if not exists debt_amount numeric(12,2) not null default 0 check (debt_amount >= 0);

create table if not exists public.platform_billing_settings (
  id text primary key default 'global',
  client_fee numeric(12,2) not null default 0 check (client_fee >= 0),
  restaurant_commission_percent numeric(5,2) not null default 7 check (restaurant_commission_percent >= 0),
  driver_tariff_percent numeric(5,2) not null default 5 check (driver_tariff_percent >= 0),
  restaurant_debt_limit numeric(12,2) not null default 5000 check (restaurant_debt_limit >= 0),
  driver_debt_limit numeric(12,2) not null default 3000 check (driver_debt_limit >= 0),
  warning_percent numeric(5,2) not null default 80 check (warning_percent >= 0 and warning_percent <= 100),
  updated_at timestamptz not null default now(),
  check (id = 'global')
);

insert into public.platform_billing_settings (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.platform_custom_tariffs (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('restaurant', 'driver')),
  subject_id uuid not null,
  tariff_percent numeric(5,2) not null default 0 check (tariff_percent >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_type, subject_id)
);

create table if not exists public.platform_debts (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('restaurant', 'driver')),
  subject_id uuid not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  limit_amount numeric(12,2) not null default 0 check (limit_amount >= 0),
  is_blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(subject_type, subject_id)
);

create table if not exists public.platform_contest_tickets (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid references public.platform_banners(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  customer_name text not null default '',
  customer_phone text not null default '',
  ordered_items jsonb not null default '[]'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(contest_id, order_id)
);

alter table public.platform_billing_settings enable row level security;
alter table public.platform_custom_tariffs enable row level security;
alter table public.platform_debts enable row level security;
alter table public.platform_contest_tickets enable row level security;

drop policy if exists "platform admins manage billing settings" on public.platform_billing_settings;
create policy "platform admins manage billing settings" on public.platform_billing_settings
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins manage custom tariffs" on public.platform_custom_tariffs;
create policy "platform admins manage custom tariffs" on public.platform_custom_tariffs
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins manage debts" on public.platform_debts;
create policy "platform admins manage debts" on public.platform_debts
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins manage contest tickets" on public.platform_contest_tickets;
create policy "platform admins manage contest tickets" on public.platform_contest_tickets
for all using (public.is_platform_admin())
with check (public.is_platform_admin());
