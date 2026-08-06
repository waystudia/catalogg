-- Permanent E2E identities use the production business flow while remaining
-- invisible to ordinary customers, drivers, finance totals, and KPI queries.

alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.users add column if not exists is_test boolean not null default false;
alter table public.client_accounts
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_test boolean not null default false;
alter table public.client_addresses add column if not exists is_test boolean not null default false;
alter table public.clients
  add column if not exists is_test boolean not null default false,
  add column if not exists test_debt_amount numeric(12,2) not null default 0;
alter table public.catalogs add column if not exists is_test boolean not null default false;
alter table public.restaurants add column if not exists is_test boolean not null default false;
alter table public.drivers
  add column if not exists is_test boolean not null default false,
  add column if not exists test_debt_amount numeric(12,2) not null default 0;
alter table public.deliveries add column if not exists is_test boolean not null default false;
alter table public.earnings add column if not exists is_test boolean not null default false;
alter table public.billing_ledger_entries add column if not exists is_test boolean not null default false;

create unique index if not exists client_accounts_auth_user_id_idx
  on public.client_accounts(auth_user_id) where auth_user_id is not null;
create index if not exists catalogs_test_visibility_idx on public.catalogs(is_test, status);
create index if not exists drivers_test_dispatch_idx on public.drivers(is_test, is_active, is_online);
create index if not exists orders_test_reporting_idx on public.orders(is_test_order, created_at desc);
create index if not exists deliveries_test_dispatch_idx on public.deliveries(is_test, status, created_at desc);
create index if not exists billing_ledger_test_reporting_idx
  on public.billing_ledger_entries(is_test, ledger_scope, account_type, account_id);

create or replace function public.current_actor_is_test()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select platform_user.is_test
     from public.users platform_user
     where platform_user.auth_user_id = auth.uid()
     order by platform_user.created_at
     limit 1),
    (select profile.is_test from public.profiles profile where profile.id = auth.uid()),
    false
  );
$$;
revoke all on function public.current_actor_is_test() from public;
grant execute on function public.current_actor_is_test() to anon, authenticated;

create or replace function public.protect_is_test_marker()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(old) ->> 'is_test')::boolean is distinct from (to_jsonb(new) ->> 'is_test')::boolean
     and not public.is_platform_admin()
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'test_marker_is_server_managed';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_is_test_marker() from public, anon, authenticated;

drop trigger if exists profiles_protect_is_test on public.profiles;
create trigger profiles_protect_is_test before update of is_test on public.profiles
for each row execute function public.protect_is_test_marker();
drop trigger if exists users_protect_is_test on public.users;
create trigger users_protect_is_test before update of is_test on public.users
for each row execute function public.protect_is_test_marker();
drop trigger if exists client_accounts_protect_is_test on public.client_accounts;
create trigger client_accounts_protect_is_test before update of is_test on public.client_accounts
for each row execute function public.protect_is_test_marker();
drop trigger if exists clients_protect_is_test on public.clients;
create trigger clients_protect_is_test before update of is_test on public.clients
for each row execute function public.protect_is_test_marker();
drop trigger if exists catalogs_protect_is_test on public.catalogs;
create trigger catalogs_protect_is_test before update of is_test on public.catalogs
for each row execute function public.protect_is_test_marker();
drop trigger if exists restaurants_protect_is_test on public.restaurants;
create trigger restaurants_protect_is_test before update of is_test on public.restaurants
for each row execute function public.protect_is_test_marker();
drop trigger if exists drivers_protect_is_test on public.drivers;
create trigger drivers_protect_is_test before update of is_test on public.drivers
for each row execute function public.protect_is_test_marker();

create or replace function public.login_current_auth_client_account()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.client_accounts%rowtype;
  session_token text;
  session_expiry timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select client_account.* into account
  from public.client_accounts client_account
  where client_account.auth_user_id = auth.uid();

  if account.id is null or account.is_test is distinct from public.current_actor_is_test() then
    raise exception 'client_account_not_linked';
  end if;

  delete from public.client_account_sessions where expires_at <= now();
  session_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.client_account_sessions(account_id, token_hash, expires_at)
  values(account.id, extensions.digest(session_token, 'sha256'), session_expiry);

  return jsonb_build_object(
    'account_id', account.id,
    'name', account.name,
    'phone', account.phone,
    'session_token', session_token,
    'expires_at', session_expiry
  );
