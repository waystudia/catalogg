revoke all on function public.accept_available_delivery(uuid, uuid) from public;
revoke all on function public.accept_available_delivery(uuid, uuid) from anon;
grant execute on function public.accept_available_delivery(uuid, uuid) to authenticated;
