-- Order access is derived exclusively from server-side identities and
-- relationships. A UUID identifies an order but never authorizes access.

create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists client_account_id uuid
    references public.client_accounts(id) on delete set null;

create index if not exists orders_client_account_created_idx
  on public.orders(client_account_id, created_at desc)
  where client_account_id is not null;

create table if not exists public.order_guest_tracking_tokens (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint order_guest_tracking_tokens_expiry_check
    check (expires_at > created_at)
);

alter table public.order_guest_tracking_tokens enable row level security;
revoke all on public.order_guest_tracking_tokens from public, anon, authenticated;

alter table public.legal_consent_records
  add column if not exists order_id uuid references public.orders(id) on delete restrict,
  add column if not exists relation_id uuid;

alter table public.legal_consent_records
  drop constraint if exists legal_consent_records_subject_type_check;
alter table public.legal_consent_records
  add constraint legal_consent_records_subject_type_check
  check (subject_type in ('client', 'guest', 'restaurant_representative', 'driver'));

create index if not exists legal_consent_records_order_idx
  on public.legal_consent_records(order_id, document_code, created_at desc)
  where order_id is not null;

create unique index if not exists legal_consent_records_order_grant_unique
  on public.legal_consent_records(order_id, subject_type, document_code, document_version, document_sha256)
  where order_id is not null and granted and revoked_at is null;

drop trigger if exists legal_consent_records_append_only on public.legal_consent_records;
create trigger legal_consent_records_append_only
before update or delete on public.legal_consent_records
for each row execute function public.prevent_legal_acceptance_mutation();

