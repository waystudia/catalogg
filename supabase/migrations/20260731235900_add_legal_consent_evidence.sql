-- Versioned, server-side evidence for legal confirmations.
-- Deploy only after moving the primary database to the approved Russian contour.

create table if not exists public.legal_consent_records (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('client', 'restaurant_representative', 'driver')),
  subject_id uuid not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  document_code text not null check (document_code in (
    'user_agreement', 'client_consent', 'restaurant_consent', 'driver_consent',
    'advertising_consent', 'order_transfer_consent', 'restaurant_offer', 'driver_offer'
  )),
  document_version text not null,
  document_sha256 text not null,
  granted boolean not null,
  source text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);

create index if not exists legal_consent_records_subject_idx
  on public.legal_consent_records(subject_type, subject_id, document_code, created_at desc);

alter table public.legal_consent_records enable row level security;
revoke all on public.legal_consent_records from public, anon, authenticated;

create or replace function public.record_client_legal_consent(
  client_session_token text,
  target_document_code text,
  target_document_version text,
  target_document_sha256 text,
  target_granted boolean,
  target_source text default 'client_registration'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_account_id uuid;
  record_id uuid;
begin
  if target_document_code not in ('user_agreement', 'client_consent', 'advertising_consent', 'order_transfer_consent') then
    raise exception 'legal_document_not_allowed';
  end if;
  if length(target_document_version) > 32 or length(target_document_sha256) <> 64 then
    raise exception 'legal_document_version_invalid';
  end if;

  select account_id into target_account_id
  from public.client_account_sessions
  where token_hash = digest(convert_to(client_session_token, 'UTF8'), 'sha256')
    and expires_at > now()
  limit 1;

  if target_account_id is null then raise exception 'client_session_invalid'; end if;

  insert into public.legal_consent_records(
    subject_type, subject_id, document_code, document_version, document_sha256,
    granted, source, granted_at, revoked_at, evidence
  ) values (
    'client', target_account_id, target_document_code, target_document_version, lower(target_document_sha256),
    target_granted, left(target_source, 80), case when target_granted then now() end,
    case when target_granted then null else now() end,
    jsonb_build_object('captured_by', 'client_session')
  ) returning id into record_id;
  return record_id;
end;
$$;

revoke all on function public.record_client_legal_consent(text, text, text, text, boolean, text) from public;
grant execute on function public.record_client_legal_consent(text, text, text, text, boolean, text) to anon, authenticated;

create or replace function public.record_authenticated_legal_consent(
  target_subject_type text,
  target_subject_id uuid,
  target_document_code text,
  target_document_version text,
  target_document_sha256 text,
  target_granted boolean,
  target_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare record_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if target_subject_type not in ('restaurant_representative', 'driver') then raise exception 'subject_type_invalid'; end if;
  if target_document_code not in ('restaurant_consent', 'driver_consent', 'restaurant_offer', 'driver_offer', 'advertising_consent') then
    raise exception 'legal_document_not_allowed';
  end if;
  if length(target_document_version) > 32 or length(target_document_sha256) <> 64 then raise exception 'legal_document_version_invalid'; end if;

  -- The caller may record only their own mapped restaurant/driver identity.
  if target_subject_type = 'driver' and not exists (
    select 1 from public.drivers d where d.id = target_subject_id and d.user_id = auth.uid()
  ) then raise exception 'subject_access_denied'; end if;
  if target_subject_type = 'restaurant_representative' and not exists (
    select 1 from public.catalog_members cm where cm.catalog_id = target_subject_id and cm.user_id = auth.uid()
  ) then raise exception 'subject_access_denied'; end if;

  insert into public.legal_consent_records(
    subject_type, subject_id, auth_user_id, document_code, document_version,
    document_sha256, granted, source, granted_at, revoked_at, evidence
  ) values (
    target_subject_type, target_subject_id, auth.uid(), target_document_code, target_document_version,
    lower(target_document_sha256), target_granted, left(target_source, 80),
    case when target_granted then now() end, case when target_granted then null else now() end,
    jsonb_build_object('captured_by', 'authenticated_user')
  ) returning id into record_id;
  return record_id;
end;
$$;

revoke all on function public.record_authenticated_legal_consent(text, uuid, text, text, text, boolean, text) from public;
grant execute on function public.record_authenticated_legal_consent(text, uuid, text, text, text, boolean, text) to authenticated;

