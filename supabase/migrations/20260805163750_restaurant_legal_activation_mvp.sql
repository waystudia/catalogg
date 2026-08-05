-- Restaurant legal activation walking skeleton.
-- Additive only. Applying this migration intentionally puts every existing
-- restaurant back into legal review; there is no legacy order bypass.

create extension if not exists pgcrypto;

alter table public.clients
  add column if not exists legal_activation_status text not null default 'draft',
  add column if not exists legal_activation_status_changed_at timestamptz not null default now(),
  add column if not exists activated_at timestamptz,
  add column if not exists demo_mode boolean not null default false;

alter table public.clients drop constraint if exists clients_legal_activation_status_check;
alter table public.clients add constraint clients_legal_activation_status_check check (
  legal_activation_status in (
    'draft', 'configured', 'awaiting_acceptance', 'active', 'suspended',
    'terminated', 'archived', 'legacy_review_required', 'reacceptance_required'
  )
);

alter table public.catalog_members
  add column if not exists can_accept_legal_documents boolean not null default false;

update public.catalog_members
set can_accept_legal_documents = true
where role = 'owner'::public.catalog_role;

-- The user explicitly requires every pre-existing restaurant to pass the same
-- setup and acceptance path. They are not silently grandfathered as active.
update public.clients
set legal_activation_status = 'legacy_review_required',
    legal_activation_status_changed_at = now(),
    activated_at = null
where legal_activation_status <> 'legacy_review_required';

update public.catalogs catalog
set status = 'draft'::public.catalog_status
where exists (
  select 1 from public.clients client where client.catalog_id = catalog.id
);

create table if not exists public.restaurant_legal_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  organization_type text,
  legal_name text,
  inn text,
  ogrn text,
  legal_address text,
  actual_address text,
  restaurant_phone text,
  restaurant_email text,
  director_full_name text,
  representative_full_name text,
  authority_basis text,
  payment_receiver text,
  receipt_issuer text,
  delivery_model text,
  has_own_couriers boolean not null default false,
  uses_wayyaam_drivers boolean not null default false,
  primary_confirmation_phone text,
  primary_confirmation_email text,
  setup_checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_tariffs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  restaurant_commission_amount numeric(12,2) not null default 30 check (restaurant_commission_amount >= 0),
  driver_commission_amount numeric(12,2) not null default 30 check (driver_commission_amount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  free_period_terms text,
  commission_rules text,
  count_cancelled_orders boolean not null default false,
  count_test_orders boolean not null default false,
  individual_terms text,
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, version)
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in (
    'restaurant_contract', 'tariff', 'restaurant_regulation', 'order_rules',
    'privacy_policy', 'cookie_policy', 'cabinet_terms', 'content_license',
    'delivery_rules', 'marketing_consent'
  )),
  title text not null,
  version text not null,
  content_html text not null default '',
  pdf_url text,
  file_name text,
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  requires_reacceptance boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_type, version)
);

create table if not exists public.legal_document_bundles (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  effective_from timestamptz,
  effective_to timestamptz,
  requires_reacceptance boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.legal_document_bundle_items (
  bundle_id uuid not null references public.legal_document_bundles(id) on delete restrict,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  sort_order integer not null default 0,
  required boolean not null default true,
  primary key (bundle_id, document_id)
);

create table if not exists public.restaurant_document_open_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  bundle_id uuid not null references public.legal_document_bundles(id) on delete restrict,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  opened_at timestamptz not null default now()
);

create table if not exists public.restaurant_activation_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  bundle_id uuid not null references public.legal_document_bundles(id) on delete restrict,
  status text not null default 'awaiting_manual_code' check (
    status in ('awaiting_manual_code', 'code_issued', 'confirmed', 'expired', 'cancelled')
  ),
  confirmation_method text not null default 'manual_code' check (confirmation_method in ('manual_code', 'email', 'sms')),
  confirmation_destination_masked text,
  checkboxes_json jsonb not null,
  marketing_consents_json jsonb not null default '{}'::jsonb,
  documents_opened_json jsonb not null default '[]'::jsonb,
  idempotency_key uuid not null,
  session_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  code_issued_at timestamptz,
  confirmed_at timestamptz,
  unique (client_id, user_id, idempotency_key)
);