end;
$$;
revoke all on function public.login_current_auth_client_account() from public, anon;
grant execute on function public.login_current_auth_client_account() to authenticated;

create or replace function public.resolve_current_login_redirect()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  viewer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_slug text;
begin
  if viewer_user_id is null then return null; end if;
  if public.current_driver_id() is not null then return '/driver'; end if;

  select catalog.slug into target_slug
  from public.clients client
  join public.catalogs catalog on catalog.id = client.catalog_id
  where client.owner_user_id = viewer_user_id
     or (viewer_email <> '' and lower(client.email) = viewer_email)
  order by (client.owner_user_id = viewer_user_id) desc
  limit 1;
  if target_slug is not null then return '/' || target_slug || '/dashboard'; end if;

  select catalog.slug into target_slug
  from public.catalog_members member
  join public.catalogs catalog on catalog.id = member.catalog_id
  where member.user_id = viewer_user_id
  order by catalog.created_at
  limit 1;
  if target_slug is not null then return '/' || target_slug || '/dashboard'; end if;

  if public.is_platform_admin() then return '/admin'; end if;
  if exists (select 1 from public.admin_user admin where admin.user_id = viewer_user_id) then
    return '/mangal/dashboard';
  end if;
  if exists (
    select 1 from public.users platform_user
    where platform_user.auth_user_id = viewer_user_id and platform_user.role = 'client'
  ) then return '/profile'; end if;
  return '/';
end;
$$;
revoke all on function public.resolve_current_login_redirect() from public, anon;
grant execute on function public.resolve_current_login_redirect() to authenticated;

drop policy if exists "catalogs public read published" on public.catalogs;
create policy "catalogs public read published" on public.catalogs
for select
using (
  (
    catalogs.status = 'published'::public.catalog_status
    and catalogs.is_template = false
    and public.can_catalog_accept_real_orders(catalogs.id)
    and (not catalogs.is_test or public.current_actor_is_test())
  )
  or catalogs.is_template = true
  or public.is_platform_admin()
  or public.is_catalog_member(catalogs.id, array['owner','admin','editor','viewer']::public.catalog_role[])
);

drop policy if exists "restaurants public read active" on public.restaurants;
create policy "restaurants public read active" on public.restaurants
for select
using (
  (
    restaurants.is_active
    and restaurants.catalog_id is not null
    and public.can_catalog_accept_real_orders(restaurants.catalog_id)
    and (not restaurants.is_test or public.current_actor_is_test())
  )
  or public.is_platform_admin()
  or (
    restaurants.catalog_id is not null
    and public.is_catalog_member(restaurants.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
);

drop policy if exists "categories public read published" on public.categories;
create policy "categories public read published" on public.categories
for select
using (
  (
    not categories.is_hidden
    and public.is_catalog_published(categories.catalog_id)
    and exists (
      select 1 from public.catalogs category_catalog
      where category_catalog.id = categories.catalog_id
        and (not category_catalog.is_test or public.current_actor_is_test())
    )
  )
  or public.is_catalog_member(
    categories.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]
  )
);

drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products
for select
using (
  (
    products.status in ('active'::public.product_status, 'sold_out'::public.product_status)
    and public.is_catalog_published(products.catalog_id)
    and exists (
      select 1 from public.catalogs product_catalog
      where product_catalog.id = products.catalog_id
        and (not product_catalog.is_test or public.current_actor_is_test())
    )
  )
  or public.is_catalog_member(
    products.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]
  )
);

create or replace function public.enforce_order_test_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_is_test boolean;
  actor_is_test boolean := public.current_actor_is_test();
  privileged boolean := public.is_platform_admin()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  select catalog.is_test into catalog_is_test from public.catalogs catalog where catalog.id = new.catalog_id;
  if catalog_is_test is null then raise exception 'catalog_not_found'; end if;
  if not privileged and catalog_is_test is distinct from actor_is_test then
    raise exception 'order_test_scope_mismatch';
  end if;
  new.is_test_order := catalog_is_test;
  return new;
