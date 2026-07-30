alter table public.drivers
  add column if not exists max_active_deliveries smallint not null default 1;

alter table public.drivers
  drop constraint if exists drivers_max_active_deliveries_check;
alter table public.drivers
  add constraint drivers_max_active_deliveries_check
  check (max_active_deliveries between 1 and 10);

alter table public.restaurant_couriers
  add column if not exists is_primary boolean not null default false,
  add column if not exists priority smallint not null default 100;

create unique index if not exists restaurant_couriers_one_primary_idx
  on public.restaurant_couriers (restaurant_id)
  where is_primary and is_active;

create index if not exists restaurant_couriers_driver_priority_idx
  on public.restaurant_couriers (driver_id, is_active, priority);

drop policy if exists "platform admins manage restaurant couriers" on public.restaurant_couriers;
create policy "platform admins manage restaurant couriers"
on public.restaurant_couriers
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function public.refresh_driver_debt_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_driver_id uuid;
begin
  affected_driver_id := case when tg_op = 'DELETE' then old.driver_id else new.driver_id end;
  update public.drivers d
  set debt_amount = coalesce((
    select sum(coalesce(e.commission, 0))
    from public.earnings e
    where e.driver_id = affected_driver_id
  ), 0),
  updated_at = now()
  where d.id = affected_driver_id;

  if tg_op = 'UPDATE' and old.driver_id is distinct from new.driver_id then
    update public.drivers d
    set debt_amount = coalesce((
      select sum(coalesce(e.commission, 0))
      from public.earnings e
      where e.driver_id = old.driver_id
    ), 0),
    updated_at = now()
    where d.id = old.driver_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists earnings_refresh_driver_debt on public.earnings;
create trigger earnings_refresh_driver_debt
after insert or update or delete on public.earnings
for each row execute function public.refresh_driver_debt_amount();

update public.earnings e
set commission = round(
  e.amount * coalesce(
    (select tariff.tariff_percent
     from public.platform_custom_tariffs tariff
     where tariff.subject_type = 'driver'
       and tariff.subject_id = e.driver_id
       and tariff.is_active
     limit 1),
    (select settings.driver_tariff_percent
     from public.platform_billing_settings settings
     where settings.id = 'global'),
    0
  ) / 100,
  2
)
where coalesce(e.amount, 0) > 0
  and coalesce(e.commission, 0) = 0;

update public.drivers d
set debt_amount = coalesce((
  select sum(coalesce(e.commission, 0))
  from public.earnings e
  where e.driver_id = d.id
), 0);

create or replace function public.dispatch_restaurant_order_to_delivery(
  target_order_id uuid,
  target_catalog_id uuid,
  route_to_restaurant_url_input text,
  route_to_client_url_input text,
  offered_fee_input numeric,
  pricing_status_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
  target_restaurant_id uuid;
  created_delivery_id uuid;
  has_restaurant_couriers boolean := false;
  next_provider text := 'platform';
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])
  ) then
    raise exception 'Restaurant delivery dispatch is not authorized';
  end if;

  select * into target_order
  from public.orders o
  where o.id = target_order_id
    and o.catalog_id = target_catalog_id
  for update;

  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.fulfillment_type <> 'delivery' then raise exception 'Order does not require delivery'; end if;
  if coalesce(target_order.payment_status, 'unpaid') not in ('unpaid', 'confirmed') then
    raise exception 'Order payment is not ready for delivery';
  end if;

  select coalesce(
    target_order.restaurant_id,
    (select r.id from public.restaurants r where r.catalog_id = target_catalog_id order by r.created_at limit 1)
  ) into target_restaurant_id;

  select exists (
    select 1
    from public.restaurant_couriers rc
    join public.drivers dr on dr.id = rc.driver_id
    where rc.restaurant_id = target_restaurant_id
      and rc.is_active
      and dr.is_active
  ) into has_restaurant_couriers;

  next_provider := case when has_restaurant_couriers then 'restaurant' else 'platform' end;

  if target_order.status::text = 'waiting_driver' then
    select d.id into created_delivery_id
    from public.deliveries d
    where d.order_id = target_order.id;
    if created_delivery_id is not null then return created_delivery_id; end if;
  end if;

  if target_order.status::text <> 'ready' then raise exception 'Order is not ready for delivery'; end if;

  insert into public.deliveries (
    order_id,
    delivery_provider,
    status,
    route_to_restaurant_url,
    route_to_client_url,
    offered_fee,
    pricing_status,
    estimated_time_min,
    estimated_time_max
  ) values (
    target_order.id,
    next_provider,
    'waiting_courier',
    coalesce(route_to_restaurant_url_input, ''),
    coalesce(route_to_client_url_input, ''),
    greatest(0, coalesce(offered_fee_input, target_order.delivery_fee, 0)),
    case when pricing_status_input = 'offered' then 'offered' else 'pending' end,
    20,
    40
  )
  on conflict (order_id) do update set
    delivery_provider = case
      when public.deliveries.driver_id is null then excluded.delivery_provider
      else public.deliveries.delivery_provider
    end,
    route_to_restaurant_url = excluded.route_to_restaurant_url,
    route_to_client_url = excluded.route_to_client_url,
    offered_fee = excluded.offered_fee,
    pricing_status = excluded.pricing_status,
    updated_at = now()
  returning id into created_delivery_id;

  insert into public.delivery_tasks (
    catalog_id, order_id, delivery_status, address, city, settlement, qr_required
  ) values (
    target_order.catalog_id,
    target_order.id,
    'waiting_driver',
    coalesce(target_order.delivery_address, ''),
    coalesce(target_order.delivery_city, ''),
    coalesce(target_order.delivery_settlement, ''),
    target_order.qr_token is not null or target_order.verification_code is not null
  )
  on conflict (order_id) do update set
    delivery_status = excluded.delivery_status,
    address = excluded.address,
    city = excluded.city,
    settlement = excluded.settlement,
    qr_required = excluded.qr_required,
    updated_at = now();

  insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
  values (
    target_order.catalog_id,
    target_order.id,
    target_order.status,
    'waiting_driver',
    case when has_restaurant_couriers
      then 'restaurant_priority_couriers'
      else 'restaurant_dispatched_delivery'
    end
  );

  update public.orders
  set status = 'waiting_driver',
      ready_at = coalesce(ready_at, now())
  where id = target_order.id;

  return created_delivery_id;
