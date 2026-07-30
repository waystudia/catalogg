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
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'phone', d.phone,
    'vehicle_info', d.vehicle_info,
    'car_number', d.car_number,
    'payout_details', d.payout_details,
    'debt_amount', d.debt_amount,
    'photo_url', d.photo_url,
    'service_settlements', d.service_settlements,
    'rating', d.rating,
    'status', d.status,
    'is_online', d.is_online,
    'last_lat', d.last_lat,
    'last_lng', d.last_lng,
    'last_location_at', d.last_location_at
  )
  into profile
  from public.drivers d
  where d.id = viewer_driver_id
    and d.is_active;

  if profile is null then
    raise exception 'Driver profile was not found';
  end if;

  return profile;
end;
$$;

revoke all on function public.get_current_driver_dashboard_profile() from public, anon;
grant execute on function public.get_current_driver_dashboard_profile() to authenticated;
