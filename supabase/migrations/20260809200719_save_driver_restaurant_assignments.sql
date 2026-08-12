create or replace function public.save_driver_restaurant_assignments(
  target_driver_id uuid,
  target_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'access_denied';
  end if;

  if not exists (
    select 1 from public.drivers driver where driver.id = target_driver_id
  ) then
    raise exception 'driver_not_found';
  end if;

  if target_assignments is null or jsonb_typeof(target_assignments) <> 'array' then
    raise exception 'invalid_assignments';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_assignments) as assignment(
      restaurant_id uuid,
      is_primary boolean,
      priority integer,
      courier_type text
    )
    where assignment.restaurant_id is null
      or assignment.courier_type is null
      or assignment.courier_type not in ('staff_salaried', 'independent')
      or coalesce(assignment.priority, 10) not between 1 and 32767
  ) then
    raise exception 'invalid_restaurant_courier_assignment';
  end if;

  if exists (
    select assignment.restaurant_id
    from jsonb_to_recordset(target_assignments) as assignment(restaurant_id uuid)
    group by assignment.restaurant_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_restaurant_assignment';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_assignments) as assignment(restaurant_id uuid)
    left join public.restaurants restaurant on restaurant.id = assignment.restaurant_id
    where restaurant.id is null
  ) then
    raise exception 'restaurant_not_found';
  end if;

  update public.restaurant_couriers courier
  set is_active = false,
      is_primary = false
  where courier.driver_id = target_driver_id
    and courier.is_active;

  update public.restaurant_couriers courier
  set is_primary = false
  from jsonb_to_recordset(target_assignments) as assignment(
    restaurant_id uuid,
    is_primary boolean
  )
  where coalesce(assignment.is_primary, false)
    and courier.restaurant_id = assignment.restaurant_id
    and courier.is_active;

  insert into public.restaurant_couriers (
    restaurant_id,
    driver_id,
    is_active,
    is_primary,
    priority,
    courier_type
  )
  select
    assignment.restaurant_id,
    target_driver_id,
    true,
    coalesce(assignment.is_primary, false),
    coalesce(assignment.priority, 10)::smallint,
    assignment.courier_type
  from jsonb_to_recordset(target_assignments) as assignment(
    restaurant_id uuid,
    is_primary boolean,
    priority integer,
    courier_type text
  )
  on conflict on constraint restaurant_couriers_restaurant_id_driver_id_key
  do update set
    is_active = excluded.is_active,
    is_primary = excluded.is_primary,
    priority = excluded.priority,
    courier_type = excluded.courier_type;
end;
$$;

revoke all on function public.save_driver_restaurant_assignments(uuid, jsonb) from public, anon;
grant execute on function public.save_driver_restaurant_assignments(uuid, jsonb) to authenticated;
