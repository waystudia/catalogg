alter table public.orders add column if not exists is_test_order boolean not null default false;
alter table public.clients add column if not exists debt_amount numeric(12,2) not null default 0;
alter table public.restaurant_couriers add column if not exists courier_type text;
alter table public.restaurant_couriers drop constraint if exists restaurant_couriers_courier_type_check;
alter table public.restaurant_couriers add constraint restaurant_couriers_courier_type_check
  check (courier_type in ('staff_salaried', 'independent'));

create table if not exists public.platform_financial_policy_settings (
  id text primary key default 'global' check (id = 'global'),
  restaurant_order_commission numeric(12,2) not null default 30 check (restaurant_order_commission >= 0),
  delivery_commission numeric(12,2) not null default 30 check (delivery_commission >= 0),
  free_delivery_driver_payout numeric(12,2) not null default 200 check (free_delivery_driver_payout >= 0),
  debt_warning_amount numeric(12,2) not null default 4000,
  debt_limit_amount numeric(12,2) not null default 5000,
  grace_hours integer not null default 24 check (grace_hours > 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_financial_policy_settings (id) values ('global') on conflict (id) do nothing;

create table if not exists public.billing_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  ledger_scope text not null check (ledger_scope in ('platform_debt', 'courier_payable')),
  entry_type text not null check (entry_type in ('charge', 'payment', 'credit', 'payout')),
  account_type text not null check (account_type in ('restaurant', 'driver')),
  account_id uuid not null,
  counterparty_type text not null check (counterparty_type in ('platform', 'restaurant', 'driver')),
  counterparty_id uuid,
  order_id uuid references public.orders(id) on delete restrict,
  delivery_id uuid references public.deliveries(id) on delete restrict,
  tariff_id uuid references public.restaurant_tariffs(id) on delete restrict,
  reason text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.platform_financial_policy_settings enable row level security;
alter table public.billing_ledger_entries enable row level security;
revoke all on public.platform_financial_policy_settings from public, anon, authenticated;
revoke all on public.billing_ledger_entries from public, anon, authenticated;

create or replace function public.refresh_billing_account_debt()
returns trigger language plpgsql security definer set search_path = public as $$
declare resolved_amount numeric(12,2);
begin
  if new.ledger_scope <> 'platform_debt' then return new; end if;
  select coalesce(sum(case when entry_type = 'charge' then amount else -amount end), 0)
  into resolved_amount from public.billing_ledger_entries
  where ledger_scope = 'platform_debt' and account_type = new.account_type and account_id = new.account_id;
  if new.account_type = 'restaurant' then
    update public.clients set debt_amount = resolved_amount where id = new.account_id;
  else
    update public.drivers set debt_amount = resolved_amount, updated_at = now() where id = new.account_id;
  end if;
  return new;
end;
$$;
revoke all on function public.refresh_billing_account_debt() from public, anon, authenticated;
drop trigger if exists billing_ledger_refresh_account_debt on public.billing_ledger_entries;
create trigger billing_ledger_refresh_account_debt after insert on public.billing_ledger_entries
for each row execute function public.refresh_billing_account_debt();
drop trigger if exists earnings_refresh_driver_debt on public.earnings;

create or replace function public.normalize_restaurant_courier_earning()
returns trigger language plpgsql security definer set search_path = public as $$
declare resolved_courier_type text; threshold_reached boolean; configured_commission numeric(12,2); configured_payout numeric(12,2);
begin
  select rc.courier_type,
    (coalesce(s.free_delivery_from,0)>0 and o.subtotal>=s.free_delivery_from and coalesce(o.delivery_fee,0)=0),
    coalesce(t.driver_commission_amount,p.delivery_commission,30), p.free_delivery_driver_payout
  into resolved_courier_type,threshold_reached,configured_commission,configured_payout
  from public.deliveries d join public.orders o on o.id=d.order_id
  left join public.restaurants r on r.catalog_id=o.catalog_id
  left join public.restaurant_couriers rc on rc.restaurant_id=r.id and rc.driver_id=new.driver_id and rc.is_active
  left join public.restaurant_delivery_settings s on s.catalog_id=o.catalog_id
  left join public.clients c on c.catalog_id=o.catalog_id
  left join lateral (select * from public.restaurant_tariffs x where x.client_id=c.id and x.status='published' order by x.published_at desc limit 1) t on true
  cross join public.platform_financial_policy_settings p
  where d.id=new.delivery_id and p.id='global';
  if resolved_courier_type = 'staff_salaried' then
    new.amount := 0; new.commission := 0;
  elsif resolved_courier_type = 'independent' then
    new.commission := configured_commission;
    if threshold_reached then new.amount := configured_payout; end if;
  end if;
  return new;
end; $$;
revoke all on function public.normalize_restaurant_courier_earning() from public, anon, authenticated;
drop trigger if exists earnings_normalize_restaurant_courier on public.earnings;
create trigger earnings_normalize_restaurant_courier before insert or update on public.earnings
for each row execute function public.normalize_restaurant_courier_earning();

create or replace function public.get_restaurant_couriers_for_catalog(target_catalog_id uuid)
returns table (driver_id uuid, driver_name text, driver_email text, is_primary boolean, priority smallint, courier_type text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_platform_admin() or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])) then
    raise exception 'Restaurant owner access is required';
  end if;
  return query select d.id, coalesce(nullif(d.name,''), split_part(coalesce(nullif(d.email,''),u.email),'@',1),'Водитель'),
    coalesce(nullif(d.email,''),u.email,''), rc.is_primary, rc.priority, rc.courier_type
  from public.restaurant_couriers rc join public.restaurants r on r.id=rc.restaurant_id
  join public.drivers d on d.id=rc.driver_id left join public.users u on u.id=d.user_id
  where r.catalog_id=target_catalog_id and rc.is_active order by rc.is_primary desc, rc.priority, d.name;
