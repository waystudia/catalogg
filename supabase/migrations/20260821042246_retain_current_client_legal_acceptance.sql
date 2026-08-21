-- Keep current client legal acceptances reusable across later orders and expose
-- a read-only audit trail to authenticated platform administrators.

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
  user_agreement_is_current boolean := false;
  client_consent_is_current boolean := false;
  order_transfer_is_current boolean := false;
  request_headers jsonb := coalesce(
    pg_catalog.current_setting('request.headers', true),
    '{}'
  )::jsonb;
begin
  if target_user_agreement_version <> '3.0'
     or pg_catalog.lower(coalesce(target_user_agreement_sha256, '')) <> '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'
     or target_client_consent_version <> '3.0'
     or pg_catalog.lower(coalesce(target_client_consent_sha256, '')) <> 'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e'
     or target_order_transfer_version <> '3.1'
     or pg_catalog.lower(coalesce(target_order_transfer_sha256, '')) <> 'bce5eb5088bbce6cda7b1f316d17955e7406803777eeeaef056e83f918d87455' then
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

  account_id := public.resolve_order_client_account(client_session_token);

  if account_id is not null then
    select
      coalesce((
        select consent.granted and consent.revoked_at is null
        from public.legal_consent_records consent
        where consent.subject_type = 'client'
          and consent.subject_id = account_id
          and consent.document_code = 'user_agreement'
          and consent.document_version = target_user_agreement_version
          and consent.document_sha256 = pg_catalog.lower(target_user_agreement_sha256)
        order by consent.created_at desc, consent.id desc
        limit 1
      ), false),
      coalesce((
        select consent.granted and consent.revoked_at is null
        from public.legal_consent_records consent
        where consent.subject_type = 'client'
          and consent.subject_id = account_id
          and consent.document_code = 'client_consent'
          and consent.document_version = target_client_consent_version
          and consent.document_sha256 = pg_catalog.lower(target_client_consent_sha256)
        order by consent.created_at desc, consent.id desc
        limit 1
      ), false),
      coalesce((
        select consent.granted and consent.revoked_at is null
        from public.legal_consent_records consent
        where consent.subject_type = 'client'
          and consent.subject_id = account_id
          and consent.document_code = 'order_transfer_consent'
          and consent.document_version = target_order_transfer_version
          and consent.document_sha256 = pg_catalog.lower(target_order_transfer_sha256)
        order by consent.created_at desc, consent.id desc
        limit 1
      ), false)
    into user_agreement_is_current, client_consent_is_current, order_transfer_is_current;

    if (not user_agreement_is_current or not client_consent_is_current)
       and target_general_consent_confirmed is distinct from true then
      raise exception 'current_client_legal_acceptance_required';
    end if;

    if not order_transfer_is_current
       and target_order_transfer_confirmed is distinct from true then
      raise exception 'order_transfer_consent_required';
    end if;

    if not user_agreement_is_current then
      insert into public.legal_consent_records(
        subject_type, subject_id, auth_user_id, document_code,
        document_version, document_sha256, granted, source, granted_at,
        order_id, evidence
      ) values (
        'client', account_id, (select auth.uid()), 'user_agreement',
        target_user_agreement_version, pg_catalog.lower(target_user_agreement_sha256),
        true, 'checkout_current_version', pg_catalog.clock_timestamp(), created_order_id,
        pg_catalog.jsonb_build_object(
          'captured_by', 'secure_order_rpc',
          'context', 'checkout',
          'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
          'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
        )
      ) on conflict do nothing;
    end if;

    if not client_consent_is_current then
      insert into public.legal_consent_records(
        subject_type, subject_id, auth_user_id, document_code,
        document_version, document_sha256, granted, source, granted_at,
        order_id, evidence
      ) values (
        'client', account_id, (select auth.uid()), 'client_consent',
        target_client_consent_version, pg_catalog.lower(target_client_consent_sha256),
        true, 'checkout_current_version', pg_catalog.clock_timestamp(), created_order_id,
        pg_catalog.jsonb_build_object(
          'captured_by', 'secure_order_rpc',
          'context', 'checkout',
          'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
          'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
        )
      ) on conflict do nothing;
    end if;

    update public.orders
    set client_account_id = account_id
    where id = created_order_id
      and client_account_id is null;

    if not order_transfer_is_current then
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
          'context', 'standing_order_transfer',
          'catalog_id', target_catalog_id,
          'ip_address', pg_catalog.nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
          'user_agent', pg_catalog.left(coalesce(request_headers ->> 'user-agent', ''), 1000)
        )
      ) on conflict do nothing;
    end if;

    return pg_catalog.jsonb_build_object('order_id', created_order_id);
  end if;

  if target_general_consent_confirmed is distinct from true then
    raise exception 'guest_legal_acceptance_required';
  end if;
  if target_order_transfer_confirmed is distinct from true then
    raise exception 'order_transfer_consent_required';
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
grant execute on function public.finish_secure_client_order(
  uuid, uuid, text, boolean, text, text, text, text, boolean, text, text
) to anon, authenticated;

