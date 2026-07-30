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
