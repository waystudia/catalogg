-- Allow a user who is both a platform administrator and the actual restaurant owner
-- to complete the legal activation of that restaurant. Platform privileges alone never
-- grant the right to accept restaurant legal documents.

create or replace function public.get_current_restaurant_activation()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  target_client public.clients;
  target_catalog_slug text;
  member_record record;
  profile_record public.restaurant_legal_profiles;
  tariff_record public.restaurant_tariffs;
  bundle_record public.legal_document_bundles;
  documents jsonb := '[]'::jsonb;
  pending_request_id uuid;
begin
  if viewer_user_id is null then raise exception 'authentication_required'; end if;
  select * into target_client from public.clients where id = public.current_restaurant_client_id();
  if target_client.id is null then raise exception 'restaurant_not_found'; end if;
  select slug into target_catalog_slug from public.catalogs where id = target_client.catalog_id;
  select role, can_accept_legal_documents into member_record
  from public.catalog_members
  where catalog_id = target_client.catalog_id and user_id = viewer_user_id;
  select * into profile_record from public.restaurant_legal_profiles where client_id = target_client.id;
  select * into tariff_record from public.restaurant_tariffs
  where client_id = target_client.id and status = 'published'
    and coalesce(starts_at, '-infinity'::timestamptz) <= now()
    and coalesce(ends_at, 'infinity'::timestamptz) > now()
  order by starts_at desc nulls last, created_at desc limit 1;
  select * into bundle_record from public.legal_document_bundles where id = public.current_published_legal_bundle_id();
  if bundle_record.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', document.id,
      'type', document.document_type,
      'title', document.title,
      'version', document.version,
      'effective_from', document.effective_from,
      'pdf_url', document.pdf_url,
      'file_hash', document.file_hash,
      'opened', exists (
        select 1 from public.restaurant_document_open_events opened
        where opened.client_id = target_client.id and opened.user_id = viewer_user_id
          and opened.bundle_id = bundle_record.id and opened.document_id = document.id
      )
    ) order by item.sort_order), '[]'::jsonb)
    into documents
    from public.legal_document_bundle_items item
    join public.legal_documents document on document.id = item.document_id
    where item.bundle_id = bundle_record.id and document.status = 'published';
  end if;
  select request.id into pending_request_id
  from public.restaurant_activation_requests request
  where request.client_id = target_client.id and request.user_id = viewer_user_id
    and request.status in ('awaiting_manual_code', 'code_issued')
  order by request.created_at desc limit 1;
  return jsonb_build_object(
    'client_id', target_client.id,
    'catalog_id', target_client.catalog_id,
    'catalog_slug', target_catalog_slug,
    'legal_status', target_client.legal_activation_status,
    'member_role', member_record.role,
    'can_accept_legal_documents', (
      target_client.owner_user_id = viewer_user_id
      or (
        not public.is_platform_admin()
        and (member_record.role = 'owner'::public.catalog_role or coalesce(member_record.can_accept_legal_documents, false))
      )
    ),
    'restaurant', jsonb_build_object(
      'name', target_client.company_name,
      'legal_name', profile_record.legal_name,
      'inn', profile_record.inn,
      'actual_address', profile_record.actual_address,
      'representative_full_name', profile_record.representative_full_name,
      'authority_basis', profile_record.authority_basis,
      'phone', coalesce(profile_record.restaurant_phone, target_client.phone),
      'email', coalesce(profile_record.restaurant_email, target_client.email),
      'delivery_model', profile_record.delivery_model
    ),
    'tariff', case when tariff_record.id is null then null else jsonb_build_object(
      'name', tariff_record.name,
      'restaurant_commission_amount', tariff_record.restaurant_commission_amount,
      'driver_commission_amount', tariff_record.driver_commission_amount,
      'version', tariff_record.version,
      'effective_from', tariff_record.starts_at
    ) end,
    'bundle_id', bundle_record.id,
    'bundle_version', bundle_record.version,
    'documents', documents,
    'pending_request_id', pending_request_id
  );
end;
$$;

revoke all on function public.get_current_restaurant_activation() from public, anon;
grant execute on function public.get_current_restaurant_activation() to authenticated;

create or replace function public.get_current_restaurant_activation_profile_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  target_client_id uuid := public.current_restaurant_client_id();
  target_client public.clients;
  profile_record public.restaurant_legal_profiles;
  tariff_record public.restaurant_tariffs;
