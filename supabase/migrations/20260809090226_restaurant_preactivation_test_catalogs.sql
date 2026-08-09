-- Let restaurants exercise the complete public catalog and checkout before legal activation.
-- These orders are always test orders and must be removed before the account can become active.

create or replace function public.can_catalog_accept_test_orders(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients client
    where client.catalog_id = target_catalog_id
      and client.status = 'active'
      and client.legal_activation_status = any(array[
        'draft','configured','awaiting_acceptance','legacy_review_required','reacceptance_required'
      ])
  );
$$;

revoke all on function public.can_catalog_accept_test_orders(uuid) from public;
grant execute on function public.can_catalog_accept_test_orders(uuid) to anon, authenticated;

create or replace function public.can_catalog_be_public(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_catalog_accept_real_orders(target_catalog_id)
      or public.can_catalog_accept_test_orders(target_catalog_id);
$$;

revoke all on function public.can_catalog_be_public(uuid) from public;
grant execute on function public.can_catalog_be_public(uuid) to anon, authenticated;

create or replace function public.is_catalog_published(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.status = 'published'
      and public.can_catalog_be_public(catalog.id)
  );
$$;

revoke all on function public.is_catalog_published(uuid) from public;
grant execute on function public.is_catalog_published(uuid) to anon, authenticated;

drop policy if exists "catalogs public read published" on public.catalogs;
create policy "catalogs public read published" on public.catalogs
for select
using (
  (
    catalogs.status = 'published'::public.catalog_status
    and catalogs.is_template = false
    and public.can_catalog_be_public(catalogs.id)
    and (not catalogs.is_test or public.current_actor_is_test())
  )
  or catalogs.is_template = true
  or public.is_platform_admin()
  or public.is_catalog_member(catalogs.id, array['owner','admin','editor','viewer']::public.catalog_role[])
);

drop policy if exists "restaurants public read active" on public.restaurants;
create policy "restaurants public read active" on public.restaurants
for select
using (
  (
    restaurants.is_active
    and restaurants.catalog_id is not null
    and public.can_catalog_be_public(restaurants.catalog_id)
    and (not restaurants.is_test or public.current_actor_is_test())
  )
  or public.is_platform_admin()
  or (
    restaurants.catalog_id is not null
    and public.is_catalog_member(
      restaurants.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]
    )
  )
);

create or replace function public.sync_restaurant_catalog_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_publish boolean := new.status = 'active'
    and new.legal_activation_status = any(array[
      'draft','configured','awaiting_acceptance','active','legacy_review_required','reacceptance_required'
    ]);
begin
  if tg_op = 'UPDATE' then
    if old.catalog_id is distinct from new.catalog_id and old.catalog_id is not null then
      update public.catalogs
      set status = 'draft'::public.catalog_status
      where id = old.catalog_id and is_template = false;
    end if;
  end if;

  if new.catalog_id is not null then
    update public.catalogs
    set status = case
      when should_publish then 'published'::public.catalog_status
      else 'draft'::public.catalog_status
    end
    where id = new.catalog_id and is_template = false;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_restaurant_catalog_publication() from public, anon, authenticated;

drop trigger if exists clients_sync_restaurant_catalog_publication on public.clients;
create trigger clients_sync_restaurant_catalog_publication
after insert or update of status, legal_activation_status, catalog_id on public.clients
for each row execute function public.sync_restaurant_catalog_publication();

update public.catalogs catalog
set status = case
  when client.status = 'active'
    and client.legal_activation_status = any(array[
      'draft','configured','awaiting_acceptance','active','legacy_review_required','reacceptance_required'
    ])
    then 'published'::public.catalog_status
  else 'draft'::public.catalog_status
end
from public.clients client
where catalog.id = client.catalog_id
  and catalog.is_template = false;

create or replace function public.enforce_order_test_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_is_test boolean;
  catalog_accepts_test_orders boolean;
  actor_is_test boolean := public.current_actor_is_test();
  privileged boolean := public.is_platform_admin()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  select catalog.is_test into catalog_is_test
  from public.catalogs catalog
  where catalog.id = new.catalog_id;

  if catalog_is_test is null then raise exception 'catalog_not_found'; end if;
  if not privileged and catalog_is_test is distinct from actor_is_test then
    raise exception 'order_test_scope_mismatch';
  end if;

  catalog_accepts_test_orders := public.can_catalog_accept_test_orders(new.catalog_id);
  if tg_op = 'INSERT' then
    new.is_test_order := catalog_is_test or catalog_accepts_test_orders;
  else
    new.is_test_order := old.is_test_order or catalog_is_test or catalog_accepts_test_orders;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_test_scope() from public, anon, authenticated;

drop trigger if exists orders_enforce_test_scope on public.orders;
create trigger orders_enforce_test_scope
before insert or update of catalog_id, is_test_order on public.orders
for each row execute function public.enforce_order_test_scope();

create or replace function public.enforce_restaurant_order_activation_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_catalog_accept_test_orders(new.catalog_id) then
    new.is_test_order := true;
    return new;
  end if;
  if not public.can_catalog_accept_real_orders(new.catalog_id) then
    raise exception 'restaurant_activation_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_restaurant_order_activation_gate() from public, anon, authenticated;

drop trigger if exists orders_require_active_restaurant on public.orders;
create trigger orders_require_active_restaurant
before insert on public.orders
for each row execute function public.enforce_restaurant_order_activation_gate();

create or replace function public.require_no_test_orders_before_restaurant_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.legal_activation_status = 'active'
    and old.legal_activation_status is distinct from 'active'
    and exists (
      select 1
      from public.orders order_row
      where order_row.catalog_id = new.catalog_id
        and order_row.is_test_order
    ) then
    raise exception 'restaurant_test_orders_must_be_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.require_no_test_orders_before_restaurant_activation() from public, anon, authenticated;

drop trigger if exists clients_require_no_test_orders_before_activation on public.clients;
create trigger clients_require_no_test_orders_before_activation
before update of legal_activation_status on public.clients
for each row execute function public.require_no_test_orders_before_restaurant_activation();

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
    and catalog_id = target_catalog_id
    and is_test_order is true;

  return found;
end;
$$;

revoke all on function public.delete_restaurant_test_order(uuid, uuid) from public, anon, service_role;
grant execute on function public.delete_restaurant_test_order(uuid, uuid) to authenticated;