create or replace function public.resolve_order_client_account(
  client_session_token text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account.id
  from public.client_accounts account
  where (
    account.auth_user_id = (select auth.uid())
    or (
      nullif(client_session_token, '') is not null
      and exists (
        select 1
        from public.client_account_sessions session
        where session.account_id = account.id
          and session.token_hash = extensions.digest(
            pg_catalog.convert_to(client_session_token, 'UTF8'),
            'sha256'
          )
          and session.expires_at > pg_catalog.now()
      )
    )
  )
  order by (account.auth_user_id = (select auth.uid())) desc
  limit 1
$$;

revoke all on function public.resolve_order_client_account(text)
  from public, anon, authenticated;

create or replace function public.finish_secure_client_order(
  created_order_id uuid,
  target_catalog_id uuid,
  client_session_token text,
  target_general_consent_confirmed boolean,
  target_user_agreement_version text,
  target_user_agreement_sha256 text,
  target_client_consent_version text,
  target_client_consent_sha256 text,
  target_order_transfer_confirmed boolean,
  target_order_transfer_version text,
  target_order_transfer_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
  guest_token text;
  is_business_actor boolean;
  request_headers jsonb := coalesce(
    pg_catalog.current_setting('request.headers', true),
    '{}'
  )::jsonb;
begin
  if target_user_agreement_version <> '3.0'
     or pg_catalog.lower(coalesce(target_user_agreement_sha256, '')) <> '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'
     or target_client_consent_version <> '3.0'
     or pg_catalog.lower(coalesce(target_client_consent_sha256, '')) <> 'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e'
     or target_order_transfer_version <> '3.0'
     or pg_catalog.lower(coalesce(target_order_transfer_sha256, '')) <> 'b8526c815a6919a1b5df1f7bd7d7182de46fe9ff0d245026fd5262828f8645e7' then
    raise exception 'legal_document_version_invalid';
  end if;

  if not exists (
    select 1 from public.orders target_order
    where target_order.id = created_order_id
      and target_order.catalog_id = target_catalog_id
  ) then
    raise exception 'order_not_found';
  end if;

  is_business_actor := (select auth.uid()) is not null and (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
    or exists (
      select 1 from public.clients business
      where business.catalog_id = target_catalog_id
        and business.owner_user_id = (select auth.uid())
    )
  );

  if is_business_actor then
    return pg_catalog.jsonb_build_object('order_id', created_order_id);
  end if;

  if target_order_transfer_confirmed is distinct from true
     or coalesce(target_order_transfer_version, '') = ''
     or coalesce(target_order_transfer_sha256, '') !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'order_transfer_consent_required';
  end if;

  account_id := public.resolve_order_client_account(client_session_token);

  if account_id is not null then
    if not (
      exists (
        select 1 from public.legal_consent_records consent
        where consent.subject_type = 'client'
          and consent.subject_id = account_id
          and consent.document_code = 'user_agreement'
          and consent.document_version = target_user_agreement_version
          and consent.document_sha256 = pg_catalog.lower(target_user_agreement_sha256)
          and consent.granted and consent.revoked_at is null
      )
      and exists (
        select 1 from public.legal_consent_records consent
        where consent.subject_type = 'client'
          and consent.subject_id = account_id
          and consent.document_code = 'client_consent'
          and consent.document_version = target_client_consent_version
          and consent.document_sha256 = pg_catalog.lower(target_client_consent_sha256)
          and consent.granted and consent.revoked_at is null
      )
    ) then
      if target_general_consent_confirmed is distinct from true
         or coalesce(target_user_agreement_sha256, '') !~ '^[0-9a-fA-F]{64}$'
         or coalesce(target_client_consent_sha256, '') !~ '^[0-9a-fA-F]{64}$' then
        raise exception 'current_client_legal_acceptance_required';
      end if;

      insert into public.legal_consent_records(
        subject_type, subject_id, auth_user_id, document_code,
        document_version, document_sha256, granted, source, granted_at,
        order_id, evidence
      ) values
      (
        'client', account_id, (select auth.uid()), 'user_agreement',
        target_user_agreement_version, pg_catalog.lower(target_user_agreement_sha256),
        true, 'checkout_current_version', pg_catalog.clock_timestamp(),
        created_order_id,
        pg_catalog.jsonb_build_object(
          'captured_by', 'secure_order_rpc',
          'context', 'checkout',
          'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
          'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
        )
      ),
      (
        'client', account_id, (select auth.uid()), 'client_consent',
        target_client_consent_version, pg_catalog.lower(target_client_consent_sha256),
        true, 'checkout_current_version', pg_catalog.clock_timestamp(),
        created_order_id,
        pg_catalog.jsonb_build_object(
          'captured_by', 'secure_order_rpc',
          'context', 'checkout',
          'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
          'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
        )
      )
      on conflict do nothing;
    end if;

    update public.orders
    set client_account_id = account_id
    where id = created_order_id
      and client_account_id is null;

    insert into public.legal_consent_records(
      subject_type, subject_id, auth_user_id, document_code,
      document_version, document_sha256, granted, source, granted_at,
      order_id, evidence
    ) values (
      'client', account_id, (select auth.uid()), 'order_transfer_consent',
      target_order_transfer_version, pg_catalog.lower(target_order_transfer_sha256),
      true, 'order_checkout', pg_catalog.clock_timestamp(), created_order_id,
      pg_catalog.jsonb_build_object(
        'captured_by', 'secure_order_rpc',
        'context', 'specific_order_transfer',
        'catalog_id', target_catalog_id,
        'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
        'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
      )
    ) on conflict do nothing;

    return pg_catalog.jsonb_build_object('order_id', created_order_id);
  end if;

  if target_general_consent_confirmed is distinct from true
     or coalesce(target_user_agreement_sha256, '') !~ '^[0-9a-fA-F]{64}$'
     or coalesce(target_client_consent_sha256, '') !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'guest_legal_acceptance_required';
  end if;

  insert into public.legal_consent_records(
    subject_type, subject_id, document_code, document_version,
    document_sha256, granted, source, granted_at, order_id, evidence
  ) values
  ('guest', created_order_id, 'user_agreement', target_user_agreement_version,
   pg_catalog.lower(target_user_agreement_sha256), true, 'guest_order_checkout',
   pg_catalog.clock_timestamp(), created_order_id,
   pg_catalog.jsonb_build_object('captured_by', 'secure_order_rpc', 'context', 'guest_checkout')),
  ('guest', created_order_id, 'client_consent', target_client_consent_version,
   pg_catalog.lower(target_client_consent_sha256), true, 'guest_order_checkout',
   pg_catalog.clock_timestamp(), created_order_id,
   pg_catalog.jsonb_build_object('captured_by', 'secure_order_rpc', 'context', 'guest_checkout')),
  ('guest', created_order_id, 'order_transfer_consent', target_order_transfer_version,
   pg_catalog.lower(target_order_transfer_sha256), true, 'guest_order_checkout',
   pg_catalog.clock_timestamp(), created_order_id,
   pg_catalog.jsonb_build_object('captured_by', 'secure_order_rpc', 'context', 'specific_order_transfer', 'catalog_id', target_catalog_id))
  on conflict do nothing;

  guest_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.order_guest_tracking_tokens(order_id, token_hash, expires_at, revoked_at)
  values (
    created_order_id,
    extensions.digest(pg_catalog.convert_to(guest_token, 'UTF8'), 'sha256'),
    pg_catalog.now() + interval '30 days',
    null
  )
  on conflict (order_id) do update
  set token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      revoked_at = null;

  return pg_catalog.jsonb_build_object(
    'order_id', created_order_id,
    'guest_tracking_token', guest_token
  );
end;
$$;

revoke all on function public.finish_secure_client_order(
  uuid, uuid, text, boolean, text, text, text, text, boolean, text, text
) from public, anon, authenticated;

create or replace function public.create_secure_client_platform_order(
  target_catalog_id uuid,
  customer_name text,
  customer_phone text,
  fulfillment_type text,
  cabin_label text,
  delivery_address text,
  delivery_city text,
  delivery_settlement text,
  client_address_comment text,
  comment text,
  items jsonb,
  idempotency_key text,
  payment_method text,
  client_session_token text,
  target_general_consent_confirmed boolean,
  target_user_agreement_version text,
  target_user_agreement_sha256 text,
  target_client_consent_version text,
  target_client_consent_sha256 text,
  target_order_transfer_confirmed boolean,
  target_order_transfer_version text,
  target_order_transfer_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_id uuid;
  use_catalog_order boolean;
  use_legacy_order boolean;
begin
  use_catalog_order := exists (
    select 1 from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.business_type = 'grocery'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(items, '[]'::jsonb)) item
    where item ? 'requested_quantity'
  );

  use_legacy_order := not use_catalog_order and exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(items, '[]'::jsonb)) item
    where coalesce(item ->> 'product_id', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

  if use_catalog_order then
    created_order_id := public.create_client_platform_catalog_order(
      target_catalog_id, customer_name, customer_phone, fulfillment_type,
      cabin_label, delivery_address, delivery_city, delivery_settlement,
      client_address_comment, comment, items, idempotency_key, payment_method
    );
  elsif use_legacy_order then
    created_order_id := public.create_client_platform_legacy_restaurant_order(
      target_catalog_id, customer_name, customer_phone, fulfillment_type,
      cabin_label, delivery_address, delivery_city, delivery_settlement,
      client_address_comment, comment, items, idempotency_key, payment_method
    );
  else
    created_order_id := public.create_client_platform_restaurant_order(
      target_catalog_id, customer_name, customer_phone, fulfillment_type,
      cabin_label, delivery_address, delivery_city, delivery_settlement,
      client_address_comment, comment, items, idempotency_key, payment_method
    );
  end if;

  return public.finish_secure_client_order(
    created_order_id,
    target_catalog_id,
    client_session_token,
    target_general_consent_confirmed,
    target_user_agreement_version,
    target_user_agreement_sha256,
    target_client_consent_version,
    target_client_consent_sha256,
    target_order_transfer_confirmed,
    target_order_transfer_version,
    target_order_transfer_sha256
  );
end;
$$;

revoke all on function public.create_secure_client_platform_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, boolean, text, text, text, text, boolean, text, text
) from public;
grant execute on function public.create_secure_client_platform_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb,
  text, text, text, boolean, text, text, text, text, boolean, text, text
) to anon, authenticated;

