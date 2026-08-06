-- Platform administrators configure each restaurant before its owner accepts
-- the offer. The owner-facing activation RPC already reads these tables and
-- the confirmed acceptance stores immutable profile and tariff snapshots.

create or replace function public.get_admin_restaurant_activation_setup(target_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_client public.clients;
  target_catalog public.catalogs;
  profile_record public.restaurant_legal_profiles;
  tariff_record public.restaurant_tariffs;
  bundle_record public.legal_document_bundles;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'access_denied'; end if;

  select * into target_client from public.clients where id = target_client_id;
  if target_client.id is null then raise exception 'restaurant_not_found'; end if;
  select * into target_catalog from public.catalogs where id = target_client.catalog_id;
  select * into profile_record from public.restaurant_legal_profiles where client_id = target_client.id;
  select * into tariff_record
  from public.restaurant_tariffs tariff
  where tariff.client_id = target_client.id and tariff.status = 'published'
  order by tariff.starts_at desc nulls last, tariff.created_at desc
  limit 1;
  select * into bundle_record
  from public.legal_document_bundles bundle
  where bundle.id = public.current_published_legal_bundle_id();

  return jsonb_build_object(
    'client_id', target_client.id,
    'catalog_id', target_client.catalog_id,
    'catalog_slug', target_catalog.slug,
    'restaurant_name', target_client.company_name,
    'legal_status', target_client.legal_activation_status,
    'logo_url', target_catalog.logo_url,
    'profile', jsonb_build_object(
      'organization_type', profile_record.organization_type,
      'legal_name', profile_record.legal_name,
      'inn', profile_record.inn,
      'ogrn', profile_record.ogrn,
      'legal_address', profile_record.legal_address,
      'actual_address', profile_record.actual_address,
      'restaurant_phone', profile_record.restaurant_phone,
      'restaurant_email', profile_record.restaurant_email,
      'director_full_name', profile_record.director_full_name,
      'representative_full_name', profile_record.representative_full_name,
      'authority_basis', profile_record.authority_basis,
      'primary_confirmation_phone', profile_record.primary_confirmation_phone,
      'primary_confirmation_email', profile_record.primary_confirmation_email,
      'delivery_model', profile_record.delivery_model
    ),
    'tariff', case when tariff_record.id is null then null else jsonb_build_object(
      'name', tariff_record.name,
      'restaurant_commission_amount', tariff_record.restaurant_commission_amount,
      'driver_commission_amount', tariff_record.driver_commission_amount,
      'version', tariff_record.version,
      'starts_at', tariff_record.starts_at,
      'free_period_terms', tariff_record.free_period_terms,
      'commission_rules', tariff_record.commission_rules,
      'individual_terms', tariff_record.individual_terms
    ) end,
    'bundle', case when bundle_record.id is null then null else jsonb_build_object(
      'id', bundle_record.id,
      'title', bundle_record.title,
      'version', bundle_record.version,
      'effective_from', bundle_record.effective_from
    ) end,
    'missing_setup', to_jsonb(public.restaurant_activation_missing_requirements(target_client.id))
  );
end;
$$;

revoke all on function public.get_admin_restaurant_activation_setup(uuid) from public, anon;
grant execute on function public.get_admin_restaurant_activation_setup(uuid) to authenticated;

create or replace function public.save_admin_restaurant_activation_setup(
  target_client_id uuid,
  target_logo_url text,
  target_profile jsonb,
  target_tariff jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_catalog_id uuid;
  tariff_name text;
  tariff_version text;
  restaurant_commission numeric(12,2);
  driver_commission numeric(12,2);
  tariff_starts_at timestamptz;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'access_denied'; end if;
  if jsonb_typeof(target_profile) <> 'object' or jsonb_typeof(target_tariff) <> 'object' then
    raise exception 'invalid_activation_setup';
  end if;

  select catalog_id into target_catalog_id from public.clients where id = target_client_id for update;
  if target_catalog_id is null then raise exception 'restaurant_not_found'; end if;

  tariff_name := nullif(trim(coalesce(target_tariff ->> 'name', '')), '');
  tariff_version := nullif(trim(coalesce(target_tariff ->> 'version', '')), '');
  restaurant_commission := coalesce(nullif(target_tariff ->> 'restaurant_commission_amount', '')::numeric, 30);
  driver_commission := coalesce(nullif(target_tariff ->> 'driver_commission_amount', '')::numeric, 30);
  tariff_starts_at := coalesce(nullif(target_tariff ->> 'starts_at', '')::timestamptz, now());
  if tariff_name is null or tariff_version is null then raise exception 'tariff_name_and_version_required'; end if;
  if restaurant_commission < 0 or driver_commission < 0 then raise exception 'tariff_commission_invalid'; end if;

  update public.catalogs
  set logo_url = nullif(trim(coalesce(target_logo_url, '')), '')
  where id = target_catalog_id;

  insert into public.restaurant_legal_profiles(
    client_id, organization_type, legal_name, inn, ogrn, legal_address, actual_address,
    restaurant_phone, restaurant_email, director_full_name, representative_full_name,
    authority_basis, primary_confirmation_phone, primary_confirmation_email, delivery_model,
    updated_at
  ) values (
    target_client_id,
    nullif(trim(coalesce(target_profile ->> 'organization_type', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'legal_name', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'inn', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'ogrn', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'legal_address', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'actual_address', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'restaurant_phone', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'restaurant_email', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'director_full_name', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'representative_full_name', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'authority_basis', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'primary_confirmation_phone', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'primary_confirmation_email', '')), ''),
    nullif(trim(coalesce(target_profile ->> 'delivery_model', '')), ''),
    now()
  )
  on conflict (client_id) do update set
    organization_type = excluded.organization_type,
    legal_name = excluded.legal_name,
    inn = excluded.inn,
    ogrn = excluded.ogrn,
    legal_address = excluded.legal_address,
    actual_address = excluded.actual_address,
    restaurant_phone = excluded.restaurant_phone,
    restaurant_email = excluded.restaurant_email,
    director_full_name = excluded.director_full_name,
    representative_full_name = excluded.representative_full_name,
    authority_basis = excluded.authority_basis,
    primary_confirmation_phone = excluded.primary_confirmation_phone,
    primary_confirmation_email = excluded.primary_confirmation_email,
    delivery_model = excluded.delivery_model,
    updated_at = now();

  update public.restaurant_tariffs
  set status = 'archived', updated_at = now()
  where client_id = target_client_id and status = 'published' and version <> tariff_version;

  insert into public.restaurant_tariffs(
    client_id, name, restaurant_commission_amount, driver_commission_amount,
    starts_at, free_period_terms, commission_rules, individual_terms,
    version, status, published_at, created_by, updated_at
  ) values (
    target_client_id, tariff_name, restaurant_commission, driver_commission,
    tariff_starts_at,
    nullif(trim(coalesce(target_tariff ->> 'free_period_terms', '')), ''),
    nullif(trim(coalesce(target_tariff ->> 'commission_rules', '')), ''),
    nullif(trim(coalesce(target_tariff ->> 'individual_terms', '')), ''),
    tariff_version, 'published', now(), auth.uid(), now()
  )
  on conflict (client_id, version) do update set
    name = excluded.name,
    restaurant_commission_amount = excluded.restaurant_commission_amount,
    driver_commission_amount = excluded.driver_commission_amount,
    starts_at = excluded.starts_at,
    ends_at = null,
    free_period_terms = excluded.free_period_terms,
    commission_rules = excluded.commission_rules,
    individual_terms = excluded.individual_terms,
    status = 'published',
    published_at = now(),
    updated_at = now();

  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id,
    auth.uid(),
    'restaurant.activation.setup_updated',
    'clients',
    target_client_id,
    jsonb_build_object('tariff_version', tariff_version, 'profile_updated', true, 'logo_updated', true)
  );

  return public.get_admin_restaurant_activation_setup(target_client_id);
end;
$$;

revoke all on function public.save_admin_restaurant_activation_setup(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_admin_restaurant_activation_setup(uuid, text, jsonb, jsonb) to authenticated;

create or replace function public.get_current_restaurant_activation_profile_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_client_id uuid := public.current_restaurant_client_id();
  profile_record public.restaurant_legal_profiles;
  tariff_record public.restaurant_tariffs;
begin
  if auth.uid() is null or public.is_platform_admin() or target_client_id is null then raise exception 'access_denied'; end if;
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
