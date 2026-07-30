alter table public.platform_billing_settings
  add column if not exists restaurant_tariff_type text not null default 'percent',
  add column if not exists restaurant_tariff_fixed numeric(12,2) not null default 0,
  add column if not exists driver_tariff_type text not null default 'percent',
  add column if not exists driver_tariff_fixed numeric(12,2) not null default 0;

alter table public.platform_billing_settings
  drop constraint if exists platform_billing_settings_restaurant_tariff_type_check,
  drop constraint if exists platform_billing_settings_restaurant_tariff_fixed_check,
  drop constraint if exists platform_billing_settings_driver_tariff_type_check,
  drop constraint if exists platform_billing_settings_driver_tariff_fixed_check;

alter table public.platform_billing_settings
  add constraint platform_billing_settings_restaurant_tariff_type_check
    check (restaurant_tariff_type in ('percent', 'fixed')),
  add constraint platform_billing_settings_restaurant_tariff_fixed_check
    check (restaurant_tariff_fixed >= 0),
  add constraint platform_billing_settings_driver_tariff_type_check
    check (driver_tariff_type in ('percent', 'fixed')),
  add constraint platform_billing_settings_driver_tariff_fixed_check
    check (driver_tariff_fixed >= 0);

alter table public.platform_custom_tariffs
  add column if not exists tariff_type text not null default 'percent',
  add column if not exists tariff_fixed numeric(12,2) not null default 0;

alter table public.platform_custom_tariffs
  drop constraint if exists platform_custom_tariffs_tariff_type_check,
  drop constraint if exists platform_custom_tariffs_tariff_fixed_check;

alter table public.platform_custom_tariffs
  add constraint platform_custom_tariffs_tariff_type_check
    check (tariff_type in ('percent', 'fixed')),
  add constraint platform_custom_tariffs_tariff_fixed_check
    check (tariff_fixed >= 0);

create or replace function public.complete_driver_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  viewer_driver_id uuid := public.current_driver_id();
  payout numeric(12,2);
  resolved_tariff_type text := 'percent';
  resolved_tariff_percent numeric(5,2) := 0;
  resolved_tariff_fixed numeric(12,2) := 0;
  commission_amount numeric(12,2) := 0;
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;

  select d.order_id, coalesce(nullif(d.offered_fee, 0), nullif(o.delivery_fee, 0), 0)
  into target_order_id, payout
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
    and d.status in ('handed_over', 'on_the_way', 'arrived_to_client')
  for update;

  if target_order_id is null then raise exception 'Delivery cannot be completed'; end if;

  select
    coalesce(custom.tariff_type, settings.driver_tariff_type, 'percent'),
    coalesce(custom.tariff_percent, settings.driver_tariff_percent, 0),
    coalesce(custom.tariff_fixed, settings.driver_tariff_fixed, 0)
  into resolved_tariff_type, resolved_tariff_percent, resolved_tariff_fixed
  from public.platform_billing_settings settings
  left join lateral (
    select tariff_type, tariff_percent, tariff_fixed
    from public.platform_custom_tariffs
    where subject_type = 'driver'
      and subject_id = viewer_driver_id
      and is_active
    limit 1
  ) custom on true
  where settings.id = 'global';

  commission_amount := round(greatest(
    0,
    case
      when resolved_tariff_type = 'fixed' then resolved_tariff_fixed
      else payout * resolved_tariff_percent / 100
    end
  ), 2);

  update public.deliveries
  set status = 'delivered', delivered_at = now(), updated_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'completed', completed_at = now()
  where id = target_order_id;

  update public.drivers
  set status = 'online', is_online = true, updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'delivered', 'driver completed delivery');

  insert into public.earnings (driver_id, delivery_id, amount, commission)
  values (viewer_driver_id, target_delivery_id, payout, commission_amount)
  on conflict (delivery_id) do update
  set amount = excluded.amount,
      commission = excluded.commission;

  return target_delivery_id;
end;
$$;

revoke all on function public.complete_driver_delivery(uuid) from public, anon;
grant execute on function public.complete_driver_delivery(uuid) to authenticated;
