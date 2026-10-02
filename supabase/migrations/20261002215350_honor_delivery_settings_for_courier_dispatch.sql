-- Delivery settings must control the actual dispatch, not just the admin UI.
-- A restaurant courier is offered first only when that option is enabled and
-- there is a free, online, classified courier who serves the destination.
create or replace function public.resolve_unassigned_delivery_provider_from_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_courier_enabled boolean := false;
  platform_drivers_enabled boolean := true;
  target_restaurant_id uuid;
  target_city text := '';
  target_settlement text := '';
  has_eligible_own_courier boolean := false;
begin
  if new.driver_id is not null or new.delivery_provider <> 'restaurant' then
    return new;
  end if;

  select
    coalesce(settings.use_own_courier, false),
    coalesce(settings.use_platform_drivers, true),
    coalesce(order_row.restaurant_id, restaurant.id),
    coalesce(order_row.delivery_city, ''),
    coalesce(order_row.delivery_settlement, '')
  into
    own_courier_enabled,
    platform_drivers_enabled,
    target_restaurant_id,
    target_city,
    target_settlement
  from public.orders order_row
  left join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
  left join public.restaurants restaurant on restaurant.catalog_id = order_row.catalog_id
  where order_row.id = new.order_id
  order by restaurant.created_at
  limit 1;

  if not own_courier_enabled then
    if platform_drivers_enabled then
      new.delivery_provider := 'platform';
      return new;
    end if;
    raise exception 'В настройках доставки не выбран исполнитель';
  end if;

  select exists (
    select 1
    from public.restaurant_couriers courier
    join public.drivers driver on driver.id = courier.driver_id
    where courier.restaurant_id = target_restaurant_id
      and courier.is_active
      and courier.courier_type is not null
      and driver.is_active
      and driver.is_online
      and public.driver_serves_delivery_location(driver.id, target_city, target_settlement)
      and (
        select count(*)
        from public.deliveries active_delivery
        where active_delivery.driver_id = driver.id
          and active_delivery.status in (
            'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
          )
      ) < coalesce(driver.max_active_deliveries, 1)
  ) into has_eligible_own_courier;

  if not has_eligible_own_courier and platform_drivers_enabled then
    new.delivery_provider := 'platform';
  end if;

  return new;
end;
$$;

revoke all on function public.resolve_unassigned_delivery_provider_from_settings() from public, anon, authenticated;

drop trigger if exists deliveries_resolve_provider_from_settings on public.deliveries;
create trigger deliveries_resolve_provider_from_settings
before insert or update of delivery_provider, driver_id on public.deliveries
for each row execute function public.resolve_unassigned_delivery_provider_from_settings();

-- Bring waiting offers in line with an already-saved setting immediately.
-- This does not touch a delivery that a courier has accepted.
with switched as (
  update public.deliveries delivery
  set delivery_provider = 'platform',
      status = 'waiting_courier',
      updated_at = now()
  from public.orders order_row
  join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
  where delivery.order_id = order_row.id
    and delivery.driver_id is null
    and delivery.delivery_provider = 'restaurant'
    and delivery.status in ('planning', 'waiting_courier', 'waiting_driver')
    and not settings.use_own_courier
    and settings.use_platform_drivers
  returning order_row.catalog_id, order_row.id, order_row.status
)
insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
select catalog_id, id, status, 'waiting_driver', 'own_courier_disabled_platform'
from switched;

-- A taxi driver refreshing the app releases only offers in that driver's area
-- after the restaurant's configured wait time. This makes the timer real
-- without exposing deliveries or granting drivers write access to tables.
create or replace function public.release_expired_own_courier_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  released_count integer := 0;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  with released as (
    update public.deliveries delivery
    set delivery_provider = 'platform',
        status = 'waiting_courier',
        updated_at = now()
    from public.orders order_row
    join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
    where delivery.order_id = order_row.id
      and delivery.driver_id is null
      and delivery.delivery_provider = 'restaurant'
      and delivery.status in ('planning', 'waiting_courier', 'waiting_driver')
      and settings.use_own_courier
      and settings.use_platform_drivers
      and settings.fallback_to_platform_drivers
      and delivery.created_at <= now() - make_interval(mins => greatest(settings.own_courier_wait_minutes, 0))
      and public.driver_serves_delivery_location(
        viewer_driver_id,
        coalesce(order_row.delivery_city, ''),
        coalesce(order_row.delivery_settlement, '')
      )
    returning order_row.catalog_id, order_row.id, order_row.status
  ), history as (
    insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
    select catalog_id, id, status, 'waiting_driver', 'own_courier_timeout_platform'
    from released
    returning order_id
  )
  select count(*) into released_count from history;

  return released_count;
end;
$$;

revoke all on function public.release_expired_own_courier_offers() from public, anon;
grant execute on function public.release_expired_own_courier_offers() to authenticated;