create table if not exists public.confirmation_codes (
  id uuid primary key default gen_random_uuid(),
  activation_request_id uuid not null references public.restaurant_activation_requests(id) on delete restrict,
  code_hash text not null,
  attempts_count integer not null default 0 check (attempts_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  resend_available_at timestamptz not null default (now() + interval '60 seconds'),
  locked_until timestamptz,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.clients(id) on delete restrict,
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  activation_request_id uuid not null unique references public.restaurant_activation_requests(id) on delete restrict,
  representative_full_name text,
  representative_role text,
  authority_basis text,
  phone text,
  email text,
  document_bundle_id uuid not null references public.legal_document_bundles(id) on delete restrict,
  contract_version text,
  tariff_version text,
  regulation_version text,
  privacy_policy_version text,
  content_rules_version text,
  accepted_at timestamptz not null,
  confirmed_at timestamptz not null,
  ip_address inet,
  user_agent text,
  device_type text,
  browser text,
  operating_system text,
  session_id text,
  confirmation_method text not null,
  confirmation_destination_masked text,
  checkboxes_json jsonb not null,
  documents_opened_json jsonb not null,
  restaurant_snapshot_json jsonb not null,
  tariff_snapshot_json jsonb not null,
  document_hashes_json jsonb not null,
  acceptance_hash text not null unique check (acceptance_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  superseded_by_acceptance_id uuid references public.legal_acceptances(id) on delete restrict
);

create table if not exists public.legal_acceptance_documents (
  acceptance_id uuid not null references public.legal_acceptances(id) on delete restrict,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  document_type text not null,
  title text not null,
  version text not null,
  file_hash text not null,
  primary key (acceptance_id, document_id)
);

alter table public.clients
  add column if not exists active_acceptance_id uuid references public.legal_acceptances(id) on delete restrict;

create index if not exists clients_legal_activation_status_idx
  on public.clients(legal_activation_status, legal_activation_status_changed_at desc);
create index if not exists restaurant_tariffs_current_idx
  on public.restaurant_tariffs(client_id, status, starts_at desc);
create index if not exists legal_documents_published_idx
  on public.legal_documents(document_type, status, effective_from desc);
create index if not exists legal_bundle_items_bundle_idx
  on public.legal_document_bundle_items(bundle_id, sort_order);
create index if not exists restaurant_document_open_user_idx
  on public.restaurant_document_open_events(client_id, user_id, bundle_id, opened_at desc);
create index if not exists restaurant_activation_requests_status_idx
  on public.restaurant_activation_requests(status, created_at desc);
create index if not exists confirmation_codes_request_idx
  on public.confirmation_codes(activation_request_id, created_at desc);
create index if not exists legal_acceptances_restaurant_idx
  on public.legal_acceptances(restaurant_id, accepted_at desc);

alter table public.restaurant_legal_profiles enable row level security;
alter table public.restaurant_tariffs enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_document_bundles enable row level security;
alter table public.legal_document_bundle_items enable row level security;
alter table public.restaurant_document_open_events enable row level security;
alter table public.restaurant_activation_requests enable row level security;
alter table public.confirmation_codes enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.legal_acceptance_documents enable row level security;

revoke all on public.restaurant_legal_profiles from public, anon, authenticated;
revoke all on public.restaurant_tariffs from public, anon, authenticated;
revoke all on public.legal_documents from public, anon, authenticated;
revoke all on public.legal_document_bundles from public, anon, authenticated;
revoke all on public.legal_document_bundle_items from public, anon, authenticated;
revoke all on public.restaurant_document_open_events from public, anon, authenticated;
revoke all on public.restaurant_activation_requests from public, anon, authenticated;
revoke all on public.confirmation_codes from public, anon, authenticated;
revoke all on public.legal_acceptances from public, anon, authenticated;
revoke all on public.legal_acceptance_documents from public, anon, authenticated;

create or replace function public.prevent_legal_acceptance_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'legal_record_is_append_only';
end;
$$;

drop trigger if exists legal_acceptances_append_only on public.legal_acceptances;
create trigger legal_acceptances_append_only
before update or delete on public.legal_acceptances
for each row execute function public.prevent_legal_acceptance_mutation();

drop trigger if exists legal_acceptance_documents_append_only on public.legal_acceptance_documents;
create trigger legal_acceptance_documents_append_only
before update or delete on public.legal_acceptance_documents
for each row execute function public.prevent_legal_acceptance_mutation();

drop trigger if exists published_legal_documents_immutable on public.legal_documents;
create trigger published_legal_documents_immutable
before update or delete on public.legal_documents
for each row when (old.status = 'published')
execute function public.prevent_legal_acceptance_mutation();

create or replace function public.can_catalog_accept_real_orders(target_catalog_id uuid)
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
      and client.legal_activation_status = 'active'
      and client.status = 'active'
  );
$$;

revoke all on function public.can_catalog_accept_real_orders(uuid) from public;
grant execute on function public.can_catalog_accept_real_orders(uuid) to anon, authenticated;

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
      and public.can_catalog_accept_real_orders(catalog.id)
  );
