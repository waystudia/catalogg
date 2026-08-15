-- Seed the first WayYaam settlement tariff cluster from a local courier quote.
-- Quoted prices are preserved verbatim. Missing pairs use the agreed route-zone
-- model: 200 RUB inside one settlement, then increasing 300/400/500 RUB bands
-- for a neighbouring settlement, a longer neighbour, or a route through another
-- settlement. Road distance chooses between close bands and long chains receive
-- the next 100 RUB step. A longer route is never cheaper than a quoted segment.

alter table public.delivery_settlements
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists boundary_width_km numeric(8,2),
  add column if not exists boundary_height_km numeric(8,2),
  add column if not exists geodata_source text not null default '';

alter table public.delivery_pricing_rules
  add column if not exists road_distance_km numeric(8,2),
  add column if not exists estimated_duration_minutes integer,
  add column if not exists pricing_source text not null default 'manual',
  add column if not exists pricing_note text not null default '';

do $$
begin
  alter table public.delivery_pricing_rules
    add constraint delivery_pricing_rules_road_distance_check
    check (road_distance_km is null or road_distance_km >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.delivery_pricing_rules
    add constraint delivery_pricing_rules_duration_check
    check (estimated_duration_minutes is null or estimated_duration_minutes >= 0);
exception when duplicate_object then null;
end $$;

insert into public.delivery_settlements (
  city_name,
  settlement_name,
  is_active,
  latitude,
  longitude,
  boundary_width_km,
  boundary_height_km,
  geodata_source
)
values
  ('', 'Цоци-Юрт', true, 43.2406960, 45.9976840, 4.15, 4.45, 'OpenStreetMap/Nominatim 2026-08-15'),
  ('', 'Гелдаган', true, 43.2144240, 46.0376820, 3.86, 5.10, 'OpenStreetMap/Nominatim 2026-08-15'),
  ('', 'Автуры', true, 43.1594691, 45.9951441, 6.27, 6.46, 'OpenStreetMap/Nominatim 2026-08-15'),
  ('', 'Курчалой', true, 43.2000500, 46.0907860, 4.05, 4.13, 'OpenStreetMap/Nominatim 2026-08-15'),
  ('', 'Мескер-Юрт', true, 43.2608264, 45.9289222, 5.16, 5.64, 'OpenStreetMap/Nominatim 2026-08-15')
on conflict (city_name, settlement_name) do update
set is_active = excluded.is_active,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    boundary_width_km = excluded.boundary_width_km,
    boundary_height_km = excluded.boundary_height_km,
    geodata_source = excluded.geodata_source,
    updated_at = now();

with route_prices (
  from_settlement,
  to_settlement,
  amount,
  road_distance_km,
  estimated_duration_minutes,
  pricing_source,
  pricing_note
) as (
  values
    -- Same-settlement base tariff.
    ('Цоци-Юрт', 'Цоци-Юрт', 200::numeric, 0::numeric, 0, 'local_rule', 'Обе точки находятся в одном населённом пункте'),
    ('Гелдаган', 'Гелдаган', 200, 0, 0, 'local_rule', 'Обе точки находятся в одном населённом пункте'),
    ('Автуры', 'Автуры', 200, 0, 0, 'local_rule', 'Обе точки находятся в одном населённом пункте'),
    ('Курчалой', 'Курчалой', 200, 0, 0, 'local_rule', 'Обе точки находятся в одном населённом пункте'),
    ('Мескер-Юрт', 'Мескер-Юрт', 200, 0, 0, 'local_rule', 'Обе точки находятся в одном населённом пункте'),

    -- Confirmed local courier quote; both directions receive the same customer tariff.
    ('Цоци-Юрт', 'Гелдаган', 300, 6.13, 12, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Гелдаган', 'Цоци-Юрт', 300, 6.13, 12, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Цоци-Юрт', 'Автуры', 500, 12.43, 21, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Автуры', 'Цоци-Юрт', 500, 12.43, 21, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Цоци-Юрт', 'Курчалой', 500, 10.05, 17, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Курчалой', 'Цоци-Юрт', 500, 10.01, 16, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Цоци-Юрт', 'Мескер-Юрт', 400, 6.73, 12, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Мескер-Юрт', 'Цоци-Юрт', 400, 6.73, 12, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Гелдаган', 'Курчалой', 400, 6.47, 11, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Курчалой', 'Гелдаган', 400, 6.13, 10, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Гелдаган', 'Автуры', 500, 7.77, 14, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Автуры', 'Гелдаган', 500, 7.77, 14, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Гелдаган', 'Мескер-Юрт', 400, 12.11, 21, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),
    ('Мескер-Юрт', 'Гелдаган', 400, 12.11, 21, 'local_courier_quote', 'Подтверждено местным водителем 2026-08-15'),

    -- Missing pairs estimated from the seven quotes and real road distances.
    ('Автуры', 'Курчалой', 500, 9.60, 17, 'route_zone_model', 'Маршрут через соседнюю зону; ступень 500 ₽'),
    ('Курчалой', 'Автуры', 500, 9.60, 17, 'route_zone_model', 'Маршрут через соседнюю зону; ступень 500 ₽'),
    ('Автуры', 'Мескер-Юрт', 600, 22.40, 25, 'route_zone_model', 'Длинная цепочка населённых пунктов; следующая ступень 600 ₽'),
    ('Мескер-Юрт', 'Автуры', 600, 22.47, 26, 'route_zone_model', 'Длинная цепочка населённых пунктов; следующая ступень 600 ₽'),
    ('Курчалой', 'Мескер-Юрт', 600, 23.06, 26, 'route_zone_model', 'Длинная цепочка населённых пунктов; следующая ступень 600 ₽'),
    ('Мескер-Юрт', 'Курчалой', 600, 15.99, 23, 'route_zone_model', 'Длинная цепочка населённых пунктов; следующая ступень 600 ₽')
)
insert into public.delivery_pricing_rules (
  from_settlement,
  to_settlement,
  amount,
  is_active,
  road_distance_km,
  estimated_duration_minutes,
  pricing_source,
  pricing_note
)
select
  from_settlement,
  to_settlement,
  amount,
  true,
  road_distance_km,
  estimated_duration_minutes,
  pricing_source,
  pricing_note
from route_prices
on conflict (from_settlement, to_settlement) do update
set amount = excluded.amount,
    is_active = true,
    road_distance_km = excluded.road_distance_km,
    estimated_duration_minutes = excluded.estimated_duration_minutes,
    pricing_source = excluded.pricing_source,
    pricing_note = excluded.pricing_note,
    updated_at = now();

create or replace function public.normalize_delivery_settlement_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.btrim(coalesce(value, ''))),
    '[^[:alnum:]]',
    '',
    'g'
  )
