alter table public.clients
  add column if not exists debt_limit_reached_at timestamptz,
  add column if not exists debt_blocked_at timestamptz;

alter table public.drivers
  add column if not exists debt_limit_reached_at timestamptz,
  add column if not exists debt_blocked_at timestamptz;

update public.platform_financial_policy_settings
set debt_warning_amount = 4000,
    debt_limit_amount = 5000,
    grace_hours = 24,
    updated_at = now()
where id = 'global';

create or replace function public.refresh_billing_account_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_amount numeric(12,2);
  policy public.platform_financial_policy_settings%rowtype;
begin
  if new.ledger_scope <> 'platform_debt' then return new; end if;

  select * into policy
  from public.platform_financial_policy_settings
  where id = 'global';

  select coalesce(sum(case when entry_type = 'charge' then amount else -amount end), 0)
  into resolved_amount
  from public.billing_ledger_entries
  where ledger_scope = 'platform_debt'
    and account_type = new.account_type
    and account_id = new.account_id;

  if new.account_type = 'restaurant' then
    update public.clients
    set debt_amount = resolved_amount,
        debt_limit_reached_at = case
          when resolved_amount < policy.debt_limit_amount then null
          else coalesce(debt_limit_reached_at, now())
        end,
        debt_blocked_at = case
          when resolved_amount < policy.debt_limit_amount then null
          when coalesce(debt_limit_reached_at, now()) + make_interval(hours => policy.grace_hours) <= now()
            then coalesce(debt_blocked_at, now())
          else debt_blocked_at
        end
    where id = new.account_id;
  else
    update public.drivers
    set debt_amount = resolved_amount,
        debt_limit_reached_at = case
          when resolved_amount < policy.debt_limit_amount then null
          else coalesce(debt_limit_reached_at, now())
        end,
        debt_blocked_at = case
          when resolved_amount < policy.debt_limit_amount then null
          when coalesce(debt_limit_reached_at, now()) + make_interval(hours => policy.grace_hours) <= now()
            then coalesce(debt_blocked_at, now())
          else debt_blocked_at
        end,
        updated_at = now()
    where id = new.account_id;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_billing_account_debt() from public, anon, authenticated;

update public.clients client
set debt_limit_reached_at = coalesce(client.debt_limit_reached_at, now())
from public.platform_financial_policy_settings policy
where policy.id = 'global'
  and client.debt_amount >= policy.debt_limit_amount;

update public.drivers driver
set debt_limit_reached_at = coalesce(driver.debt_limit_reached_at, now()),
    updated_at = now()
from public.platform_financial_policy_settings policy
where policy.id = 'global'
  and driver.debt_amount >= policy.debt_limit_amount;

create or replace function public.billing_debt_is_blocked(target_account_type text, target_account_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  policy public.platform_financial_policy_settings%rowtype;
  debt numeric(12,2);
  reached_at timestamptz;
begin
  select * into policy
  from public.platform_financial_policy_settings
  where id = 'global';

  if target_account_type = 'restaurant' then
    select client.debt_amount, client.debt_limit_reached_at
    into debt, reached_at
    from public.clients client
    where client.id = target_account_id;
  elsif target_account_type = 'driver' then
    select driver.debt_amount, driver.debt_limit_reached_at
    into debt, reached_at
    from public.drivers driver
    where driver.id = target_account_id;
  else
    return false;
  end if;

  return coalesce(debt, 0) >= policy.debt_limit_amount
    and reached_at is not null
    and reached_at + make_interval(hours => policy.grace_hours) <= now();
end;
$$;

revoke all on function public.billing_debt_is_blocked(text, uuid) from public, anon, authenticated;

create or replace function public.get_current_billing_debt_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  viewer_client_id uuid := public.current_restaurant_client_id();
  account_type text;
  account_id uuid;
  debt numeric(12,2);
  reached_at timestamptz;
  stored_blocked_at timestamptz;
  policy public.platform_financial_policy_settings%rowtype;
  deadline timestamptz;
  blocked boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into policy from public.platform_financial_policy_settings where id = 'global';

  if viewer_driver_id is not null then
    account_type := 'driver';
    account_id := viewer_driver_id;
    select driver.debt_amount, driver.debt_limit_reached_at, driver.debt_blocked_at
    into debt, reached_at, stored_blocked_at
    from public.drivers driver where driver.id = account_id;
  elsif viewer_client_id is not null then
    account_type := 'restaurant';
    account_id := viewer_client_id;
    select client.debt_amount, client.debt_limit_reached_at, client.debt_blocked_at
    into debt, reached_at, stored_blocked_at
    from public.clients client where client.id = account_id;
  else
    raise exception 'billing_account_not_found';
  end if;

  deadline := case when reached_at is null then null
    else reached_at + make_interval(hours => policy.grace_hours) end;
  blocked := coalesce(debt, 0) >= policy.debt_limit_amount
    and deadline is not null
    and deadline <= now();

  return jsonb_build_object(
    'account_type', account_type,
    'account_id', account_id,
    'debt_amount', coalesce(debt, 0),
    'warning_amount', policy.debt_warning_amount,
    'limit_amount', policy.debt_limit_amount,
    'grace_hours', policy.grace_hours,
    'limit_reached_at', reached_at,
    'deadline', deadline,
    'blocked', blocked,
    'blocked_at', coalesce(stored_blocked_at, case when blocked then deadline else null end)
  );
end;
$$;

revoke all on function public.get_current_billing_debt_status() from public, anon;
grant execute on function public.get_current_billing_debt_status() to authenticated;

create or replace function public.can_catalog_accept_real_orders(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients client
    where client.catalog_id = target_catalog_id
      and client.legal_activation_status = 'active'
      and client.status = 'active'
      and not public.billing_debt_is_blocked('restaurant', client.id)
  );
$$;

revoke all on function public.can_catalog_accept_real_orders(uuid) from public;
grant execute on function public.can_catalog_accept_real_orders(uuid) to anon, authenticated;

create or replace function public.enforce_driver_debt_assignment_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.driver_id is null
     and new.driver_id is not null
     and public.billing_debt_is_blocked('driver', new.driver_id) then
    raise exception 'driver_debt_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_driver_debt_assignment_gate() from public, anon, authenticated;
drop trigger if exists deliveries_block_debt_assignment on public.deliveries;
create trigger deliveries_block_debt_assignment
before update of driver_id on public.deliveries
for each row execute function public.enforce_driver_debt_assignment_gate();