end;
$$;
revoke all on function public.enforce_order_test_scope() from public, anon, authenticated;
drop trigger if exists orders_enforce_test_scope on public.orders;
create trigger orders_enforce_test_scope
before insert or update of catalog_id, is_test_order on public.orders
for each row execute function public.enforce_order_test_scope();

update public.deliveries delivery
set is_test = coalesce(order_row.is_test_order, false)
from public.orders order_row
where order_row.id = delivery.order_id
  and delivery.is_test is distinct from coalesce(order_row.is_test_order, false);

create or replace function public.enforce_delivery_test_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_is_test boolean;
  driver_is_test boolean;
begin
  select order_row.is_test_order into order_is_test
  from public.orders order_row where order_row.id = new.order_id;
  if order_is_test is null then raise exception 'order_not_found'; end if;
  new.is_test := order_is_test;

  if new.driver_id is not null then
    select driver.is_test into driver_is_test from public.drivers driver where driver.id = new.driver_id;
    if driver_is_test is null then raise exception 'driver_not_found'; end if;
    if driver_is_test is distinct from order_is_test then
      raise exception 'delivery_test_scope_mismatch';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_delivery_test_scope() from public, anon, authenticated;
drop trigger if exists deliveries_enforce_test_scope on public.deliveries;
create trigger deliveries_enforce_test_scope
before insert or update of order_id, driver_id, is_test on public.deliveries
for each row execute function public.enforce_delivery_test_scope();

create or replace function public.has_available_premium_driver(
  target_order_id uuid,
  target_delivery_provider text,
  target_restaurant_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders premium_order
    join public.drivers premium_driver
      on premium_driver.is_test = premium_order.is_test_order
    where premium_order.id = target_order_id
      and premium_driver.is_premium
      and premium_driver.is_active
      and premium_driver.is_online
      and public.driver_serves_delivery_location(
        premium_driver.id, premium_order.delivery_city, premium_order.delivery_settlement
      )
      and (
        select count(*) from public.deliveries premium_active_delivery
        where premium_active_delivery.driver_id = premium_driver.id
          and premium_active_delivery.status in (
            'assigned','arrived_to_restaurant','handed_over','on_the_way','arrived_to_client'
          )
      ) < coalesce(premium_driver.max_active_deliveries, 1)
      and (
        target_delivery_provider in ('platform','hybrid')
        or (
          target_delivery_provider = 'restaurant'
          and exists (
            select 1 from public.restaurant_couriers premium_restaurant_courier
            where premium_restaurant_courier.driver_id = premium_driver.id
              and premium_restaurant_courier.is_active
              and premium_restaurant_courier.restaurant_id = coalesce(
                target_restaurant_id,
                premium_order.restaurant_id,
                (select premium_restaurant.id from public.restaurants premium_restaurant
                 where premium_restaurant.catalog_id = premium_order.catalog_id
                 order by premium_restaurant.created_at limit 1)
              )
          )
        )
      )
  );
$$;
revoke all on function public.has_available_premium_driver(uuid, text, uuid) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.get_driver_delivery_offers_unscoped()') is null then
    alter function public.get_driver_delivery_offers() rename to get_driver_delivery_offers_unscoped;
  end if;
end;
$$;
revoke all on function public.get_driver_delivery_offers_unscoped() from public, anon, authenticated;

create or replace function public.get_driver_delivery_offers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(scoped.offer), '[]'::jsonb)
  from (
    select offer
    from jsonb_array_elements(public.get_driver_delivery_offers_unscoped()) offer
    join public.orders offer_order on offer_order.id = (offer ->> 'order_id')::uuid
    join public.drivers viewer_driver on viewer_driver.id = public.current_driver_id()
    where coalesce(offer_order.is_test_order, false) = coalesce(viewer_driver.is_test, false)
    order by case when offer ->> 'driver_id' = viewer_driver.id::text then 0 else 1 end,
             offer ->> 'created_at' desc
  ) scoped;
$$;
revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;

create or replace function public.get_current_driver_dashboard_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', public.get_current_driver_dashboard_profile(),
    'deliveries', public.get_driver_delivery_offers()
  );
$$;
revoke all on function public.get_current_driver_dashboard_data() from public, anon;
grant execute on function public.get_current_driver_dashboard_data() to authenticated;