begin
  if viewer_user_id is null or target_client_id is null then raise exception 'access_denied'; end if;
  select * into target_client from public.clients where id = target_client_id;
  if target_client.id is null
    or (public.is_platform_admin() and target_client.owner_user_id is distinct from viewer_user_id)
  then
    raise exception 'access_denied';
  end if;
  select * into profile_record from public.restaurant_legal_profiles where client_id = target_client_id;
  select * into tariff_record
  from public.restaurant_tariffs tariff
  where tariff.client_id = target_client_id and tariff.status = 'published'
    and coalesce(tariff.starts_at, '-infinity'::timestamptz) <= now()
    and coalesce(tariff.ends_at, 'infinity'::timestamptz) > now()
  order by tariff.starts_at desc nulls last, tariff.created_at desc
  limit 1;
  return jsonb_build_object(
    'organization_type', profile_record.organization_type,
    'ogrn', profile_record.ogrn,
    'legal_address', profile_record.legal_address,
    'director_full_name', profile_record.director_full_name,
    'free_period_terms', tariff_record.free_period_terms,
    'commission_rules', tariff_record.commission_rules,
    'individual_terms', tariff_record.individual_terms
  );
end;
$$;

revoke all on function public.get_current_restaurant_activation_profile_details() from public, anon;
grant execute on function public.get_current_restaurant_activation_profile_details() to authenticated;