-- Retire every UUID-only creation/status path used by the browser. The old
-- creation functions remain callable only inside the secure definer above.
revoke all on function public.create_client_platform_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text
) from public, anon, authenticated;
revoke all on function public.create_client_platform_legacy_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text
) from public, anon, authenticated;
revoke all on function public.create_client_platform_catalog_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text
) from public, anon, authenticated;

revoke all on function public.create_public_order(uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.create_public_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb,text
) from public, anon, authenticated;
revoke all on function public.create_public_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
revoke all on function public.create_public_restaurant_order(
  uuid,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
revoke all on function public.create_legacy_public_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb,text
) from public, anon, authenticated;
revoke all on function public.create_legacy_public_restaurant_order(
  uuid,text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_created_client_platform_order(uuid,text)
  from public, anon, authenticated;

revoke all on function public.get_public_restaurant_order_status(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_order_tracking(uuid)
  from public, anon, authenticated;

do $$
begin
  if pg_catalog.to_regprocedure('public.get_restaurant_order_id_for_delivery(uuid)') is not null then
    execute 'revoke all on function public.get_restaurant_order_id_for_delivery(uuid) from public, anon, authenticated';
  end if;
end
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.accept_available_delivery(uuid)',
    'public.accept_available_delivery(uuid,uuid)',
    'public.assign_restaurant_delivery_driver(uuid,uuid,uuid)',
    'public.request_delivery_price(uuid,uuid,numeric,text)',
    'public.review_delivery_price_request(uuid,boolean,numeric)',
    'public.update_current_driver_delivery_status(uuid,text)',
    'public.update_restaurant_order_status(uuid,uuid,text,text)'
  ] loop
    if pg_catalog.to_regprocedure(signature) is not null then
      execute pg_catalog.format('revoke all on function %s from public, anon', signature);
      execute pg_catalog.format('grant execute on function %s to authenticated', signature);
    end if;
  end loop;
end
$$;

create or replace function public.get_order_participant_status(
  target_order_id uuid,
  client_session_token text default null,
  guest_tracking_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_delivery public.deliveries%rowtype;
  target_driver public.drivers%rowtype;
  viewer_client_account_id uuid;
  viewer_driver_id uuid;
  access_role text;
  order_is_terminal boolean;
  delivery_is_terminal boolean;
  live_tracking_allowed boolean;
  can_see_full_order boolean;
  can_see_client_data boolean;
  can_see_driver_contact boolean;
  result jsonb;
begin
  select * into target_order
  from public.orders order_row
  where order_row.id = target_order_id;
  if target_order.id is null then return null; end if;

  select * into target_delivery
  from public.deliveries delivery
  where delivery.order_id = target_order.id
  limit 1;

  if target_delivery.driver_id is not null then
    select * into target_driver
    from public.drivers driver
    where driver.id = target_delivery.driver_id;
  end if;

  viewer_client_account_id := public.resolve_order_client_account(client_session_token);
  viewer_driver_id := case
    when (select auth.uid()) is null then null
    else public.current_driver_id()
  end;

  if (select auth.uid()) is not null and public.is_platform_admin() then
    access_role := 'platform_admin';
  elsif (select auth.uid()) is not null and (
    public.is_catalog_member(
      target_order.catalog_id,
      array['owner','admin','editor','viewer']::public.catalog_role[]
    )
    or exists (
      select 1 from public.clients business
      where business.catalog_id = target_order.catalog_id
        and business.owner_user_id = (select auth.uid())
    )
  ) then
    access_role := 'business';
  elsif viewer_driver_id is not null
        and target_delivery.driver_id = viewer_driver_id then
    access_role := 'driver';
  elsif viewer_client_account_id is not null
        and target_order.client_account_id = viewer_client_account_id then
    access_role := 'client';
  elsif (select auth.uid()) is not null and target_order.client_id is not null
        and exists (
          select 1 from public.users platform_user
          where platform_user.id = target_order.client_id
            and platform_user.auth_user_id = (select auth.uid())
        ) then
    access_role := 'client';
  elsif nullif(guest_tracking_token, '') is not null and exists (
    select 1 from public.order_guest_tracking_tokens token
    where token.order_id = target_order.id
      and token.token_hash = extensions.digest(
        pg_catalog.convert_to(guest_tracking_token, 'UTF8'),
        'sha256'
      )
      and token.expires_at > pg_catalog.now()
      and token.revoked_at is null
  ) then
    access_role := 'guest';
  else
    return null;
  end if;

  order_is_terminal := target_order.status::text in (
    'delivered', 'completed', 'cancelled', 'canceled'
  );
  delivery_is_terminal := coalesce(target_delivery.status, '') in (
    'delivered', 'failed', 'cancelled', 'canceled'
  );
  live_tracking_allowed := not order_is_terminal
    and not delivery_is_terminal
    and target_delivery.driver_id is not null
    and access_role in ('client', 'business', 'driver', 'platform_admin', 'guest');
  can_see_full_order := access_role in ('client', 'business', 'platform_admin')
    or (access_role = 'driver' and not order_is_terminal and not delivery_is_terminal);
  can_see_client_data := access_role in ('business', 'platform_admin')
    or (access_role = 'client')
    or (access_role = 'driver' and not order_is_terminal and not delivery_is_terminal);
  can_see_driver_contact := access_role in ('client', 'business', 'platform_admin')
    or (access_role = 'driver' and not order_is_terminal and not delivery_is_terminal);

  select pg_catalog.jsonb_build_object(
    'access_role', access_role,
    'id', target_order.id,
    'catalog_id', target_order.catalog_id,
    'customer_name', case when can_see_client_data then coalesce(nullif(target_order.client_name, ''), target_order.customer_name, '') else '' end,
    'customer_phone', case when can_see_client_data then coalesce(nullif(target_order.client_phone, ''), target_order.customer_phone, '') else '' end,
    'fulfillment_type', target_order.fulfillment_type,
    'delivery_address', case when can_see_client_data then coalesce(target_order.delivery_address, '') else '' end,
    'delivery_lat', case when can_see_client_data then target_order.delivery_lat else null end,
    'delivery_lng', case when can_see_client_data then target_order.delivery_lng else null end,
    'client_accuracy_m', case when can_see_client_data then target_order.client_accuracy_m else null end,
    'client_address_comment', case when can_see_client_data then coalesce(target_order.client_address_comment, '') else '' end,
    'comment', case when can_see_client_data then coalesce(target_order.comment, '') else '' end,
    'restaurant_name', coalesce(nullif(restaurant.name, ''), catalog.name, ''),
    'restaurant_address', coalesce(nullif(target_order.restaurant_address_snapshot, ''), restaurant.address_line, catalog.address, ''),
    'restaurant_phone', coalesce(legal_profile.restaurant_phone, catalog.whatsapp, ''),
    'restaurant_lat', coalesce(target_order.restaurant_lat_snapshot, restaurant.lat),
    'restaurant_lng', coalesce(target_order.restaurant_lng_snapshot, restaurant.lng),
    'status', target_order.status,
    'payment_status', coalesce(target_order.payment_status, 'unpaid'),
    'delivery_status', target_delivery.status,
    'estimated_delivery_minutes', case when live_tracking_allowed then target_delivery.estimated_time_max else null end,
    'driver_name', case when target_delivery.driver_id is not null then coalesce(target_driver.name, '') else '' end,
    'driver_phone', case when can_see_driver_contact then coalesce(target_driver.phone, '') else '' end,
    'driver_vehicle_info', case when can_see_driver_contact then coalesce(target_driver.vehicle_info, '') else '' end,
    'driver_car_number', case when can_see_driver_contact then coalesce(target_driver.car_number, '') else '' end,
    'driver_lat', case when live_tracking_allowed then target_driver.last_lat else null end,
    'driver_lng', case when live_tracking_allowed then target_driver.last_lng else null end,
    'driver_location_at', case when live_tracking_allowed then target_driver.last_location_at else null end,
    'live_tracking', live_tracking_allowed,
    'subtotal', case when can_see_full_order then coalesce(target_order.subtotal, 0) else null end,
    'delivery_fee', case when can_see_full_order then coalesce(target_order.delivery_fee, 0) else null end,
    'total', case when can_see_full_order then coalesce(target_order.total, 0) else null end,
    'created_at', target_order.created_at,
    'accepted_at', target_order.accepted_at,
    'ready_at', target_order.ready_at,
    'completed_at', target_order.completed_at,
    'items', case when can_see_full_order then coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'title', item.title,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'line_total', item.line_total
        ) order by item.id
      )
      from public.order_items item
      where item.order_id = target_order.id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into result
  from public.catalogs catalog
  left join lateral (
    select restaurant_row.*
    from public.restaurants restaurant_row
    where restaurant_row.id = target_order.restaurant_id
       or restaurant_row.catalog_id = target_order.catalog_id
    order by (restaurant_row.id = target_order.restaurant_id) desc
    limit 1
  ) restaurant on true
  left join public.clients business on business.catalog_id = target_order.catalog_id
  left join public.restaurant_legal_profiles legal_profile on legal_profile.client_id = business.id
  where catalog.id = target_order.catalog_id;

  return result;
end;
$$;

revoke all on function public.get_order_participant_status(uuid, text, text)
  from public;
grant execute on function public.get_order_participant_status(uuid, text, text)
  to anon, authenticated;

create or replace function public.get_current_client_legal_state(
  client_session_token text,
  target_user_agreement_version text,
  target_user_agreement_sha256 text,
  target_client_consent_version text,
  target_client_consent_sha256 text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select public.resolve_order_client_account(client_session_token) as account_id
  )
  select pg_catalog.jsonb_build_object(
    'registered', viewer.account_id is not null,
    'user_agreement_current', viewer.account_id is not null and exists (
      select 1 from public.legal_consent_records record
      where record.subject_type = 'client'
        and record.subject_id = viewer.account_id
        and record.document_code = 'user_agreement'
        and record.document_version = '3.0'
        and record.document_sha256 = '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'
        and record.granted and record.revoked_at is null
    ),
    'client_consent_current', viewer.account_id is not null and exists (
      select 1 from public.legal_consent_records record
      where record.subject_type = 'client'
        and record.subject_id = viewer.account_id
        and record.document_code = 'client_consent'
        and record.document_version = '3.0'
        and record.document_sha256 = 'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e'
        and record.granted and record.revoked_at is null
    )
  )
  from viewer
$$;

revoke all on function public.get_current_client_legal_state(text,text,text,text,text)
  from public;
grant execute on function public.get_current_client_legal_state(text,text,text,text,text)
  to anon, authenticated;

create or replace function public.register_client_account_with_legal(
  client_name text,
  client_phone text,
  client_password text,
  accepted_user_agreement boolean,
  user_agreement_version text,
  user_agreement_sha256 text,
  accepted_client_consent boolean,
  client_consent_version text,
  client_consent_sha256 text,
  accepted_advertising boolean,
  advertising_version text,
  advertising_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration jsonb;
  account_id uuid;
  request_headers jsonb := coalesce(
    pg_catalog.current_setting('request.headers', true), '{}'
  )::jsonb;
begin
  if accepted_user_agreement is distinct from true
     or accepted_client_consent is distinct from true then
    raise exception 'required_client_legal_acceptance_missing';
  end if;
  if user_agreement_version <> '3.0'
     or pg_catalog.lower(coalesce(user_agreement_sha256, '')) <> '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'
     or client_consent_version <> '3.0'
     or pg_catalog.lower(coalesce(client_consent_sha256, '')) <> 'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e'
     or advertising_version <> '3.0'
     or pg_catalog.lower(coalesce(advertising_sha256, '')) <> '749116fa765a5cc8d040d4157ccfa0e52cdedf8cb9680cd7b6cae4266a80bd97' then
    raise exception 'legal_document_version_invalid';
  end if;

  registration := public.register_client_account(client_name, client_phone, client_password);
  account_id := (registration ->> 'account_id')::uuid;

  insert into public.legal_consent_records(
    subject_type, subject_id, auth_user_id, document_code, document_version,
    document_sha256, granted, source, granted_at, revoked_at, evidence
  ) values
  (
    'client', account_id, (select auth.uid()), 'user_agreement',
    user_agreement_version, pg_catalog.lower(user_agreement_sha256), true,
    'client_registration', pg_catalog.clock_timestamp(), null,
    pg_catalog.jsonb_build_object('captured_by', 'registration_rpc', 'context', 'registration', 'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000))
  ),
  (
    'client', account_id, (select auth.uid()), 'client_consent',
    client_consent_version, pg_catalog.lower(client_consent_sha256), true,
    'client_registration', pg_catalog.clock_timestamp(), null,
    pg_catalog.jsonb_build_object('captured_by', 'registration_rpc', 'context', 'registration', 'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000))
  ),
  (
    'client', account_id, (select auth.uid()), 'advertising_consent',
    advertising_version, pg_catalog.lower(advertising_sha256), accepted_advertising,
    'client_registration', case when accepted_advertising then pg_catalog.clock_timestamp() end,
    case when accepted_advertising then null else pg_catalog.clock_timestamp() end,
    pg_catalog.jsonb_build_object('captured_by', 'registration_rpc', 'context', 'registration', 'optional', true, 'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000))
  );

  return registration;
end;
$$;

revoke all on function public.register_client_account_with_legal(
  text,text,text,boolean,text,text,boolean,text,text,boolean,text,text
) from public;
grant execute on function public.register_client_account_with_legal(
  text,text,text,boolean,text,text,boolean,text,text,boolean,text,text
) to anon, authenticated;
revoke all on function public.register_client_account(text,text,text)
  from public, anon, authenticated;

drop policy if exists "orders client owner read" on public.orders;
create policy "orders client owner read" on public.orders
for select using (
  exists (
    select 1 from public.client_accounts account
    where account.id = orders.client_account_id
      and account.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.users platform_user
    where platform_user.id = orders.client_id
      and platform_user.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "order items client owner read" on public.order_items;
create policy "order items client owner read" on public.order_items
for select using (
  exists (
    select 1 from public.orders owned_order
    left join public.client_accounts account on account.id = owned_order.client_account_id
    left join public.users platform_user on platform_user.id = owned_order.client_id
    where owned_order.id = order_items.order_id
      and (
        account.auth_user_id = (select auth.uid())
        or platform_user.auth_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "deliveries client owner read" on public.deliveries;
create policy "deliveries client owner read" on public.deliveries
for select using (
  exists (
    select 1 from public.orders owned_order
    left join public.client_accounts account on account.id = owned_order.client_account_id
    left join public.users platform_user on platform_user.id = owned_order.client_id
    where owned_order.id = deliveries.order_id
      and (
        account.auth_user_id = (select auth.uid())
        or platform_user.auth_user_id = (select auth.uid())
      )
  )
);

-- Available delivery offers contain only dispatch facts and pickup business
-- information. Client/order details appear only after the server records the
-- actual driver assignment and disappear from the working feed at terminal
-- status.
create or replace function public.get_driver_delivery_offers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(scoped.offer), '[]'::jsonb)
  from (
    select
      secured.secured_offer || pg_catalog.jsonb_build_object(
        'catalog_id', case when secured.assigned_access then order_row.catalog_id else null end,
        'is_test_order', case when secured.assigned_access then order_row.is_test_order else false end,
        'client_delivery_fee', case when secured.assigned_access then greatest(coalesce(order_row.delivery_fee, 0), 0) else null end,
        'restaurant_funds_delivery', case when secured.assigned_access then
          greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
          and greatest(coalesce(delivery.offered_fee, 0), 0) > 0
          else false end,
        'restaurant_delivery_payout_amount', case
          when secured.assigned_access and greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
            then greatest(coalesce(delivery.offered_fee, 0), 0)
          else 0
        end,
        'driver_restaurant_order_payment_confirmed_at', case when secured.assigned_access then delivery.driver_restaurant_order_payment_confirmed_at else null end,
        'driver_restaurant_order_payment_amount', case when secured.assigned_access then delivery.driver_restaurant_order_payment_amount else null end,
        'driver_restaurant_delivery_payout_received_at', case when secured.assigned_access then delivery.driver_restaurant_delivery_payout_received_at else null end,
        'driver_restaurant_delivery_payout_received_amount', case when secured.assigned_access then delivery.driver_restaurant_delivery_payout_received_amount else null end,
        'order_group_id', case when secured.assigned_access then delivery.order_group_id else null end,
        'is_combined', secured.assigned_access and delivery.order_group_id is not null and exists (
          select 1 from public.orders grouped_order
          where grouped_order.order_group_id = delivery.order_group_id
            and grouped_order.is_addon
            and grouped_order.status::text not in ('cancelled', 'canceled')
        ),
        'delivery_stops', case when secured.assigned_access then coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', delivery_stop.id,
              'delivery_id', delivery_stop.delivery_id,
              'merchant_order_id', delivery_stop.merchant_order_id,
              'stop_type', delivery_stop.stop_type,
              'sequence', delivery_stop.sequence,
              'status', delivery_stop.status,
              'latitude', delivery_stop.latitude,
              'longitude', delivery_stop.longitude,
              'address', delivery_stop.address,
              'estimated_arrival_at', delivery_stop.estimated_arrival_at,
              'merchant_name', case when delivery_stop.stop_type = 'dropoff' then 'Клиент' else coalesce(nullif(stop_catalog.name, ''), 'Точка выдачи') end,
              'merchant_type', coalesce(stop_catalog.business_type, 'restaurant'),
              'merchant_order_status', stop_order.status,
              'estimated_ready_at', stop_order.estimated_ready_at,
              'is_primary', delivery_stop.merchant_order_id = delivery.order_id
            ) order by delivery_stop.sequence
          )
          from public.delivery_stops delivery_stop
          left join public.orders stop_order on stop_order.id = delivery_stop.merchant_order_id
          left join public.catalogs stop_catalog on stop_catalog.id = stop_order.catalog_id
          where delivery_stop.delivery_id = delivery.id
        ), '[]'::jsonb) else '[]'::jsonb end
      ) as offer
    from pg_catalog.jsonb_array_elements(public.get_driver_delivery_offers_unscoped()) raw(offer)
    join public.deliveries delivery on delivery.id = (raw.offer ->> 'id')::uuid
    join public.orders order_row on order_row.id = delivery.order_id
    join public.drivers viewer_driver on viewer_driver.id = public.current_driver_id()
    cross join lateral (
      select
        delivery.driver_id = viewer_driver.id
          and delivery.status not in ('delivered','failed','cancelled','canceled')
          and order_row.status::text not in ('delivered','completed','cancelled','canceled') as assigned_access
    ) access
    cross join lateral (
      select case when access.assigned_access then raw.offer else
        raw.offer || pg_catalog.jsonb_build_object(
          'route_to_client_url', null,
          'pickup_qr_token', null,
          'pickup_qr_expires_at', null,
          'orders', coalesce(raw.offer -> 'orders', '{}'::jsonb) || pg_catalog.jsonb_build_object(
            'client_name', '', 'client_phone', '',
            'customer_name', '', 'customer_phone', '',
            'delivery_address', '', 'delivery_city', '', 'delivery_settlement', '',
            'delivery_lat', null, 'delivery_lng', null,
            'delivery_comment', null, 'delivery_comment_snapshot', null,
            'client_address_comment', null, 'comment', null,
            'delivery_fee', null, 'total', null, 'total_amount', null,
            'order_items', '[]'::jsonb
          )
        ) end as secured_offer,
        access.assigned_access
    ) secured
    where coalesce(order_row.is_test_order, false) = coalesce(viewer_driver.is_test, false)
    order by case when secured.assigned_access then 0 else 1 end, raw.offer ->> 'created_at' desc
  ) scoped;
$$;

revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;

-- Business offer and representative consent are distinct documents and
-- distinct immutable evidence records. Existing active partners are not
-- deactivated; the rule applies at their next acceptance request.
alter table public.legal_documents
  drop constraint if exists legal_documents_document_type_check;
alter table public.legal_documents
  add constraint legal_documents_document_type_check check (document_type in (
    'restaurant_contract', 'restaurant_consent', 'tariff',
    'restaurant_regulation', 'order_rules', 'privacy_policy', 'cookie_policy',
    'cabinet_terms', 'content_license', 'delivery_rules', 'marketing_consent'
  ));

insert into public.legal_documents(
  document_type, title, version, content_html, pdf_url, file_name,
  file_hash, file_size, mime_type, status, published_at, effective_from,
  requires_reacceptance
)
values
(
  'restaurant_consent',
  'Согласие представителя бизнес-партнёра на обработку персональных данных',
  '3.0',
  '',
  '/legal/05-restaurant-consent.html',
  '05-restaurant-consent.html',
  'e811cadaf55734e20135ef28f3975d15a109dbb0d0a2929ad0a1320b0f70a8fd',
  null,
  'text/html',
  'published',
  pg_catalog.now(),
  '2026-08-18 00:00:00+03'::timestamptz,
  false
),
(
  'privacy_policy',
  'Политика обработки персональных данных',
  '3.0',
  '',
  '/legal/01-personal-data-policy.html',
  '01-personal-data-policy.html',
  'f4af642654e6cdcd48205e35d1e8506a5552b34c2ea18a25f250fc79238288f8',
  null,
  'text/html',
  'published',
  pg_catalog.now(),
  '2026-08-18 00:00:00+03'::timestamptz,
  false
)
on conflict (document_type, version) do update
set title = excluded.title,
    pdf_url = excluded.pdf_url,
    file_name = excluded.file_name,
    file_hash = excluded.file_hash,
    mime_type = excluded.mime_type,
    status = excluded.status,
    published_at = coalesce(public.legal_documents.published_at, excluded.published_at),
    effective_from = excluded.effective_from;

insert into public.legal_document_bundles(
  version, title, status, effective_from, requires_reacceptance, published_at
)
values (
  '3.1', 'Подключение бизнес-партнёра 3.1', 'published',
  '2026-08-18 00:00:00+03'::timestamptz, false, pg_catalog.now()
)
on conflict (version) do update
set title = excluded.title,
    status = excluded.status,
    effective_from = excluded.effective_from,
    requires_reacceptance = excluded.requires_reacceptance,
    published_at = coalesce(public.legal_document_bundles.published_at, excluded.published_at);

insert into public.legal_document_bundle_items(bundle_id, document_id, sort_order, required)
select bundle.id, document.id, item.sort_order, true
from public.legal_document_bundles bundle
join (
  values
    ('restaurant_contract'::text, '3.0'::text, 10),
    ('privacy_policy'::text, '3.0'::text, 20),
    ('restaurant_consent'::text, '3.0'::text, 30)
) item(document_type, version, sort_order) on true
join public.legal_documents document
  on document.document_type = item.document_type
 and document.version = item.version
where bundle.version = '3.1'
on conflict (bundle_id, document_id) do update
set sort_order = excluded.sort_order,
    required = true;

create or replace function public.current_published_legal_bundle_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bundle.id
  from public.legal_document_bundles bundle
  where bundle.status = 'published'
    and coalesce(bundle.effective_from, '-infinity'::timestamptz) <= pg_catalog.now()
    and coalesce(bundle.effective_to, 'infinity'::timestamptz) > pg_catalog.now()
    and not exists (
      select 1
      from pg_catalog.unnest(array['restaurant_contract','privacy_policy','restaurant_consent']) required_type
      where not exists (
        select 1
        from public.legal_document_bundle_items item
        join public.legal_documents document on document.id = item.document_id
        where item.bundle_id = bundle.id
          and item.required
          and document.document_type = required_type
          and document.status = 'published'
      )
    )
  order by bundle.effective_from desc nulls last, bundle.created_at desc
  limit 1
$$;

revoke all on function public.current_published_legal_bundle_id()
  from public, anon, authenticated;

create or replace function public.require_separate_restaurant_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((new.checkboxes_json ->> 'contract')::boolean, false) is not true
     or coalesce((new.checkboxes_json ->> 'representative_consent')::boolean, false) is not true then
    raise exception 'separate_restaurant_legal_confirmations_required';
  end if;
  return new;
end;
$$;

revoke all on function public.require_separate_restaurant_consent()
  from public, anon, authenticated;

drop trigger if exists restaurant_activation_separate_consent
  on public.restaurant_activation_requests;
create trigger restaurant_activation_separate_consent
before insert or update of checkboxes_json on public.restaurant_activation_requests
for each row execute function public.require_separate_restaurant_consent();

create or replace function public.record_restaurant_acceptance_consents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.legal_consent_records(
    subject_type, subject_id, relation_id, auth_user_id, document_code,
    document_version, document_sha256, granted, source, granted_at, evidence
  )
  select
    'restaurant_representative',
    new.catalog_id,
    new.restaurant_id,
    new.user_id,
    case document.document_type
      when 'restaurant_contract' then 'restaurant_offer'
      else 'restaurant_consent'
    end,
    document.version,
    document.file_hash,
    true,
    'restaurant_activation',
    new.accepted_at,
    pg_catalog.jsonb_build_object(
      'captured_by', 'restaurant_activation_code',
      'legal_acceptance_id', new.id,
      'activation_request_id', new.activation_request_id,
      'confirmation_method', new.confirmation_method,
      'session_id', new.session_id,
      'ip_address', new.ip_address,
      'user_agent', new.user_agent
    )
  from public.legal_document_bundle_items item
  join public.legal_documents document on document.id = item.document_id
  where item.bundle_id = new.document_bundle_id
    and document.document_type in ('restaurant_contract', 'restaurant_consent');
  return new;
end;
$$;

revoke all on function public.record_restaurant_acceptance_consents()
  from public, anon, authenticated;

drop trigger if exists legal_acceptances_record_separate_consents
  on public.legal_acceptances;
create trigger legal_acceptances_record_separate_consents
after insert on public.legal_acceptances
for each row execute function public.record_restaurant_acceptance_consents();

create or replace function public.activate_current_driver(target_confirmations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_driver public.drivers%rowtype;
  accepted_at timestamptz := pg_catalog.now();
  request_headers jsonb := coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  consent_evidence jsonb;
begin
  if viewer_driver_id is null then raise exception 'driver_authentication_required'; end if;
  if coalesce(target_confirmations ->> 'offer', '') <> 'true'
    or coalesce(target_confirmations ->> 'personal_data', '') <> 'true'
    or coalesce(target_confirmations ->> 'location', '') <> 'true'
  then
    raise exception 'driver_activation_confirmations_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer_driver_id::text, 0));
  select * into target_driver from public.drivers where id = viewer_driver_id for update;
  if not found then raise exception 'driver_not_found'; end if;

  if target_driver.legal_activation_status = 'active' then
    return pg_catalog.jsonb_build_object(
      'driver_id', target_driver.id,
      'status', target_driver.legal_activation_status,
      'activated_at', target_driver.legal_activated_at
    );
  end if;

  consent_evidence := pg_catalog.jsonb_build_object(
    'captured_by', 'authenticated_driver_activation',
    'confirmations', target_confirmations,
    'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 512)
  );

  insert into public.legal_consent_records(
    subject_type, subject_id, auth_user_id, document_code, document_version,
    document_sha256, granted, source, granted_at, evidence
  ) values
  (
    'driver', viewer_driver_id, (select auth.uid()), 'driver_offer', '3.0',
    'b64b00570e8c52cafa76b531f97637d121d8db22770d6e01261139906a104e2f',
    true, 'driver_activation', accepted_at, consent_evidence
  ),
  (
    'driver', viewer_driver_id, (select auth.uid()), 'driver_consent', '3.0',
    'b2b3a117ac0ed8aed794db4f4cb3b7555a7fced40109d07d3f36f790b48c4fd6',
    true, 'driver_activation', accepted_at, consent_evidence
  );

  update public.drivers
  set legal_activation_status = 'active',
      legal_activation_status_changed_at = accepted_at,
      legal_activated_at = accepted_at,
      updated_at = accepted_at
  where id = viewer_driver_id
  returning * into target_driver;

  return pg_catalog.jsonb_build_object(
    'driver_id', target_driver.id,
    'status', target_driver.legal_activation_status,
    'activated_at', target_driver.legal_activated_at
  );
end;
$$;

revoke all on function public.activate_current_driver(jsonb) from public, anon;
grant execute on function public.activate_current_driver(jsonb) to authenticated;

notify pgrst, 'reload schema';