$$;

revoke all on function public.is_catalog_published(uuid) from public;
grant execute on function public.is_catalog_published(uuid) to anon, authenticated;

drop policy if exists "catalogs public read published" on public.catalogs;
create policy "catalogs public read published" on public.catalogs
for select
using (
  (
    status = 'published'
    and is_template = false
    and public.can_catalog_accept_real_orders(id)
  )
  or is_template = true
  or public.is_platform_admin()
  or public.is_catalog_member(id, array['owner','admin','editor','viewer']::public.catalog_role[])
);

drop policy if exists "restaurants public read active" on public.restaurants;
create policy "restaurants public read active" on public.restaurants
for select
using (
  (is_active and catalog_id is not null and public.can_catalog_accept_real_orders(catalog_id))
  or public.is_platform_admin()
  or (
    catalog_id is not null
    and public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
);

create or replace function public.enforce_restaurant_order_activation_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_catalog_accept_real_orders(new.catalog_id) then
    raise exception 'restaurant_activation_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_active_restaurant on public.orders;
create trigger orders_require_active_restaurant
before insert on public.orders
for each row execute function public.enforce_restaurant_order_activation_gate();

create or replace function public.current_restaurant_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client.id
  from public.clients client
  left join public.catalog_members member
    on member.catalog_id = client.catalog_id
   and member.user_id = auth.uid()
  where client.owner_user_id = auth.uid() or member.user_id = auth.uid()
  order by (client.owner_user_id = auth.uid()) desc, client.created_at
  limit 1;
$$;

revoke all on function public.current_restaurant_client_id() from public;

create or replace function public.resolve_current_login_redirect()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  viewer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_slug text;
  target_legal_status text;
begin
  if viewer_user_id is null then return null; end if;
  if public.current_driver_id() is not null then return '/driver'; end if;

  select catalog.slug, client.legal_activation_status
  into target_slug, target_legal_status
  from public.clients client
  join public.catalogs catalog on catalog.id = client.catalog_id
  where client.owner_user_id = viewer_user_id
     or (viewer_email <> '' and lower(client.email) = viewer_email)
  order by (client.owner_user_id = viewer_user_id) desc
  limit 1;

  if target_slug is not null then
    if target_legal_status <> 'active' then return '/restaurant/activation'; end if;
    return '/' || target_slug || '/dashboard';
  end if;

  select catalog.slug, client.legal_activation_status
  into target_slug, target_legal_status
  from public.catalog_members member
  join public.catalogs catalog on catalog.id = member.catalog_id
  join public.clients client on client.catalog_id = catalog.id
  where member.user_id = viewer_user_id
  order by catalog.created_at
  limit 1;

  if target_slug is not null then
    if target_legal_status <> 'active' then return '/restaurant/activation'; end if;
    return '/' || target_slug || '/dashboard';
  end if;

  if public.is_platform_admin() then return '/admin'; end if;
  if exists (select 1 from public.admin_user admin where admin.user_id = viewer_user_id) then
    return '/mangal/dashboard';
  end if;
  return '/';
end;
$$;

revoke all on function public.resolve_current_login_redirect() from public, anon;
grant execute on function public.resolve_current_login_redirect() to authenticated;

create or replace function public.current_published_legal_bundle_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select bundle.id
  from public.legal_document_bundles bundle
  where bundle.status = 'published'
    and coalesce(bundle.effective_from, '-infinity'::timestamptz) <= now()
    and coalesce(bundle.effective_to, 'infinity'::timestamptz) > now()
    and not exists (
      select 1
      from unnest(array[
        'restaurant_contract', 'tariff', 'restaurant_regulation', 'order_rules',
        'privacy_policy', 'cabinet_terms', 'content_license'
      ]) required_type
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
  limit 1;
$$;

revoke all on function public.current_published_legal_bundle_id() from public;

create or replace function public.restaurant_activation_missing_requirements(target_client_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  missing text[] := '{}'::text[];
  target_catalog_id uuid;
begin
  select catalog_id into target_catalog_id from public.clients where id = target_client_id;
  if target_catalog_id is null then return array['restaurant_not_found']; end if;

  if not exists (select 1 from public.clients where id = target_client_id and owner_user_id is not null) then
    missing := array_append(missing, 'owner_account');
  end if;
  if not exists (
    select 1 from public.restaurant_legal_profiles profile
    where profile.client_id = target_client_id
      and nullif(trim(coalesce(profile.legal_name, '')), '') is not null
      and nullif(trim(coalesce(profile.representative_full_name, '')), '') is not null
      and nullif(trim(coalesce(profile.authority_basis, '')), '') is not null
  ) then
    missing := array_append(missing, 'legal_profile');
  end if;
  if not exists (
    select 1 from public.restaurant_legal_profiles profile
    where profile.client_id = target_client_id
      and (
        nullif(trim(coalesce(profile.primary_confirmation_phone, '')), '') is not null
        or nullif(trim(coalesce(profile.primary_confirmation_email, '')), '') is not null
      )
  ) then
    missing := array_append(missing, 'confirmation_destination');
  end if;
  if not exists (
    select 1 from public.restaurant_tariffs tariff
    where tariff.client_id = target_client_id
      and tariff.status = 'published'
      and coalesce(tariff.starts_at, '-infinity'::timestamptz) <= now()
      and coalesce(tariff.ends_at, 'infinity'::timestamptz) > now()
  ) then
    missing := array_append(missing, 'published_tariff');
  end if;
  if public.current_published_legal_bundle_id() is null then
    missing := array_append(missing, 'published_document_bundle');
  end if;
  if not exists (select 1 from public.catalogs where id = target_catalog_id and nullif(trim(logo_url), '') is not null) then
    missing := array_append(missing, 'logo');
  end if;
  if not exists (select 1 from public.categories where catalog_id = target_catalog_id) then
    missing := array_append(missing, 'categories');
  end if;
  if not exists (select 1 from public.products where catalog_id = target_catalog_id) then
    missing := array_append(missing, 'products');
  end if;
  return missing;
end;
$$;

revoke all on function public.restaurant_activation_missing_requirements(uuid) from public;

create or replace function public.finish_restaurant_legal_setup(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  missing text[];
  target_catalog_id uuid;
  bundle_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'access_denied'; end if;
  select catalog_id into target_catalog_id from public.clients where id = target_client_id for update;
  if target_catalog_id is null then raise exception 'restaurant_not_found'; end if;
  missing := public.restaurant_activation_missing_requirements(target_client_id);
  if cardinality(missing) > 0 then
    return jsonb_build_object('ready', false, 'missing', to_jsonb(missing));
  end if;
  bundle_id := public.current_published_legal_bundle_id();
  update public.clients
  set legal_activation_status = 'awaiting_acceptance',
      legal_activation_status_changed_at = now(),
      activated_at = null,
      active_acceptance_id = null
  where id = target_client_id;
  update public.catalogs set status = 'draft'::public.catalog_status where id = target_catalog_id;
  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (target_catalog_id, auth.uid(), 'restaurant.activation.awaiting_acceptance', 'clients', target_client_id,
    jsonb_build_object('bundle_id', bundle_id));
  return jsonb_build_object('ready', true, 'missing', '[]'::jsonb, 'bundle_id', bundle_id,
    'legal_status', 'awaiting_acceptance');
end;
$$;

revoke all on function public.finish_restaurant_legal_setup(uuid) from public, anon;
grant execute on function public.finish_restaurant_legal_setup(uuid) to authenticated;

create or replace function public.get_admin_restaurant_activations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'access_denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', client.id,
    'catalog_id', client.catalog_id,
    'restaurant_name', client.company_name,
    'owner_name', client.owner_name,
    'phone', client.phone,
    'legal_status', client.legal_activation_status,
    'bundle_version', bundle.version,
    'accepted_at', acceptance.accepted_at,
    'confirmation_method', acceptance.confirmation_method,
    'pending_request_id', request.id,
    'missing_setup', to_jsonb(public.restaurant_activation_missing_requirements(client.id))
  ) order by client.created_at desc), '[]'::jsonb)
  into result
  from public.clients client
  left join public.legal_acceptances acceptance on acceptance.id = client.active_acceptance_id
  left join public.legal_document_bundles bundle on bundle.id = acceptance.document_bundle_id
  left join lateral (
    select activation.id
    from public.restaurant_activation_requests activation
    where activation.client_id = client.id and activation.status in ('awaiting_manual_code', 'code_issued')
    order by activation.created_at desc limit 1
  ) request on true;
  return result;
end;
$$;

revoke all on function public.get_admin_restaurant_activations() from public, anon;
grant execute on function public.get_admin_restaurant_activations() to authenticated;

create or replace function public.mask_activation_destination(raw_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when raw_value is null or trim(raw_value) = '' then null
    when position('@' in raw_value) > 1 then left(split_part(raw_value, '@', 1), 1) || '***@' || split_part(raw_value, '@', 2)
    when length(regexp_replace(raw_value, '\D', '', 'g')) >= 4 then
      '+* *** ***-' || right(regexp_replace(raw_value, '\D', '', 'g'), 4)
    else '***'
  end;
$$;

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
      not public.is_platform_admin()
      and (member_record.role = 'owner'::public.catalog_role or coalesce(member_record.can_accept_legal_documents, false))
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

create or replace function public.mark_restaurant_activation_document_opened(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client_id uuid := public.current_restaurant_client_id();
  target_bundle_id uuid := public.current_published_legal_bundle_id();
  target_catalog_id uuid;
begin
  if auth.uid() is null or target_client_id is null or target_bundle_id is null then raise exception 'access_denied'; end if;
  if not exists (
    select 1 from public.legal_document_bundle_items item
    join public.legal_documents document on document.id = item.document_id
    where item.bundle_id = target_bundle_id and item.document_id = target_document_id and document.status = 'published'
  ) then raise exception 'document_not_in_current_bundle'; end if;
  select catalog_id into target_catalog_id from public.clients where id = target_client_id;
  insert into public.restaurant_document_open_events(client_id, user_id, bundle_id, document_id)
  values (target_client_id, auth.uid(), target_bundle_id, target_document_id);
  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (target_catalog_id, auth.uid(), 'restaurant.activation.document_opened', 'legal_documents', target_document_id,
    jsonb_build_object('bundle_id', target_bundle_id));
end;
$$;

revoke all on function public.mark_restaurant_activation_document_opened(uuid) from public, anon;
grant execute on function public.mark_restaurant_activation_document_opened(uuid) to authenticated;

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
  if viewer_user_id is null or public.is_platform_admin() then raise exception 'access_denied'; end if;
  select * into target_client from public.clients where id = public.current_restaurant_client_id() for update;
  if target_client.id is null then raise exception 'restaurant_not_found'; end if;
  select role, can_accept_legal_documents into member_record from public.catalog_members
  where catalog_id = target_client.catalog_id and user_id = viewer_user_id;
  if member_record.role <> 'owner'::public.catalog_role and not coalesce(member_record.can_accept_legal_documents, false) then
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

create or replace function public.admin_issue_restaurant_activation_code(target_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_request public.restaurant_activation_requests;
  latest_code public.confirmation_codes;
  random_bytes bytea := gen_random_bytes(4);
  generated_code text;
  expires_at_value timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'access_denied'; end if;
  select * into target_request from public.restaurant_activation_requests where id = target_request_id for update;
  if target_request.id is null or target_request.status not in ('awaiting_manual_code', 'code_issued') then
    raise exception 'activation_request_not_issuable';
  end if;
  select * into latest_code from public.confirmation_codes
  where activation_request_id = target_request_id and invalidated_at is null and used_at is null
  order by created_at desc limit 1 for update;
  if latest_code.id is not null and latest_code.resend_available_at > now() then
    raise exception 'confirmation_code_cooldown';
  end if;
  update public.confirmation_codes set invalidated_at = now()
  where activation_request_id = target_request_id and invalidated_at is null and used_at is null;
  generated_code := lpad(((
    get_byte(random_bytes, 0) * 16777216 + get_byte(random_bytes, 1) * 65536
    + get_byte(random_bytes, 2) * 256 + get_byte(random_bytes, 3)
  ) % 1000000)::text, 6, '0');
  insert into public.confirmation_codes(
    activation_request_id, code_hash, expires_at, resend_available_at, created_by
  ) values (
    target_request_id,
    crypt(generated_code, gen_salt('bf', 10)),
    expires_at_value,
    now() + interval '60 seconds',
    auth.uid()
  );
  update public.restaurant_activation_requests
  set status = 'code_issued', code_issued_at = now()
  where id = target_request_id;
  insert into public.audit_logs(catalog_id, actor_id, action, entity_table, entity_id, payload)
  select client.catalog_id, auth.uid(), 'restaurant.activation.code_issued', 'restaurant_activation_requests',
    target_request_id, jsonb_build_object('method', 'manual_code', 'expires_at', expires_at_value)
  from public.clients client where client.id = target_request.client_id;
  return jsonb_build_object(
    'request_id', target_request_id,
    'code', generated_code,
    'expires_at', expires_at_value,
    'destination_masked', target_request.confirmation_destination_masked
  );
end;
$$;

revoke all on function public.admin_issue_restaurant_activation_code(uuid) from public, anon;
grant execute on function public.admin_issue_restaurant_activation_code(uuid) to authenticated;

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
  if viewer_user_id is null or public.is_platform_admin() then raise exception 'access_denied'; end if;
  select * into target_request from public.restaurant_activation_requests
  where id = target_request_id and user_id = viewer_user_id for update;
  if target_request.id is null then raise exception 'activation_request_not_found'; end if;
  if target_request.status = 'confirmed' then
    select id into existing_acceptance_id from public.legal_acceptances where activation_request_id = target_request.id;
    return jsonb_build_object('ok', true, 'acceptance_id', existing_acceptance_id, 'legal_status', 'active');
  end if;
  select * into target_client from public.clients where id = target_request.client_id for update;
  select role, can_accept_legal_documents into member_record from public.catalog_members
  where catalog_id = target_client.catalog_id and user_id = viewer_user_id;
  if member_record.role <> 'owner'::public.catalog_role and not coalesce(member_record.can_accept_legal_documents, false) then
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
    member_record.role::text,
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