create or replace function public.request_restaurant_activation_code(
  target_bundle_id uuid,
  target_checkboxes jsonb,
  target_opened_document_ids uuid[],
  target_marketing_consents jsonb,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  target_client public.clients;
  member_record record;
  required_key text;
  created_request public.restaurant_activation_requests;
  profile_record public.restaurant_legal_profiles;
  verified_opened_documents jsonb := '[]'::jsonb;
  request_headers jsonb := coalesce(current_setting('request.headers', true), '{}')::jsonb;
begin
  if viewer_user_id is null then raise exception 'access_denied'; end if;
  select * into target_client from public.clients where id = public.current_restaurant_client_id() for update;
  if target_client.id is null then raise exception 'restaurant_not_found'; end if;
  if public.is_platform_admin() and target_client.owner_user_id is distinct from viewer_user_id then
    raise exception 'access_denied';
  end if;
  select role, can_accept_legal_documents into member_record from public.catalog_members
  where catalog_id = target_client.catalog_id and user_id = viewer_user_id;
  if target_client.owner_user_id is distinct from viewer_user_id
    and (
      public.is_platform_admin()
      or (
        member_record.role <> 'owner'::public.catalog_role
        and not coalesce(member_record.can_accept_legal_documents, false)
      )
    )
  then
    raise exception 'legal_acceptance_permission_required';
  end if;
  if target_client.legal_activation_status <> 'awaiting_acceptance' then raise exception 'restaurant_not_awaiting_acceptance'; end if;
  if target_bundle_id is distinct from public.current_published_legal_bundle_id() then raise exception 'stale_document_bundle'; end if;
  if jsonb_typeof(target_checkboxes) <> 'object' then raise exception 'required_confirmations_missing'; end if;
  foreach required_key in array array['contract','tariff','operations_rules','restaurant_data','authority','content_license','privacy_policy']
  loop
    if coalesce((target_checkboxes ->> required_key)::boolean, false) is not true then
      raise exception 'required_confirmations_missing';
    end if;
  end loop;
  if target_opened_document_ids is not null and exists (
    select 1
    from unnest(target_opened_document_ids) requested(document_id)
    where not exists (
      select 1
      from public.restaurant_document_open_events opened
      where opened.client_id = target_client.id
        and opened.user_id = viewer_user_id
        and opened.bundle_id = target_bundle_id
        and opened.document_id = requested.document_id
    )
  ) then
    raise exception 'document_open_not_recorded';
  end if;
  select coalesce(jsonb_agg(opened_document.document_id order by opened_document.document_id), '[]'::jsonb)
  into verified_opened_documents
  from (
    select distinct opened.document_id
    from public.restaurant_document_open_events opened
    join public.legal_document_bundle_items item
      on item.bundle_id = opened.bundle_id and item.document_id = opened.document_id
    where opened.client_id = target_client.id
      and opened.user_id = viewer_user_id
      and opened.bundle_id = target_bundle_id
  ) opened_document;
  select * into profile_record from public.restaurant_legal_profiles where client_id = target_client.id;
  insert into public.restaurant_activation_requests(
    client_id, user_id, bundle_id, confirmation_destination_masked, checkboxes_json,
    marketing_consents_json, documents_opened_json, idempotency_key, session_id, ip_address, user_agent
  ) values (
    target_client.id,
    viewer_user_id,
    target_bundle_id,
    public.mask_activation_destination(coalesce(profile_record.primary_confirmation_phone, profile_record.primary_confirmation_email)),
    target_checkboxes,
    coalesce(target_marketing_consents, '{}'::jsonb),
    verified_opened_documents,
    target_idempotency_key,
    auth.jwt() ->> 'session_id',
    nullif(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), '')::inet,
    left(coalesce(request_headers ->> 'user-agent', ''), 1000)
  )
  on conflict (client_id, user_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning * into created_request;
  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (target_client.catalog_id, viewer_user_id, 'restaurant.activation.code_requested', 'restaurant_activation_requests',
    created_request.id, jsonb_build_object('method', 'manual_code'));
  return jsonb_build_object('request_id', created_request.id, 'status', created_request.status);
end;
$$;

revoke all on function public.request_restaurant_activation_code(uuid, jsonb, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.request_restaurant_activation_code(uuid, jsonb, uuid[], jsonb, uuid) to authenticated;

create or replace function public.confirm_restaurant_activation(
  target_request_id uuid,
  target_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  viewer_user_id uuid := auth.uid();
  target_request public.restaurant_activation_requests;
  target_client public.clients;
  code_record public.confirmation_codes;
  member_record record;
  profile_record public.restaurant_legal_profiles;
  tariff_record public.restaurant_tariffs;
  existing_acceptance_id uuid;
  created_acceptance_id uuid;
  accepted_now timestamptz := clock_timestamp();
  document_hashes jsonb;
  restaurant_snapshot jsonb;
  tariff_snapshot jsonb;
  acceptance_hash_value text;
  next_attempts integer;
begin
  if viewer_user_id is null then raise exception 'access_denied'; end if;
  select * into target_request from public.restaurant_activation_requests
  where id = target_request_id and user_id = viewer_user_id for update;
  if target_request.id is null then raise exception 'activation_request_not_found'; end if;
  if target_request.status = 'confirmed' then
    select id into existing_acceptance_id from public.legal_acceptances where activation_request_id = target_request.id;
    return jsonb_build_object('ok', true, 'acceptance_id', existing_acceptance_id, 'legal_status', 'active');
  end if;
  select * into target_client from public.clients where id = target_request.client_id for update;
  if public.is_platform_admin() and target_client.owner_user_id is distinct from viewer_user_id then
    raise exception 'access_denied';
  end if;
  select role, can_accept_legal_documents into member_record from public.catalog_members
  where catalog_id = target_client.catalog_id and user_id = viewer_user_id;
  if target_client.owner_user_id is distinct from viewer_user_id
    and (
      public.is_platform_admin()
      or (
        member_record.role <> 'owner'::public.catalog_role
        and not coalesce(member_record.can_accept_legal_documents, false)
      )
    )
  then
    raise exception 'legal_acceptance_permission_required';
  end if;
  if target_client.legal_activation_status <> 'awaiting_acceptance' then raise exception 'restaurant_not_awaiting_acceptance'; end if;
  if target_request.bundle_id is distinct from public.current_published_legal_bundle_id() then
    update public.restaurant_activation_requests set status = 'cancelled' where id = target_request.id;
    return jsonb_build_object('ok', false, 'error', 'stale_document_bundle');
  end if;
  select * into code_record from public.confirmation_codes
  where activation_request_id = target_request.id and invalidated_at is null and used_at is null
  order by created_at desc limit 1 for update;
  if code_record.id is null then return jsonb_build_object('ok', false, 'error', 'code_not_issued'); end if;
  if code_record.locked_until is not null and code_record.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'code_locked', 'locked_until', code_record.locked_until);
  end if;
  if code_record.expires_at <= now() then
    update public.confirmation_codes set invalidated_at = now() where id = code_record.id;
    update public.restaurant_activation_requests set status = 'expired' where id = target_request.id;
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  if target_code !~ '^[0-9]{6}$' or crypt(target_code, code_record.code_hash) <> code_record.code_hash then
    next_attempts := code_record.attempts_count + 1;
    update public.confirmation_codes
    set attempts_count = next_attempts,
        locked_until = case when next_attempts >= max_attempts then now() + interval '15 minutes' else locked_until end
    where id = code_record.id;
    insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
    values (target_client.catalog_id, viewer_user_id, 'restaurant.activation.code_invalid', 'restaurant_activation_requests',
      target_request.id, jsonb_build_object('attempts', next_attempts, 'max_attempts', code_record.max_attempts));
    return jsonb_build_object(
      'ok', false,
      'error', case when next_attempts >= code_record.max_attempts then 'code_locked' else 'invalid_code' end,
      'attempts_remaining', greatest(code_record.max_attempts - next_attempts, 0)
    );
  end if;
  select * into profile_record from public.restaurant_legal_profiles where client_id = target_client.id;
  select * into tariff_record from public.restaurant_tariffs
  where client_id = target_client.id and status = 'published'
    and coalesce(starts_at, '-infinity'::timestamptz) <= now()
    and coalesce(ends_at, 'infinity'::timestamptz) > now()
  order by starts_at desc nulls last, created_at desc limit 1;
  select coalesce(jsonb_object_agg(document.document_type, document.file_hash), '{}'::jsonb)
  into document_hashes
  from public.legal_document_bundle_items item
  join public.legal_documents document on document.id = item.document_id
  where item.bundle_id = target_request.bundle_id;
  restaurant_snapshot := jsonb_build_object(
    'client_id', target_client.id,
    'catalog_id', target_client.catalog_id,
    'company_name', target_client.company_name,
    'legal_name', profile_record.legal_name,
    'inn', profile_record.inn,
    'ogrn', profile_record.ogrn,
    'legal_address', profile_record.legal_address,
    'actual_address', profile_record.actual_address,
    'representative_full_name', profile_record.representative_full_name,
    'authority_basis', profile_record.authority_basis,
    'delivery_model', profile_record.delivery_model
  );
  tariff_snapshot := to_jsonb(tariff_record);
  acceptance_hash_value := encode(digest(convert_to(concat_ws('|',
    target_client.id::text,
    viewer_user_id::text,
    target_request.bundle_id::text,
    accepted_now::text,
    target_request.checkboxes_json::text,
    restaurant_snapshot::text,
    tariff_snapshot::text,
    document_hashes::text
  ), 'UTF8'), 'sha256'), 'hex');
  insert into public.legal_acceptances(
    restaurant_id, catalog_id, user_id, activation_request_id,
    representative_full_name, representative_role, authority_basis, phone, email,
    document_bundle_id, contract_version, tariff_version, regulation_version,
    privacy_policy_version, content_rules_version, accepted_at, confirmed_at,
    ip_address, user_agent, session_id, confirmation_method, confirmation_destination_masked,
    checkboxes_json, documents_opened_json, restaurant_snapshot_json, tariff_snapshot_json,
    document_hashes_json, acceptance_hash
  )
  select
    target_client.id,
    target_client.catalog_id,
    viewer_user_id,
    target_request.id,
    profile_record.representative_full_name,
    coalesce(member_record.role::text, 'owner'),
    profile_record.authority_basis,
    profile_record.primary_confirmation_phone,
    profile_record.primary_confirmation_email,
    target_request.bundle_id,
    max(document.version) filter (where document.document_type = 'restaurant_contract'),
    tariff_record.version,
    max(document.version) filter (where document.document_type = 'restaurant_regulation'),
    max(document.version) filter (where document.document_type = 'privacy_policy'),
    max(document.version) filter (where document.document_type = 'content_license'),
    accepted_now,
    accepted_now,
    target_request.ip_address,
    target_request.user_agent,
    target_request.session_id,
    target_request.confirmation_method,
    target_request.confirmation_destination_masked,
    target_request.checkboxes_json,
    target_request.documents_opened_json,
    restaurant_snapshot,
    tariff_snapshot,
    document_hashes,
    acceptance_hash_value
  from public.legal_document_bundle_items item
  join public.legal_documents document on document.id = item.document_id
  where item.bundle_id = target_request.bundle_id
  returning id into created_acceptance_id;
  insert into public.legal_acceptance_documents(
    acceptance_id, document_id, document_type, title, version, file_hash
  )
  select created_acceptance_id, document.id, document.document_type, document.title, document.version, document.file_hash
  from public.legal_document_bundle_items item
  join public.legal_documents document on document.id = item.document_id
  where item.bundle_id = target_request.bundle_id;
  update public.confirmation_codes set used_at = accepted_now where id = code_record.id;
  update public.restaurant_activation_requests set status = 'confirmed', confirmed_at = accepted_now where id = target_request.id;
  update public.clients
  set legal_activation_status = 'active', legal_activation_status_changed_at = accepted_now,
      activated_at = accepted_now, active_acceptance_id = created_acceptance_id
  where id = target_client.id;
  update public.catalogs set status = 'published'::public.catalog_status where id = target_client.catalog_id;
  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (target_client.catalog_id, viewer_user_id, 'restaurant.activation.accepted', 'legal_acceptances',
    created_acceptance_id, jsonb_build_object('acceptance_hash', acceptance_hash_value, 'bundle_id', target_request.bundle_id));
  return jsonb_build_object('ok', true, 'acceptance_id', created_acceptance_id, 'legal_status', 'active');
end;
$$;

revoke all on function public.confirm_restaurant_activation(uuid, text) from public, anon;
grant execute on function public.confirm_restaurant_activation(uuid, text) to authenticated;