end; $$;
revoke all on function public.get_restaurant_couriers_for_catalog(uuid) from public, anon;
grant execute on function public.get_restaurant_couriers_for_catalog(uuid) to authenticated;

drop function if exists public.link_restaurant_courier_by_email(uuid, text);
create or replace function public.link_restaurant_courier_by_email(target_catalog_id uuid, target_email text, target_courier_type text)
returns table (driver_id uuid, driver_name text, driver_email text, is_primary boolean, priority smallint, courier_type text)
language plpgsql security definer set search_path = public as $$
declare target_restaurant_id uuid; target_driver_id uuid; normalized_email text := lower(trim(coalesce(target_email,'')));
begin
  if target_courier_type not in ('staff_salaried','independent') then raise exception 'courier_type_required'; end if;
  if not (public.is_platform_admin() or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])) then raise exception 'Restaurant owner access is required'; end if;
  select id into target_restaurant_id from public.restaurants where catalog_id=target_catalog_id order by created_at limit 1;
  select d.id into target_driver_id from public.drivers d left join public.users u on u.id=d.user_id
  where lower(coalesce(d.email,u.email,''))=normalized_email and d.is_active order by d.created_at limit 1;
  if target_driver_id is null then raise exception 'Активный водитель с таким e-mail не найден'; end if;
  insert into public.restaurant_couriers (restaurant_id,driver_id,is_active,is_primary,priority,courier_type)
  values (target_restaurant_id,target_driver_id,true,false,10,target_courier_type)
  on conflict on constraint restaurant_couriers_restaurant_id_driver_id_key do update set is_active=true,courier_type=excluded.courier_type;
  return query select * from public.get_restaurant_couriers_for_catalog(target_catalog_id) c where c.driver_id=target_driver_id;
end; $$;
revoke all on function public.link_restaurant_courier_by_email(uuid, text, text) from public, anon;
grant execute on function public.link_restaurant_courier_by_email(uuid, text, text) to authenticated;

create or replace function public.update_restaurant_courier_type(target_catalog_id uuid, target_driver_id uuid, target_courier_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_courier_type not in ('staff_salaried','independent') then raise exception 'courier_type_required'; end if;
  if not (public.is_platform_admin() or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])) then raise exception 'Restaurant owner access is required'; end if;
  update public.restaurant_couriers rc set courier_type=target_courier_type
  from public.restaurants r where r.id=rc.restaurant_id and r.catalog_id=target_catalog_id and rc.driver_id=target_driver_id and rc.is_active;
  if not found then raise exception 'Courier link not found'; end if;
end; $$;
revoke all on function public.update_restaurant_courier_type(uuid, uuid, text) from public, anon;
grant execute on function public.update_restaurant_courier_type(uuid, uuid, text) to authenticated;

create or replace function public.require_classified_restaurant_courier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_provider='restaurant' and new.driver_id is distinct from old.driver_id and exists (
    select 1 from public.orders o join public.restaurants r on r.catalog_id=o.catalog_id
    join public.restaurant_couriers rc on rc.restaurant_id=r.id and rc.driver_id=new.driver_id and rc.is_active
    where o.id=new.order_id and rc.courier_type is null
  ) then raise exception 'courier_type_required'; end if;
  return new;
end; $$;
revoke all on function public.require_classified_restaurant_courier() from public, anon, authenticated;
drop trigger if exists deliveries_require_classified_restaurant_courier on public.deliveries;
create trigger deliveries_require_classified_restaurant_courier before update of driver_id, delivery_provider on public.deliveries
for each row execute function public.require_classified_restaurant_courier();

