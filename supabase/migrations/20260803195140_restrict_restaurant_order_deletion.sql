-- The deletion RPC performs its own owner/admin authorization checks. Keep it
-- off the anonymous and service-role API surfaces so only signed-in restaurant
-- and platform administrators can request the operation from the application.
revoke all on function public.delete_restaurant_test_order(uuid, uuid) from public, anon, service_role;
grant execute on function public.delete_restaurant_test_order(uuid, uuid) to authenticated;
