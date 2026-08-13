-- Self-service partner onboarding without phone verification.
-- Phone values are deliberately marked unverified until a separate channel is introduced.

alter table public.clients
  add column if not exists onboarding_source text not null default 'platform_admin',
  add column if not exists review_state text not null default 'approved',
  add column if not exists demo_expires_at timestamptz,
  add column if not exists documents_submitted_at timestamptz,
  add column if not exists review_comment text,
  add column if not exists phone_verified boolean not null default false;

alter table public.clients drop constraint if exists clients_onboarding_source_check;
alter table public.clients add constraint clients_onboarding_source_check
  check (onboarding_source in ('platform_admin', 'self_service'));
alter table public.clients drop constraint if exists clients_review_state_check;
alter table public.clients add constraint clients_review_state_check
  check (review_state in ('draft', 'pending', 'changes_requested', 'approved', 'rejected'));

alter table public.drivers
  add column if not exists onboarding_source text not null default 'platform_admin',
  add column if not exists review_state text not null default 'approved',
  add column if not exists review_comment text,
  add column if not exists residence_place text not null default '',
  add column if not exists transport_type text not null default 'car',
  add column if not exists vehicle_make text not null default '',
  add column if not exists vehicle_model text not null default '',
  add column if not exists vehicle_color text not null default '',
  add column if not exists phone_verified boolean not null default false;

alter table public.drivers drop constraint if exists drivers_onboarding_source_check;
alter table public.drivers add constraint drivers_onboarding_source_check
  check (onboarding_source in ('platform_admin', 'self_service'));
alter table public.drivers drop constraint if exists drivers_review_state_check;
alter table public.drivers add constraint drivers_review_state_check
  check (review_state in ('pending', 'changes_requested', 'approved', 'rejected'));
alter table public.drivers drop constraint if exists drivers_transport_type_check;
alter table public.drivers add constraint drivers_transport_type_check
  check (transport_type in ('car', 'van', 'motorcycle'));

create index if not exists clients_self_service_review_idx
  on public.clients(review_state, created_at desc) where onboarding_source = 'self_service';
create index if not exists drivers_self_service_review_idx
  on public.drivers(review_state, created_at desc) where onboarding_source = 'self_service';