create or replace function public.get_current_client_legal_state(
  client_session_token text,
  target_user_agreement_version text,
  target_user_agreement_sha256 text,
  target_client_consent_version text,
  target_client_consent_sha256 text,
  target_order_transfer_version text,
  target_order_transfer_sha256 text
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
    'user_agreement_current', viewer.account_id is not null and coalesce((
      select record.granted and record.revoked_at is null
      from public.legal_consent_records record
      where record.subject_type = 'client'
        and record.subject_id = viewer.account_id
        and record.document_code = 'user_agreement'
        and record.document_version = target_user_agreement_version
        and record.document_sha256 = pg_catalog.lower(target_user_agreement_sha256)
      order by record.created_at desc, record.id desc
      limit 1
    ), false),
    'client_consent_current', viewer.account_id is not null and coalesce((
      select record.granted and record.revoked_at is null
      from public.legal_consent_records record
      where record.subject_type = 'client'
        and record.subject_id = viewer.account_id
        and record.document_code = 'client_consent'
        and record.document_version = target_client_consent_version
        and record.document_sha256 = pg_catalog.lower(target_client_consent_sha256)
      order by record.created_at desc, record.id desc
      limit 1
    ), false),
    'order_transfer_consent_current', viewer.account_id is not null and coalesce((
      select record.granted and record.revoked_at is null
      from public.legal_consent_records record
      where record.subject_type = 'client'
        and record.subject_id = viewer.account_id
        and record.document_code = 'order_transfer_consent'
        and record.document_version = target_order_transfer_version
        and record.document_sha256 = pg_catalog.lower(target_order_transfer_sha256)
      order by record.created_at desc, record.id desc
      limit 1
    ), false)
  )
  from viewer
$$;

revoke all on function public.get_current_client_legal_state(text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_current_client_legal_state(text,text,text,text,text,text,text)
  to anon, authenticated;

create or replace function public.get_platform_legal_consent_history(
  target_subject_type text,
  target_subject_id uuid default null,
  target_client_phone text default null
)
returns table (
  id uuid,
  document_code text,
  document_version text,
  document_sha256 text,
  granted boolean,
  source text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  order_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_subject_id uuid := target_subject_id;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  if target_subject_type not in ('client', 'restaurant_representative', 'driver') then
    raise exception 'legal_subject_type_invalid';
  end if;

  if target_subject_type = 'client' then
    select account.id into resolved_subject_id
    from public.client_accounts account
    where account.phone_normalized = public.normalize_client_phone(coalesce(target_client_phone, ''))
    order by account.created_at desc
    limit 1;
  end if;

  if resolved_subject_id is null then
    return;
  end if;

  return query
  select
    record.id,
    record.document_code,
    record.document_version,
    record.document_sha256,
    record.granted,
    record.source,
    record.granted_at,
    record.revoked_at,
    record.created_at,
    record.order_id
  from public.legal_consent_records record
  where record.subject_type = target_subject_type
    and record.subject_id = resolved_subject_id
  order by record.created_at desc, record.id desc;
end;
$$;

revoke all on function public.get_platform_legal_consent_history(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_platform_legal_consent_history(text, uuid, text)
  to authenticated;
