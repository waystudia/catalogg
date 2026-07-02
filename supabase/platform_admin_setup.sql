-- Platform admin setup for Catalogg.
-- Safe to run multiple times in Supabase SQL Editor.
-- Replace the UUID in the final insert with your Supabase Auth user id when needed.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  company_name text not null,
  owner_name text,
  email text not null,
  phone text,
  primary_city text not null default '',
  service_settlements text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked', 'pending')),
  plan_code text,
  subscription_status text not null default 'trial' check (subscription_status in ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id),
  unique(catalog_id),
  unique(email)
);

alter table public.clients add column if not exists first_login boolean not null default true;
alter table public.clients add column if not exists consent_given boolean not null default false;
alter table public.clients add column if not exists consent_given_at timestamptz;
alter table public.clients add column if not exists consent_source text;
alter table public.clients add column if not exists admin_consent_confirmed boolean not null default false;
alter table public.clients add column if not exists admin_consent_confirmed_at timestamptz;
alter table public.clients add column if not exists admin_consent_actor_id uuid references auth.users(id) on delete set null;
alter table public.clients add column if not exists primary_city text not null default '';
alter table public.clients add column if not exists service_settlements text[] not null default '{}';

create or replace function public.sync_client_catalog_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.catalog_members (catalog_id, user_id, role)
  values (new.catalog_id, new.owner_user_id, 'owner'::public.catalog_role)
  on conflict (catalog_id, user_id) do update set
    role = excluded.role;

  return new;
end;
$$;

create table if not exists public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_code text not null,
  amount numeric(12,2) not null default 0,
  currency_code text not null default 'RUB',
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  paid_at timestamptz,
  auto_renew boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_created_idx on public.clients(status, created_at desc);
create index if not exists clients_catalog_id_idx on public.clients(catalog_id);
create index if not exists clients_owner_first_login_idx on public.clients(owner_user_id, first_login);
create index if not exists client_subscriptions_client_id_idx on public.client_subscriptions(client_id);
create index if not exists client_subscriptions_status_ends_idx on public.client_subscriptions(status, ends_at);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists clients_catalog_member_sync on public.clients;
create trigger clients_catalog_member_sync after insert or update of owner_user_id, catalog_id on public.clients
for each row execute function public.sync_client_catalog_member();

drop trigger if exists client_subscriptions_updated_at on public.client_subscriptions;
create trigger client_subscriptions_updated_at before update on public.client_subscriptions
for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;
alter table public.clients enable row level security;
alter table public.client_subscriptions enable row level security;

drop policy if exists "platform admins read own row" on public.platform_admins;
create policy "platform admins read own row" on public.platform_admins
for select using (user_id = auth.uid());

drop policy if exists "platform admins manage clients" on public.clients;
create policy "platform admins manage clients" on public.clients
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "clients read own record" on public.clients;
create policy "clients read own record" on public.clients
for select using (public.is_platform_admin() or owner_user_id = auth.uid());

create or replace function public.mark_client_personal_data_consent()
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_client public.clients;
begin
  update public.clients
  set consent_given = true,
      first_login = false,
      consent_source = 'user',
      consent_given_at = now()
  where owner_user_id = auth.uid()
  returning * into updated_client;

  if updated_client.id is null then
    raise exception 'Client record not found.';
  end if;

  return updated_client;
end;
$$;

grant execute on function public.mark_client_personal_data_consent() to authenticated;

drop policy if exists "platform admins manage subscriptions" on public.client_subscriptions;
create policy "platform admins manage subscriptions" on public.client_subscriptions
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "clients read own subscription" on public.client_subscriptions;
create policy "clients read own subscription" on public.client_subscriptions
for select using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.clients client
    where client.id = client_subscriptions.client_id
      and client.owner_user_id = auth.uid()
  )
);

drop policy if exists "platform admins read catalogs" on public.catalogs;
create policy "platform admins read catalogs" on public.catalogs
for select using (public.is_platform_admin());

drop policy if exists "platform admins read catalog members" on public.catalog_members;
create policy "platform admins read catalog members" on public.catalog_members
for select using (public.is_platform_admin());

drop policy if exists "platform admins read audit logs" on public.audit_logs;
create policy "platform admins read audit logs" on public.audit_logs
for select using (public.is_platform_admin());

insert into public.platform_admins (user_id)
values ('ea15b3cd-ee76-465f-8708-bc00dc31885a')
on conflict (user_id) do nothing;