create table if not exists public.partner_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_type text not null check (subject_type in ('seller', 'driver')),
  subject_id uuid not null,
  document_type text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  review_state text not null default 'pending'
    check (review_state in ('pending', 'approved', 'rejected')),
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partner_documents enable row level security;
revoke all on table public.partner_documents from public, anon;
grant select, insert, update on table public.partner_documents to authenticated;
grant all on table public.partner_documents to service_role;
drop policy if exists "partners read own documents" on public.partner_documents;
create policy "partners read own documents" on public.partner_documents
for select to authenticated
using ((select auth.uid()) = owner_user_id or (select public.is_platform_admin()));
drop policy if exists "partners upload own documents" on public.partner_documents;
create policy "partners upload own documents" on public.partner_documents
for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
drop policy if exists "platform admins review partner documents" on public.partner_documents;
create policy "platform admins review partner documents" on public.partner_documents
for update to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-documents', 'partner-documents', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "partners upload private onboarding files" on storage.objects;
create policy "partners upload private onboarding files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'partner-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "partners read private onboarding files" on storage.objects;
create policy "partners read private onboarding files" on storage.objects
for select to authenticated
using (
  bucket_id = 'partner-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_platform_admin()))
);
drop policy if exists "partners replace private onboarding files" on storage.objects;
create policy "partners replace private onboarding files" on storage.objects
for update to authenticated
using (
  bucket_id = 'partner-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'partner-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "partners remove private onboarding files" on storage.objects;
create policy "partners remove private onboarding files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'partner-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.create_self_service_partner(
  requested_user_id uuid,
  requested_email text,
  requested_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := requested_payload ->> 'role';
  requested_name text := trim(coalesce(requested_payload ->> 'name', ''));
  requested_phone text := trim(coalesce(requested_payload ->> 'phone', ''));
  requested_business_type text;
  requested_business_name text;
  requested_slug text;
  template_catalog public.catalogs%rowtype;
  created_catalog_id uuid;
  created_client_id uuid;
  created_public_user_id uuid;
  created_driver_id uuid;
  requested_settlements text[];
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if requested_user_id is null or requested_name = '' or requested_phone = ''
    or requested_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'registration_fields_invalid';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into requested_settlements
  from jsonb_array_elements_text(coalesce(requested_payload -> 'serviceSettlements', '[]'::jsonb));

  insert into public.profiles (id, email, full_name)
  values (requested_user_id, lower(requested_email), requested_name)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;

  if requested_role = 'seller' then
    requested_business_type := coalesce(nullif(requested_payload ->> 'businessType', ''), 'restaurant');
    requested_business_name := trim(coalesce(requested_payload ->> 'businessName', ''));
    if requested_business_name = '' then raise exception 'business_name_required'; end if;
    if not exists (
      select 1 from public.business_types
      where code = requested_business_type and availability = 'active'
    ) then raise exception 'business_type_unavailable'; end if;

    select * into template_catalog
    from public.catalogs
    where is_template and business_type = requested_business_type
    order by created_at
    limit 1;
    if template_catalog.id is null then raise exception 'business_template_unavailable'; end if;

    requested_slug := trim(both '-' from regexp_replace(lower(requested_business_name), '[^a-zа-яё0-9]+', '-', 'gi'));
    if requested_slug = '' then requested_slug := 'business'; end if;
    requested_slug := left(requested_slug, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    created_catalog_id := public.create_restaurant_from_template(
      template_catalog.id,
      requested_business_name,
      requested_slug,
      template_catalog.template_version_id,
      requested_user_id
    );
    update public.catalogs set
      status = 'draft'::public.catalog_status,
      business_type = requested_business_type,
      template_type = requested_business_type,
      updated_at = now()
    where id = created_catalog_id;

    insert into public.catalog_members(catalog_id, user_id, role, can_accept_legal_documents)
    values (created_catalog_id, requested_user_id, 'owner'::public.catalog_role, true)
    on conflict (catalog_id, user_id) do update set role = excluded.role, can_accept_legal_documents = true;

    insert into public.clients(
      owner_user_id, catalog_id, company_name, business_type, template_type,
      owner_name, email, phone, primary_city, service_settlements, status,
      legal_activation_status, demo_mode, plan_code, subscription_status,
      subscription_started_at, subscription_ends_at, first_login,
      onboarding_source, review_state, demo_expires_at, phone_verified, created_by
    ) values (
      requested_user_id, created_catalog_id, requested_business_name, requested_business_type,
      requested_business_type, requested_name, lower(requested_email), requested_phone,
      trim(coalesce(requested_payload ->> 'primaryCity', '')), requested_settlements,
      'pending', 'draft', true, 'demo', 'trial', now(), now() + interval '48 hours',
      true, 'self_service', 'draft', now() + interval '48 hours', false, requested_user_id
    ) returning id into created_client_id;

    insert into public.client_subscriptions(client_id, plan_code, amount, status, started_at, ends_at, note)
    values (created_client_id, 'demo', 0, 'trial', now(), now() + interval '48 hours', 'Саморегистрация: настройка кабинета');

    insert into public.restaurant_legal_profiles(
      client_id, restaurant_phone, restaurant_email, primary_confirmation_phone,
      primary_confirmation_email, setup_checklist
    ) values (
      created_client_id, requested_phone, lower(requested_email), requested_phone,
      lower(requested_email), jsonb_build_object('phone_verified', false, 'onboarding_source', 'self_service')
    ) on conflict (client_id) do nothing;

    return jsonb_build_object(
      'role', 'seller', 'subject_id', created_client_id, 'catalog_id', created_catalog_id,
      'catalog_slug', requested_slug, 'review_state', 'draft',
      'demo_expires_at', now() + interval '48 hours'
    );
  elsif requested_role = 'driver' then
    insert into public.users(auth_user_id, name, phone, email, role)
    values (requested_user_id, requested_name, requested_phone, lower(requested_email), 'driver')
    returning id into created_public_user_id;

    insert into public.drivers(
      user_id, name, phone, email, city_name, service_settlements, vehicle_info,
      car_number, is_active, is_online, status, onboarding_source, review_state,
      residence_place, transport_type, vehicle_make, vehicle_model, vehicle_color,
      phone_verified, legal_activation_status
    ) values (
      created_public_user_id, requested_name, requested_phone, lower(requested_email),
      trim(coalesce(requested_payload ->> 'primaryCity', '')), requested_settlements,
      concat_ws(' ', nullif(requested_payload ->> 'vehicleMake', ''), nullif(requested_payload ->> 'vehicleModel', '')),
      upper(trim(coalesce(requested_payload ->> 'carNumber', ''))), false, false, 'offline',
      'self_service', 'pending', trim(coalesce(requested_payload ->> 'residencePlace', '')),
      coalesce(nullif(requested_payload ->> 'transportType', ''), 'car'),
      trim(coalesce(requested_payload ->> 'vehicleMake', '')),
      trim(coalesce(requested_payload ->> 'vehicleModel', '')),
      trim(coalesce(requested_payload ->> 'vehicleColor', '')), false, 'awaiting_acceptance'
    ) returning id into created_driver_id;

    return jsonb_build_object(
      'role', 'driver', 'subject_id', created_driver_id, 'review_state', 'pending'
    );
  else
    raise exception 'partner_role_invalid';
  end if;
end;
$$;

revoke all on function public.create_self_service_partner(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_self_service_partner(uuid, text, jsonb) to service_role;

create or replace function public.submit_current_seller_application()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_client public.clients%rowtype;
begin
  select * into target_client from public.clients where owner_user_id = auth.uid() for update;
  if not found or target_client.onboarding_source <> 'self_service' then raise exception 'seller_application_not_found'; end if;
  update public.clients set review_state = 'pending', documents_submitted_at = now(), review_comment = null
  where id = target_client.id;
  return jsonb_build_object('client_id', target_client.id, 'review_state', 'pending');
end;
$$;
revoke all on function public.submit_current_seller_application() from public, anon;
grant execute on function public.submit_current_seller_application() to authenticated;

create or replace function public.save_current_seller_legal_profile(requested_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_client public.clients%rowtype;
begin
  select * into target_client from public.clients where owner_user_id = auth.uid() for update;
  if not found or target_client.onboarding_source <> 'self_service' then raise exception 'seller_application_not_found'; end if;
  if trim(coalesce(requested_profile ->> 'inn', '')) !~ '^[0-9]{10}([0-9]{2})?$' then raise exception 'inn_invalid'; end if;

  insert into public.restaurant_legal_profiles(
    client_id, organization_type, legal_name, inn, ogrn, legal_address,
    actual_address, restaurant_phone, restaurant_email, director_full_name,
    representative_full_name, authority_basis, updated_at
  ) values (
    target_client.id, nullif(trim(requested_profile ->> 'organization_type'), ''),
    nullif(trim(requested_profile ->> 'legal_name'), ''), trim(requested_profile ->> 'inn'),
    nullif(trim(requested_profile ->> 'ogrn'), ''), nullif(trim(requested_profile ->> 'legal_address'), ''),
    nullif(trim(requested_profile ->> 'actual_address'), ''),
    coalesce(nullif(trim(requested_profile ->> 'restaurant_phone'), ''), target_client.phone),
    coalesce(nullif(trim(requested_profile ->> 'restaurant_email'), ''), target_client.email),
    nullif(trim(requested_profile ->> 'director_full_name'), ''),
    nullif(trim(requested_profile ->> 'representative_full_name'), ''),
    nullif(trim(requested_profile ->> 'authority_basis'), ''), now()
  ) on conflict (client_id) do update set
    organization_type = excluded.organization_type, legal_name = excluded.legal_name,
    inn = excluded.inn, ogrn = excluded.ogrn, legal_address = excluded.legal_address,
    actual_address = excluded.actual_address, restaurant_phone = excluded.restaurant_phone,
    restaurant_email = excluded.restaurant_email, director_full_name = excluded.director_full_name,
    representative_full_name = excluded.representative_full_name,
    authority_basis = excluded.authority_basis, updated_at = now();

  return jsonb_build_object('client_id', target_client.id, 'saved', true);
end;
$$;
revoke all on function public.save_current_seller_legal_profile(jsonb) from public, anon;
grant execute on function public.save_current_seller_legal_profile(jsonb) to authenticated;

create or replace function public.sync_self_service_review_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'clients'
    and new.onboarding_source = 'self_service'
    and new.status = 'active'
    and old.status is distinct from new.status
  then
    new.review_state := 'approved';
    new.review_comment := null;
  elsif tg_table_name = 'drivers'
    and new.onboarding_source = 'self_service'
    and new.is_active
    and old.is_active is distinct from new.is_active
  then
    new.review_state := 'approved';
    new.review_comment := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_sync_self_service_review_approval on public.clients;
create trigger clients_sync_self_service_review_approval
before update of status on public.clients
for each row execute function public.sync_self_service_review_approval();

drop trigger if exists drivers_sync_self_service_review_approval on public.drivers;
create trigger drivers_sync_self_service_review_approval
before update of is_active on public.drivers
for each row execute function public.sync_self_service_review_approval();

notify pgrst, 'reload schema';