$$;

create or replace function public.get_delivery_route_price(
  from_settlement_input text,
  to_settlement_input text
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select rule.amount
  from public.delivery_pricing_rules rule
  where rule.is_active
    and public.normalize_delivery_settlement_name(rule.from_settlement)
      = public.normalize_delivery_settlement_name(from_settlement_input)
    and public.normalize_delivery_settlement_name(rule.to_settlement)
      = public.normalize_delivery_settlement_name(to_settlement_input)
  order by rule.updated_at desc
  limit 1
$$;

revoke all on function public.normalize_delivery_settlement_name(text) from public;
revoke all on function public.get_delivery_route_price(text, text) from public;
grant execute on function public.normalize_delivery_settlement_name(text) to anon, authenticated, service_role;
grant execute on function public.get_delivery_route_price(text, text) to anon, authenticated, service_role;

-- Keep the existing order-finalization behavior, then replace only the delivery
-- amount while the order is still new. This avoids duplicating the mature order
-- creation and identity logic in another parallel implementation.
alter function public.finalize_created_client_platform_order(uuid, text)
  rename to finalize_created_client_platform_order_flat_fee_legacy;

revoke all on function public.finalize_created_client_platform_order_flat_fee_legacy(uuid, text)
  from public, anon, authenticated;

create or replace function public.finalize_created_client_platform_order(
  created_order_id uuid,
  selected_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  finalized_order_id uuid;
  order_row public.orders%rowtype;
  settings public.restaurant_delivery_settings%rowtype;
  route_fee numeric(12,2);
  resolved_delivery_fee numeric(12,2);
begin
  finalized_order_id := public.finalize_created_client_platform_order_flat_fee_legacy(
    created_order_id,
    selected_payment_method
  );

  select * into order_row
  from public.orders
  where id = finalized_order_id
  for update;

  if order_row.id is null
    or order_row.fulfillment_type <> 'delivery'
    or order_row.accepted_at is not null
    or order_row.status::text not in ('new', 'waiting_payment_confirmation') then
    return finalized_order_id;
  end if;

  select * into settings
  from public.restaurant_delivery_settings
  where catalog_id = order_row.catalog_id;

  route_fee := public.get_delivery_route_price(
    coalesce(nullif(pg_catalog.btrim(settings.primary_city), ''), order_row.delivery_city),
    coalesce(nullif(pg_catalog.btrim(order_row.delivery_settlement), ''), order_row.delivery_city)
  );

  resolved_delivery_fee := case
    when coalesce(settings.free_delivery_from, 0) > 0
      and order_row.subtotal >= settings.free_delivery_from then 0
    else coalesce(route_fee, order_row.delivery_fee, 120)
  end;

  update public.orders
  set delivery_fee = resolved_delivery_fee,
      total_amount = subtotal + resolved_delivery_fee,
      total = subtotal + resolved_delivery_fee
  where id = finalized_order_id;

  return finalized_order_id;
end;
$$;

revoke all on function public.finalize_created_client_platform_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_created_client_platform_order(uuid, text)
  to anon, authenticated;