end;
$$;

revoke all on function public.dispatch_restaurant_order_to_delivery(uuid, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.dispatch_restaurant_order_to_delivery(uuid, uuid, text, text, numeric, text) to authenticated;

create or replace function public.accept_available_delivery(
  target_delivery_id uuid,
  target_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_order_id uuid;
  target_restaurant_id uuid;
  existing_driver_id uuid;
  current_status text;
  current_provider text;
  can_serve boolean := false;
  is_restaurant_courier boolean := false;
  active_delivery_count integer := 0;
  driver_capacity integer := 1;
  next_qr text := encode(gen_random_bytes(32), 'hex');
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;
  if target_driver_id is distinct from viewer_driver_id then
    raise exception 'Driver cannot accept a delivery for another account';
  end if;

  select d.order_id, d.driver_id, d.status, d.delivery_provider,
         coalesce(o.restaurant_id, (
           select r.id from public.restaurants r
           where r.catalog_id = o.catalog_id
           order by r.created_at limit 1
         ))
    into target_order_id, existing_driver_id, current_status, current_provider, target_restaurant_id
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
  for update of d;

  if target_order_id is null then raise exception 'Delivery is not available'; end if;
  if existing_driver_id is not null and existing_driver_id is distinct from viewer_driver_id then
    raise exception 'Delivery is not available';
  end if;
  if current_status not in ('waiting_courier', 'waiting_driver', 'assigned') then
    raise exception 'Delivery is not available';
  end if;

  if existing_driver_id is null then
    select coalesce(dr.max_active_deliveries, 1) into driver_capacity
    from public.drivers dr
    where dr.id = viewer_driver_id
      and dr.is_active
      and dr.is_online;

    if driver_capacity is null then raise exception 'Driver is not available'; end if;

    select count(*) into active_delivery_count
    from public.deliveries active_delivery
    where active_delivery.driver_id = viewer_driver_id
      and active_delivery.status in (
        'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
      );

    if active_delivery_count >= driver_capacity then
      raise exception 'Driver active delivery limit reached';
    end if;

    select public.driver_serves_delivery_location(
      viewer_driver_id, o.delivery_city, o.delivery_settlement
    ) into can_serve
    from public.orders o
    where o.id = target_order_id;

    if not coalesce(can_serve, false) then raise exception 'Delivery is not available'; end if;

    if current_provider = 'restaurant' then
      select exists (
        select 1 from public.restaurant_couriers rc
        where rc.restaurant_id = target_restaurant_id
          and rc.driver_id = viewer_driver_id
          and rc.is_active
      ) into is_restaurant_courier;
      if not is_restaurant_courier then raise exception 'Delivery is reserved for restaurant couriers'; end if;
    elsif current_provider not in ('platform', 'hybrid') then
      raise exception 'Delivery is not available';
    end if;
  end if;

  update public.deliveries
  set driver_id = viewer_driver_id,
      status = 'assigned',
      assigned_at = coalesce(assigned_at, now()),
      pickup_qr_token = coalesce(pickup_qr_token, next_qr),
      pickup_qr_expires_at = greatest(coalesce(pickup_qr_expires_at, now()), now() + interval '2 hours')
  where id = target_delivery_id;

  update public.orders
  set status = 'assigned_driver'
  where id = target_order_id
    and status::text in ('waiting_driver', 'driver_assigned', 'assigned_driver', 'ready');

  update public.drivers
  set is_online = true,
      status = 'heading_to_restaurant',
      updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'assigned', 'driver accepted delivery')
  on conflict do nothing;

  return target_delivery_id;
end;
$$;

revoke all on function public.accept_available_delivery(uuid, uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid, uuid) to authenticated;

create or replace function public.accept_available_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;
  return public.accept_available_delivery(target_delivery_id, viewer_driver_id);
end;
$$;

revoke all on function public.accept_available_delivery(uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid) to authenticated;

create or replace function public.get_driver_delivery_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  offers jsonb;
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;

  with assigned_deliveries as (
    select d.*
    from public.deliveries d
    where d.driver_id = viewer_driver_id
      and d.status in ('assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client')
  ),
  open_deliveries as (
    select d.*
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    where d.driver_id is null
      and d.status in ('waiting_courier', 'waiting_driver')
      and public.driver_serves_delivery_location(viewer_driver_id, o.delivery_city, o.delivery_settlement)
      and (
        select count(*)
        from public.deliveries active_delivery
        where active_delivery.driver_id = viewer_driver_id
          and active_delivery.status in (
            'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
          )
      ) < (
        select coalesce(dr.max_active_deliveries, 1)
        from public.drivers dr
        where dr.id = viewer_driver_id
      )
      and (
        d.delivery_provider in ('platform', 'hybrid')
        or (
          d.delivery_provider = 'restaurant'
          and exists (
            select 1
            from public.restaurant_couriers rc
            join public.restaurants rr on rr.id = rc.restaurant_id
            where rc.driver_id = viewer_driver_id
              and rc.is_active
              and (
                rr.id = o.restaurant_id
                or (o.restaurant_id is null and rr.catalog_id = o.catalog_id)
              )
          )
        )
      )
    order by d.created_at desc
    limit 80
  ),
  candidate_deliveries as (
    select * from assigned_deliveries
    union all
    select * from open_deliveries
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'order_id', d.order_id,
      'driver_id', d.driver_id,
      'status', d.status,
      'delivery_provider', d.delivery_provider,
      'pickup_qr_token', case when d.driver_id = viewer_driver_id then d.pickup_qr_token else null end,
      'pickup_qr_expires_at', case when d.driver_id = viewer_driver_id then d.pickup_qr_expires_at else null end,
      'assigned_at', d.assigned_at,
      'route_to_restaurant_url', d.route_to_restaurant_url,
      'route_to_client_url', case when d.driver_id = viewer_driver_id then d.route_to_client_url else null end,
      'estimated_time_min', d.estimated_time_min,
      'estimated_time_max', d.estimated_time_max,
      'offered_fee', d.offered_fee,
      'pricing_status', d.pricing_status,
      'created_at', d.created_at,
      'orders', jsonb_build_object(
        'id', o.id,
        'order_type', case
          when o.fulfillment_type = 'delivery' then 'delivery'
          when o.fulfillment_type = 'takeaway' then 'pickup'
          else 'dine_in'
        end,
        'fulfillment_type', o.fulfillment_type,
        'status', o.status,
        'payment_status', o.payment_status,
        'client_name', case when d.driver_id = viewer_driver_id then o.client_name else '' end,
        'client_phone', case when d.driver_id = viewer_driver_id then o.client_phone else '' end,
        'customer_name', case when d.driver_id = viewer_driver_id then o.customer_name else '' end,
        'customer_phone', case when d.driver_id = viewer_driver_id then o.customer_phone else '' end,
        'delivery_address', o.delivery_address,
        'delivery_city', o.delivery_city,
        'delivery_settlement', o.delivery_settlement,
        'delivery_lat', o.delivery_lat,
        'delivery_lng', o.delivery_lng,
        'delivery_comment', case when d.driver_id = viewer_driver_id then o.delivery_comment else null end,
        'restaurant_address_snapshot', o.restaurant_address_snapshot,
        'restaurant_lat_snapshot', o.restaurant_lat_snapshot,
        'restaurant_lng_snapshot', o.restaurant_lng_snapshot,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'order_items', coalesce((
          select jsonb_agg(jsonb_build_object('quantity', oi.quantity))
          from public.order_items oi
          where oi.order_id = o.id
        ), '[]'::jsonb),
        'restaurants', jsonb_build_object(
          'name', coalesce(r.name, c.name, 'Ресторан'),
          'logo_url', coalesce(r.logo_url, c.logo_url, ''),
          'cover_url', coalesce(r.cover_url, c.banner_url, ''),
          'description', coalesce(r.description, c.description, ''),
          'address_line', coalesce(r.address_line, o.restaurant_address_snapshot, ''),
          'lat', coalesce(r.lat, o.restaurant_lat_snapshot),
          'lng', coalesce(r.lng, o.restaurant_lng_snapshot),
          'map_url', coalesce(c.map_url, '')
        )
      )
    ) order by
      case when d.driver_id = viewer_driver_id then 0 else 1 end,
      d.updated_at desc nulls last,
      d.created_at desc
  ), '[]'::jsonb) into offers
  from candidate_deliveries d
  join public.orders o on o.id = d.order_id
  left join public.catalogs c on c.id = o.catalog_id
  left join lateral (
    select restaurant.*
    from public.restaurants restaurant
    where restaurant.id = o.restaurant_id
       or restaurant.catalog_id = o.catalog_id
    order by case when restaurant.id = o.restaurant_id then 0 else 1 end
    limit 1
  ) r on true;

  return offers;
