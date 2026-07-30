create or replace function public.link_restaurant_courier_by_email(
  target_catalog_id uuid,
  target_email text
)
returns table (
  driver_id uuid,
  driver_name text,
  driver_email text,
  is_primary boolean,
  priority smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
  target_driver_id uuid;
  normalized_email text := lower(trim(coalesce(target_email, '')));
  next_priority smallint;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])
  ) then
    raise exception 'Restaurant owner access is required';
  end if;

  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Введите корректный e-mail водителя';
  end if;

  select r.id
  into target_restaurant_id
  from public.restaurants r
  where r.catalog_id = target_catalog_id
  order by r.created_at
  limit 1;

  if target_restaurant_id is null then
    raise exception 'Ресторан не найден';
  end if;

  select d.id
  into target_driver_id
  from public.drivers d
  left join public.users u on u.id = d.user_id
  where lower(coalesce(d.email, u.email, '')) = normalized_email
    and d.is_active
  order by d.created_at
  limit 1;

  if target_driver_id is null then
    raise exception 'Активный водитель с таким e-mail не найден';
  end if;

  select least(32767, coalesce(max(rc.priority), 0) + 10)::smallint
  into next_priority
  from public.restaurant_couriers rc
  where rc.restaurant_id = target_restaurant_id
    and rc.is_active;

  insert into public.restaurant_couriers (
    restaurant_id,
    driver_id,
    is_active,
    is_primary,
    priority
  )
  values (
    target_restaurant_id,
    target_driver_id,
    true,
    false,
    greatest(next_priority, 10)
  )
  on conflict on constraint restaurant_couriers_restaurant_id_driver_id_key
  do update set is_active = true;

  return query
  select courier.*
  from public.get_restaurant_couriers_for_catalog(target_catalog_id) courier
  where courier.driver_id = target_driver_id;
end;
$$;

revoke all on function public.link_restaurant_courier_by_email(uuid, text) from public, anon;
grant execute on function public.link_restaurant_courier_by_email(uuid, text) to authenticated;
