-- Public checkout deliberately calls this SECURITY DEFINER RPC through the
-- anonymous Data API role. Keep the public surface explicit and limited to
-- the two roles used by browser clients.
revoke execute on function public.create_public_restaurant_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text
) from public;

grant execute on function public.create_public_restaurant_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text
) to anon, authenticated;