drop policy if exists "deliveries restaurant driver read" on public.deliveries;
create policy "deliveries restaurant driver read" on public.deliveries
for select
using (
  public.is_platform_admin()
  or (
    public.is_driver_profile(deliveries.driver_id)
    and exists (
      select 1 from public.orders scoped_order
      join public.drivers scoped_driver on scoped_driver.id = public.current_driver_id()
      where scoped_order.id = deliveries.order_id
        and scoped_order.is_test_order = scoped_driver.is_test
    )
  )
  or (
    deliveries.driver_id is null
    and deliveries.status in ('waiting_courier','waiting_driver')
    and exists (
      select 1 from public.orders scoped_order
      join public.drivers scoped_driver on scoped_driver.id = public.current_driver_id()
      where scoped_order.id = deliveries.order_id
        and scoped_driver.is_active and scoped_driver.is_online
        and scoped_order.is_test_order = scoped_driver.is_test
    )
  )
  or exists (
    select 1 from public.orders restaurant_order
    where restaurant_order.id = deliveries.order_id
      and public.is_catalog_member(
        restaurant_order.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]
      )
  )
);

create or replace function public.propagate_earning_test_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select delivery.is_test into new.is_test
  from public.deliveries delivery where delivery.id = new.delivery_id;
  if new.is_test is null then raise exception 'delivery_not_found'; end if;
  return new;
end;
$$;
revoke all on function public.propagate_earning_test_scope() from public, anon, authenticated;
drop trigger if exists earnings_propagate_test_scope on public.earnings;
create trigger earnings_propagate_test_scope before insert or update of delivery_id, is_test on public.earnings
for each row execute function public.propagate_earning_test_scope();

