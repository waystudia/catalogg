create or replace function public.delete_restaurant_test_order(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
    or exists (
      select 1
      from public.clients client
      where client.catalog_id = target_catalog_id
        and client.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'Restaurant access is required';
  end if;

  delete from public.orders
  where id = target_order_id
    and catalog_id = target_catalog_id;

  return found;
end;
$$;

revoke all on function public.delete_restaurant_test_order(uuid, uuid) from public, anon;
grant execute on function public.delete_restaurant_test_order(uuid, uuid) to authenticated;
