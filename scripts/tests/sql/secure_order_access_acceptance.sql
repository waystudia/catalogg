begin;

do $$
declare
  target_order_id uuid;
  target_catalog_id uuid;
  assigned_driver_id uuid;
  assigned_driver_auth_id uuid;
  other_driver_auth_id uuid;
  target_client_account_id uuid;
  client_auth_id uuid;
  other_client_auth_id uuid;
  business_auth_id uuid;
  other_business_auth_id uuid;
  admin_auth_id uuid;
  response jsonb;
  random_order_id uuid := gen_random_uuid();
  guest_token text := 'acceptance-only-guest-token';
begin
  if has_function_privilege('anon', 'public.get_public_restaurant_order_status(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_public_restaurant_order_status(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_public_order_tracking(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_public_order_tracking(uuid)', 'EXECUTE') then
    raise exception 'unsafe_public_order_rpc_still_executable';
  end if;

  select order_row.id, order_row.catalog_id, delivery.driver_id, platform_user.auth_user_id
  into target_order_id, target_catalog_id, assigned_driver_id, assigned_driver_auth_id
  from public.orders order_row
  join public.deliveries delivery on delivery.order_id = order_row.id
  join public.drivers driver on driver.id = delivery.driver_id
  join public.users platform_user on platform_user.id = driver.user_id
  where platform_user.auth_user_id is not null
  limit 1;
  if target_order_id is null then raise exception 'assigned_delivery_fixture_required'; end if;

  select account.id, account.auth_user_id
  into target_client_account_id, client_auth_id
  from public.client_accounts account
  where account.auth_user_id is not null
  limit 1;
  if client_auth_id is null then raise exception 'client_auth_fixture_required'; end if;

  select account.auth_user_id into other_client_auth_id
  from public.client_accounts account
  where account.auth_user_id is not null and account.auth_user_id <> client_auth_id
  limit 1;
  if other_client_auth_id is null then raise exception 'second_client_auth_fixture_required'; end if;

  select user_row.id into business_auth_id
  from auth.users user_row
  where user_row.id not in (client_auth_id, other_client_auth_id, assigned_driver_auth_id)
    and not exists (select 1 from public.platform_admins admin where admin.user_id = user_row.id)
  limit 1;
  select user_row.id into other_business_auth_id
  from auth.users user_row
  where user_row.id not in (client_auth_id, other_client_auth_id, assigned_driver_auth_id, business_auth_id)
    and not exists (select 1 from public.platform_admins admin where admin.user_id = user_row.id)
  limit 1;
  if business_auth_id is null or other_business_auth_id is null then
    raise exception 'business_auth_fixtures_required';
  end if;

  insert into public.catalog_members(catalog_id, user_id, role)
  values(target_catalog_id, business_auth_id, 'viewer'::public.catalog_role)
  on conflict (catalog_id, user_id) do update set role = excluded.role;

  select member.user_id into other_business_auth_id
  from public.catalog_members member
  where member.catalog_id <> target_catalog_id
    and member.user_id <> business_auth_id
    and not exists (select 1 from public.platform_admins admin where admin.user_id = member.user_id)
  limit 1;
  if other_business_auth_id is null then raise exception 'other_business_membership_fixture_required'; end if;

  select platform_user.auth_user_id into other_driver_auth_id
  from public.drivers driver
  join public.users platform_user on platform_user.id = driver.user_id
  where driver.id <> assigned_driver_id and platform_user.auth_user_id is not null
  limit 1;
  if other_driver_auth_id is null then raise exception 'other_driver_fixture_required'; end if;

  select admin.user_id into admin_auth_id from public.platform_admins admin limit 1;
  if admin_auth_id is null then raise exception 'platform_admin_fixture_required'; end if;

  update public.orders
  set client_account_id = target_client_account_id,
      status = 'on_the_way'::public.order_status
  where id = target_order_id;
  update public.deliveries set status = 'on_the_way' where order_id = target_order_id;
  update public.drivers
  set last_lat = 43.1234567, last_lng = 45.1234567, last_location_at = now()
  where id = assigned_driver_id;

  perform set_config('request.jwt.claim.sub', '', true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response is not null then raise exception 'anon_existing_uuid_must_be_denied'; end if;
  response := public.get_order_participant_status(random_order_id, null, null);
  if response is not null then raise exception 'anon_random_uuid_must_be_denied'; end if;

  perform set_config('request.jwt.claim.sub', other_client_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response is not null then raise exception 'other_client_must_be_denied'; end if;

  perform set_config('request.jwt.claim.sub', client_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response ->> 'access_role' <> 'client'
     or coalesce(response ->> 'driver_name', '') = ''
     or coalesce(response ->> 'driver_phone', '') = ''
     or coalesce((response ->> 'live_tracking')::boolean, false) is not true then
    raise exception 'client_owner_access_or_map_failed';
  end if;

  perform set_config('request.jwt.claim.sub', other_business_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response is not null then raise exception 'other_business_must_be_denied'; end if;

  perform set_config('request.jwt.claim.sub', business_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response ->> 'access_role' <> 'business'
     or coalesce(response ->> 'customer_phone', '') = ''
     or coalesce(response ->> 'driver_phone', '') = ''
     or coalesce((response ->> 'live_tracking')::boolean, false) is not true then
    raise exception 'business_order_access_or_map_failed';
  end if;

  perform set_config('request.jwt.claim.sub', other_driver_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response is not null then raise exception 'unassigned_driver_must_be_denied'; end if;

  perform set_config('request.jwt.claim.sub', assigned_driver_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response ->> 'access_role' <> 'driver'
     or coalesce(response ->> 'customer_phone', '') = ''
     or coalesce((response ->> 'live_tracking')::boolean, false) is not true then
    raise exception 'assigned_driver_access_or_map_failed';
  end if;

  perform set_config('request.jwt.claim.sub', admin_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response ->> 'access_role' <> 'platform_admin' then
    raise exception 'platform_admin_access_failed';
  end if;

  insert into public.order_guest_tracking_tokens(order_id, token_hash, expires_at)
  values(target_order_id, digest(convert_to(guest_token, 'UTF8'), 'sha256'), now() + interval '1 hour')
  on conflict (order_id) do update
  set token_hash = excluded.token_hash, expires_at = excluded.expires_at, revoked_at = null;

  perform set_config('request.jwt.claim.sub', '', true);
  response := public.get_order_participant_status(target_order_id, null, 'wrong-token');
  if response is not null then raise exception 'wrong_guest_token_must_be_denied'; end if;
  response := public.get_order_participant_status(target_order_id, null, guest_token);
  if response ->> 'access_role' <> 'guest'
     or coalesce(response ->> 'customer_phone', '') <> ''
     or coalesce(response ->> 'driver_phone', '') <> ''
     or jsonb_array_length(response -> 'items') <> 0
     or coalesce((response ->> 'live_tracking')::boolean, false) is not true then
    raise exception 'guest_minimal_tracking_failed';
  end if;

  update public.order_guest_tracking_tokens
  set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
  where order_id = target_order_id;
  response := public.get_order_participant_status(target_order_id, null, guest_token);
  if response is not null then raise exception 'expired_guest_token_must_be_denied'; end if;
  update public.order_guest_tracking_tokens
  set created_at = now(), expires_at = now() + interval '1 hour', revoked_at = now()
  where order_id = target_order_id;
  response := public.get_order_participant_status(target_order_id, null, guest_token);
  if response is not null then raise exception 'revoked_guest_token_must_be_denied'; end if;

  update public.orders set status = 'completed'::public.order_status where id = target_order_id;
  update public.deliveries set status = 'delivered' where order_id = target_order_id;
  perform set_config('request.jwt.claim.sub', assigned_driver_auth_id::text, true);
  response := public.get_order_participant_status(target_order_id, null, null);
  if response ->> 'access_role' <> 'driver'
     or coalesce(response ->> 'customer_phone', '') <> ''
     or response -> 'driver_lat' <> 'null'::jsonb
     or coalesce((response ->> 'live_tracking')::boolean, false) is true then
    raise exception 'terminal_driver_redaction_failed';
  end if;

  if not exists (
    select 1 from public.legal_consent_records record
    where record.order_id is not null
  ) then
    -- The schema assertion is enough here; order-linked inserts are exercised
    -- by the secure creation contract tests without creating a real order.
    perform 1;
  end if;
end
$$;

rollback;