create or replace function public.record_restaurant_order_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_client_id uuid; target_tariff_id uuid; commission numeric(12,2);
begin
  if new.accepted_at is not null and old.accepted_at is null and coalesce(new.is_test_order, false) = false
     and public.can_catalog_accept_real_orders(new.catalog_id) then
    select c.id into target_client_id from public.clients c where c.catalog_id=new.catalog_id limit 1;
    select t.id,t.restaurant_commission_amount into target_tariff_id,commission from public.restaurant_tariffs t
    where t.client_id=target_client_id and t.status='published' and coalesce(t.starts_at,now())<=now() and (t.ends_at is null or t.ends_at>now())
    order by t.published_at desc limit 1;
    commission := coalesce(commission,(select restaurant_order_commission from public.platform_financial_policy_settings where id='global'),30);
    insert into public.billing_ledger_entries(event_key,ledger_scope,entry_type,account_type,account_id,counterparty_type,order_id,tariff_id,reason,amount)
    values('order:'||new.id||':restaurant_order_commission','platform_debt','charge','restaurant',target_client_id,'platform',new.id,target_tariff_id,'restaurant_order_commission',commission)
    on conflict (event_key) do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.record_restaurant_order_commission() from public, anon, authenticated;
drop trigger if exists orders_record_restaurant_order_commission on public.orders;
create trigger orders_record_restaurant_order_commission after update of accepted_at on public.orders
for each row execute function public.record_restaurant_order_commission();

create or replace function public.record_completed_delivery_billing(target_delivery_id uuid, target_driver_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare resolved_courier_type text; target_client_id uuid; target_order_id uuid; delivery_commission numeric(12,2); free_delivery_driver_payout numeric(12,2); free_delivery_threshold_reached boolean;
begin
  select rc.courier_type,c.id,o.id,coalesce(t.driver_commission_amount,p.delivery_commission,30),p.free_delivery_driver_payout,
    (s.free_delivery_from>0 and o.subtotal>=s.free_delivery_from and coalesce(o.delivery_fee,0)=0)
  into resolved_courier_type,target_client_id,target_order_id,delivery_commission,free_delivery_driver_payout,free_delivery_threshold_reached
  from public.deliveries d join public.orders o on o.id=d.order_id join public.clients c on c.catalog_id=o.catalog_id
  left join public.restaurants r on r.catalog_id=o.catalog_id left join public.restaurant_couriers rc on rc.restaurant_id=r.id and rc.driver_id=target_driver_id and rc.is_active
  left join public.restaurant_delivery_settings s on s.catalog_id=o.catalog_id
  left join lateral (select * from public.restaurant_tariffs x where x.client_id=c.id and x.status='published' order by x.published_at desc limit 1) t on true
  cross join public.platform_financial_policy_settings p where d.id=target_delivery_id and p.id='global';
  resolved_courier_type := coalesce(resolved_courier_type,'independent');
  insert into public.billing_ledger_entries(event_key,ledger_scope,entry_type,account_type,account_id,counterparty_type,order_id,delivery_id,reason,amount)
  values('delivery:'||target_delivery_id||':platform_commission','platform_debt','charge',
    case when resolved_courier_type = 'staff_salaried' then 'restaurant' else 'driver' end,
    case when resolved_courier_type = 'staff_salaried' then target_client_id else target_driver_id end,'platform',target_order_id,target_delivery_id,
    case
      when resolved_courier_type = 'staff_salaried' then 'restaurant_delivery_commission'
      when resolved_courier_type = 'independent' then 'driver_delivery_commission'
    end,delivery_commission)
  on conflict (event_key) do nothing;
  if resolved_courier_type = 'independent' and free_delivery_threshold_reached then
    insert into public.billing_ledger_entries(event_key,ledger_scope,entry_type,account_type,account_id,counterparty_type,counterparty_id,order_id,delivery_id,reason,amount)
    values('delivery:'||target_delivery_id||':free_delivery_driver_payout','courier_payable','payout','restaurant',target_client_id,'driver',target_driver_id,target_order_id,target_delivery_id,'free_delivery_driver_payout',free_delivery_driver_payout)
    on conflict (event_key) do nothing;
  end if;
end; $$;
revoke all on function public.record_completed_delivery_billing(uuid, uuid) from public, anon, authenticated;

create or replace function public.record_delivery_billing_after_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.driver_id is not null then
    perform public.record_completed_delivery_billing(new.id, new.driver_id);
  end if;
  return new;
end; $$;
revoke all on function public.record_delivery_billing_after_completion() from public, anon, authenticated;
drop trigger if exists deliveries_record_billing_after_completion on public.deliveries;
create trigger deliveries_record_billing_after_completion after update of status on public.deliveries
for each row execute function public.record_delivery_billing_after_completion();

revoke all on function public.complete_driver_delivery(uuid) from public, anon;