end;
$$;

revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;

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
  commission_percent numeric(5,2) := 0;
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

  select coalesce(
    (select tariff_percent
     from public.platform_custom_tariffs
     where subject_type = 'driver'
       and subject_id = viewer_driver_id
       and is_active
     limit 1),
    (select driver_tariff_percent
     from public.platform_billing_settings
     where id = 'global'),
    0
  ) into commission_percent;
  commission_amount := round(payout * greatest(0, commission_percent) / 100, 2);

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

create or replace function public.assign_restaurant_delivery_driver(
  target_delivery_id uuid,
  target_catalog_id uuid,
  target_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_restaurant_id uuid;
  driver_capacity smallint;
  active_delivery_count integer;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])
  ) then
    raise exception 'Restaurant delivery assignment is not authorized';
  end if;

  select
    o.id,
    coalesce(
      o.restaurant_id,
      (select r.id
       from public.restaurants r
       where r.catalog_id = target_catalog_id
       order by r.created_at
       limit 1)
    )
  into target_order_id, target_restaurant_id
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and o.catalog_id = target_catalog_id
    and d.driver_id is null
    and d.status in ('waiting_courier', 'waiting_driver')
  for update of d;

  if target_order_id is null then
    raise exception 'Delivery is no longer available';
  end if;

  select coalesce(dr.max_active_deliveries, 1)
  into driver_capacity
  from public.drivers dr
  where dr.id = target_driver_id
    and dr.is_active
    and dr.is_online
  for update;

  if driver_capacity is null then
    raise exception 'Driver is not available';
  end if;

  if not exists (
    select 1
    from public.restaurant_couriers rc
    where rc.restaurant_id = target_restaurant_id
      and rc.driver_id = target_driver_id
      and rc.is_active
  ) then
    raise exception 'Driver is not linked to this restaurant';
  end if;

  select count(*)
  into active_delivery_count
  from public.deliveries active_delivery
  where active_delivery.driver_id = target_driver_id
    and active_delivery.status in (
      'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
    );

  if active_delivery_count >= driver_capacity then
    raise exception 'Driver active delivery limit reached';
  end if;

  update public.deliveries
  set driver_id = target_driver_id,
      status = 'assigned',
      delivery_provider = 'restaurant',
      assigned_at = now(),
      pickup_qr_token = replace(gen_random_uuid()::text, '-', ''),
      pickup_qr_expires_at = now() + interval '2 hours',
      updated_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'assigned_driver',
      updated_at = now()
  where id = target_order_id;

  update public.drivers
  set status = 'heading_to_restaurant',
      updated_at = now()
  where id = target_driver_id;

  return target_delivery_id;
end;
$$;

revoke all on function public.assign_restaurant_delivery_driver(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_restaurant_delivery_driver(uuid, uuid, uuid) to authenticated;