create or replace function public.confirm_delivery_pickup_qr(
  target_delivery_id uuid,
  presented_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_catalog_id uuid;
  target_comment text;
  payment_confirmed_at timestamptz;
begin
  select delivery.order_id, order_row.catalog_id, coalesce(order_row.comment, ''),
         order_row.restaurant_payment_confirmed_at
    into target_order_id, target_catalog_id, target_comment, payment_confirmed_at
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  where delivery.id = target_delivery_id
    and delivery.status = 'arrived_to_restaurant'
    and delivery.pickup_qr_confirmed_at is null
    and delivery.pickup_qr_token = trim(presented_token)
    and delivery.pickup_qr_expires_at > now()
  for update of delivery, order_row;

  if target_order_id is null then return false; end if;
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id, array['owner','admin','editor']::public.catalog_role[]
    )
    or exists (
      select 1 from public.clients client
      where client.catalog_id = target_catalog_id and client.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'Restaurant access is required';
  end if;
  if target_comment ~* '\[payment_method:cash\]' and payment_confirmed_at is null then
    raise exception 'Сначала подтвердите оплату заказа водителем';
  end if;

  update public.deliveries
  set pickup_qr_confirmed_at = now(), updated_at = now()
  where id = target_delivery_id and pickup_qr_confirmed_at is null;
  if not found then return false; end if;

  insert into public.delivery_status_history(delivery_id, status, comment)
  values(target_delivery_id, 'arrived_to_restaurant', 'restaurant verified driver QR');
  return true;
end;
$$;
revoke all on function public.confirm_delivery_pickup_qr(uuid, text) from public, anon;
grant execute on function public.confirm_delivery_pickup_qr(uuid, text) to authenticated;

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
  select * into policy from public.platform_financial_policy_settings where id = 'global';
  select coalesce(sum(case when entry_type = 'charge' then amount else -amount end), 0)
  into resolved_amount
  from public.billing_ledger_entries
  where ledger_scope = 'platform_debt'
    and account_type = new.account_type
    and account_id = new.account_id
    and is_test = new.is_test;

  if new.account_type = 'restaurant' then
    update public.clients
    set test_debt_amount = case when new.is_test then resolved_amount else test_debt_amount end,
        debt_amount = case when new.is_test then debt_amount else resolved_amount end,
        debt_limit_reached_at = case
          when new.is_test then debt_limit_reached_at
          when resolved_amount < policy.debt_limit_amount then null
          else coalesce(debt_limit_reached_at, now()) end,
        debt_blocked_at = case
          when new.is_test then debt_blocked_at
          when resolved_amount < policy.debt_limit_amount then null
          when coalesce(debt_limit_reached_at, now()) + make_interval(hours => policy.grace_hours) <= now()
            then coalesce(debt_blocked_at, now())
          else debt_blocked_at end
    where id = new.account_id;
  else
    update public.drivers
    set test_debt_amount = case when new.is_test then resolved_amount else test_debt_amount end,
        debt_amount = case when new.is_test then debt_amount else resolved_amount end,
        debt_limit_reached_at = case
          when new.is_test then debt_limit_reached_at
          when resolved_amount < policy.debt_limit_amount then null
          else coalesce(debt_limit_reached_at, now()) end,
        debt_blocked_at = case
          when new.is_test then debt_blocked_at
          when resolved_amount < policy.debt_limit_amount then null
          when coalesce(debt_limit_reached_at, now()) + make_interval(hours => policy.grace_hours) <= now()
            then coalesce(debt_blocked_at, now())
          else debt_blocked_at end,
        updated_at = now()
    where id = new.account_id;
  end if;
  return new;
end;
$$;
revoke all on function public.refresh_billing_account_debt() from public, anon, authenticated;

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
  account_is_test boolean := false;
  policy public.platform_financial_policy_settings%rowtype;
  deadline timestamptz;
  blocked boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into policy from public.platform_financial_policy_settings where id = 'global';

  if viewer_driver_id is not null then
    account_type := 'driver';
    account_id := viewer_driver_id;
    select case when driver.is_test then driver.test_debt_amount else driver.debt_amount end,
           driver.debt_limit_reached_at, driver.debt_blocked_at, driver.is_test
    into debt, reached_at, stored_blocked_at, account_is_test
    from public.drivers driver where driver.id = account_id;
  elsif viewer_client_id is not null then
    account_type := 'restaurant';
    account_id := viewer_client_id;
    select case when client.is_test then client.test_debt_amount else client.debt_amount end,
           client.debt_limit_reached_at, client.debt_blocked_at, client.is_test
    into debt, reached_at, stored_blocked_at, account_is_test
    from public.clients client where client.id = account_id;
  else
    raise exception 'billing_account_not_found';
  end if;

  deadline := case when account_is_test or reached_at is null then null
    else reached_at + make_interval(hours => policy.grace_hours) end;
  blocked := not account_is_test
    and coalesce(debt, 0) >= policy.debt_limit_amount
    and deadline is not null
    and deadline <= now();

  return jsonb_build_object(
    'account_type', account_type,
    'account_id', account_id,
    'debt_amount', coalesce(debt, 0),
    'warning_amount', policy.debt_warning_amount,
    'limit_amount', policy.debt_limit_amount,
    'grace_hours', policy.grace_hours,
    'limit_reached_at', case when account_is_test then null else reached_at end,
    'deadline', deadline,
    'blocked', blocked,
    'blocked_at', case when account_is_test then null
      else coalesce(stored_blocked_at, case when blocked then deadline else null end) end,
    'is_test', account_is_test
  );
end;
$$;
revoke all on function public.get_current_billing_debt_status() from public, anon;
grant execute on function public.get_current_billing_debt_status() to authenticated;

create or replace function public.get_current_driver_dashboard_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  profile jsonb;
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;
  select jsonb_build_object(
    'id', driver.id,
    'name', driver.name,
    'phone', driver.phone,
    'vehicle_info', driver.vehicle_info,
    'car_number', driver.car_number,
    'payout_details', driver.payout_details,
    'debt_amount', case when driver.is_test then driver.test_debt_amount else driver.debt_amount end,
    'photo_url', driver.photo_url,
    'service_settlements', driver.service_settlements,
    'rating', driver.rating,
    'status', driver.status,
    'is_online', driver.is_online,
    'last_lat', driver.last_lat,
    'last_lng', driver.last_lng,
    'last_location_at', driver.last_location_at,
    'is_test', driver.is_test
  ) into profile
  from public.drivers driver
  where driver.id = viewer_driver_id and driver.is_active;
  if profile is null then raise exception 'Driver profile was not found'; end if;
  return profile;
end;
$$;
revoke all on function public.get_current_driver_dashboard_profile() from public, anon;
grant execute on function public.get_current_driver_dashboard_profile() to authenticated;

create or replace function public.record_restaurant_order_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client_id uuid;
  target_tariff_id uuid;
  commission numeric(12,2);
begin
  if new.accepted_at is not null and old.accepted_at is null
     and (new.is_test_order or public.can_catalog_accept_real_orders(new.catalog_id)) then
    select client.id into target_client_id from public.clients client
    where client.catalog_id = new.catalog_id limit 1;
    select tariff.id, tariff.restaurant_commission_amount into target_tariff_id, commission
    from public.restaurant_tariffs tariff
    where tariff.client_id = target_client_id
      and tariff.status = 'published'
      and coalesce(tariff.starts_at, now()) <= now()
      and (tariff.ends_at is null or tariff.ends_at > now())
    order by tariff.published_at desc limit 1;
    commission := coalesce(
      commission,
      (select restaurant_order_commission from public.platform_financial_policy_settings where id = 'global'),
      30
    );
    insert into public.billing_ledger_entries(
      event_key, ledger_scope, entry_type, account_type, account_id,
      counterparty_type, order_id, tariff_id, reason, amount, is_test
    ) values (
      'order:' || new.id || ':restaurant_order_commission', 'platform_debt', 'charge',
      'restaurant', target_client_id, 'platform', new.id, target_tariff_id,
      'restaurant_order_commission', commission, new.is_test_order
    ) on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_restaurant_order_commission() from public, anon, authenticated;

create or replace function public.record_completed_delivery_billing(target_delivery_id uuid, target_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_courier_type text;
  target_client_id uuid;
  target_order_id uuid;
  delivery_commission numeric(12,2);
  free_delivery_driver_payout numeric(12,2);
  free_delivery_threshold_reached boolean;
  target_is_test boolean;
begin
  select courier.courier_type, client.id, order_row.id,
    coalesce(tariff.driver_commission_amount, policy.delivery_commission, 30),
    policy.free_delivery_driver_payout,
    (settings.free_delivery_from > 0 and order_row.subtotal >= settings.free_delivery_from
      and coalesce(order_row.delivery_fee, 0) = 0),
    order_row.is_test_order
  into resolved_courier_type, target_client_id, target_order_id, delivery_commission,
       free_delivery_driver_payout, free_delivery_threshold_reached, target_is_test
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  join public.clients client on client.catalog_id = order_row.catalog_id
  left join public.restaurants restaurant on restaurant.catalog_id = order_row.catalog_id
  left join public.restaurant_couriers courier
    on courier.restaurant_id = restaurant.id and courier.driver_id = target_driver_id and courier.is_active
  left join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
  left join lateral (
    select * from public.restaurant_tariffs candidate
    where candidate.client_id = client.id and candidate.status = 'published'
    order by candidate.published_at desc limit 1
  ) tariff on true
  cross join public.platform_financial_policy_settings policy
  where delivery.id = target_delivery_id and policy.id = 'global';

  resolved_courier_type := coalesce(resolved_courier_type, 'independent');
  insert into public.billing_ledger_entries(
    event_key, ledger_scope, entry_type, account_type, account_id, counterparty_type,
    order_id, delivery_id, reason, amount, is_test
  ) values (
    'delivery:' || target_delivery_id || ':platform_commission', 'platform_debt', 'charge',
    case when resolved_courier_type = 'staff_salaried' then 'restaurant' else 'driver' end,
    case when resolved_courier_type = 'staff_salaried' then target_client_id else target_driver_id end,
    'platform', target_order_id, target_delivery_id,
    case when resolved_courier_type = 'staff_salaried'
      then 'restaurant_delivery_commission' else 'driver_delivery_commission' end,
    delivery_commission, target_is_test
  ) on conflict (event_key) do nothing;

  if resolved_courier_type = 'independent' and free_delivery_threshold_reached then
    insert into public.billing_ledger_entries(
      event_key, ledger_scope, entry_type, account_type, account_id, counterparty_type,
      counterparty_id, order_id, delivery_id, reason, amount, is_test
    ) values (
      'delivery:' || target_delivery_id || ':free_delivery_driver_payout', 'courier_payable', 'payout',
      'restaurant', target_client_id, 'driver', target_driver_id, target_order_id, target_delivery_id,
      'free_delivery_driver_payout', free_delivery_driver_payout, target_is_test
    ) on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.record_completed_delivery_billing(uuid, uuid) from public, anon, authenticated;
