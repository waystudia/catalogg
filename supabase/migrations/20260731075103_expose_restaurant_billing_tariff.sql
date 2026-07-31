create or replace function public.get_current_restaurant_billing_tariff(
  target_catalog_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_catalog_id uuid;
  result jsonb;
begin
  if not public.has_catalog_admin_access(target_catalog_slug) then
    raise exception 'Restaurant access is required';
  end if;

  select c.id
    into target_catalog_id
  from public.catalogs c
  where lower(c.slug) = lower(trim(target_catalog_slug))
  limit 1;

  select jsonb_build_object(
    'tariff_type', coalesce(custom.tariff_type, settings.restaurant_tariff_type, 'percent'),
    'tariff_percent', coalesce(custom.tariff_percent, settings.restaurant_commission_percent, 0),
    'tariff_fixed', coalesce(custom.tariff_fixed, settings.restaurant_tariff_fixed, 0)
  )
    into result
  from public.platform_billing_settings settings
  left join lateral (
    select tariff_type, tariff_percent, tariff_fixed
    from public.platform_custom_tariffs
    where subject_type = 'restaurant'
      and subject_id = target_catalog_id::text
      and is_active
    limit 1
  ) custom on true
  where settings.id = 'global';

  return coalesce(
    result,
    jsonb_build_object('tariff_type', 'percent', 'tariff_percent', 0, 'tariff_fixed', 0)
  );
end;
$$;

revoke all on function public.get_current_restaurant_billing_tariff(text) from public, anon;
grant execute on function public.get_current_restaurant_billing_tariff(text) to authenticated;

create or replace function public.get_restaurant_order_id_for_delivery(
  target_delivery_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_catalog_slug text;
begin
  select d.order_id, c.slug
    into target_order_id, target_catalog_slug
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.catalogs c on c.id = o.catalog_id
  where d.id = target_delivery_id;

  if target_order_id is null or not public.has_catalog_admin_access(target_catalog_slug) then
    raise exception 'Restaurant access is required';
  end if;

  return target_order_id;
end;
$$;

revoke all on function public.get_restaurant_order_id_for_delivery(uuid) from public, anon;
grant execute on function public.get_restaurant_order_id_for_delivery(uuid) to authenticated;
