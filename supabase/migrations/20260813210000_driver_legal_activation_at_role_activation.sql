-- A driver accepts the offer and personal-data terms only in their own activation flow.
-- Existing production drivers are grandfathered without fabricating consent evidence.

alter table public.drivers
  add column if not exists legal_activation_status text,
  add column if not exists legal_activation_status_changed_at timestamptz not null default now(),
  add column if not exists legal_activated_at timestamptz;

update public.drivers
set legal_activation_status = 'legacy_active',
    legal_activation_status_changed_at = now()
where legal_activation_status is null;

alter table public.drivers
  alter column legal_activation_status set default 'awaiting_acceptance',
  alter column legal_activation_status set not null;

alter table public.drivers drop constraint if exists drivers_legal_activation_status_check;
alter table public.drivers add constraint drivers_legal_activation_status_check check (
  legal_activation_status in ('awaiting_acceptance', 'active', 'legacy_active')
);

create index if not exists drivers_legal_activation_status_idx
  on public.drivers(legal_activation_status, legal_activation_status_changed_at desc);

create or replace function public.get_current_driver_legal_activation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_driver public.drivers%rowtype;
begin
  if viewer_driver_id is null then raise exception 'driver_authentication_required'; end if;

  select * into target_driver
  from public.drivers
  where id = viewer_driver_id;

  if not found then raise exception 'driver_not_found'; end if;

  return jsonb_build_object(
    'driver_id', target_driver.id,
    'status', target_driver.legal_activation_status,
    'activated_at', target_driver.legal_activated_at
  );
end;
$$;

create or replace function public.activate_current_driver(target_confirmations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_driver public.drivers%rowtype;
  accepted_at timestamptz := now();
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  consent_evidence jsonb;
begin
  if viewer_driver_id is null then raise exception 'driver_authentication_required'; end if;
  if coalesce(target_confirmations ->> 'offer', '') <> 'true'
    or coalesce(target_confirmations ->> 'personal_data', '') <> 'true'
    or coalesce(target_confirmations ->> 'location', '') <> 'true'
  then
    raise exception 'driver_activation_confirmations_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(viewer_driver_id::text, 0));

  select * into target_driver
  from public.drivers
  where id = viewer_driver_id
  for update;

  if not found then raise exception 'driver_not_found'; end if;

  if target_driver.legal_activation_status = 'active' then
    return jsonb_build_object(
      'driver_id', target_driver.id,
      'status', target_driver.legal_activation_status,
      'activated_at', target_driver.legal_activated_at
    );
  end if;

  consent_evidence := jsonb_build_object(
    'captured_by', 'authenticated_driver_activation',
    'confirmations', target_confirmations,
    'user_agent', left(coalesce(request_headers ->> 'user-agent', ''), 512)
  );

  insert into public.legal_consent_records(
    subject_type, subject_id, auth_user_id, document_code, document_version,
    document_sha256, granted, source, granted_at, evidence
  )
  select
    'driver', viewer_driver_id, auth.uid(), 'driver_offer', '2.0',
    '0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f',
    true, 'driver_activation', accepted_at, consent_evidence
  where not exists (
    select 1 from public.legal_consent_records
    where subject_type = 'driver'
      and subject_id = viewer_driver_id
      and document_code = 'driver_offer'
      and document_version = '2.0'
      and document_sha256 = '0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f'
      and granted
      and revoked_at is null
  );

  insert into public.legal_consent_records(
    subject_type, subject_id, auth_user_id, document_code, document_version,
    document_sha256, granted, source, granted_at, evidence
  )
  select
    'driver', viewer_driver_id, auth.uid(), 'driver_consent', '1.0',
    'd69209f4c9829694f512d4da6c0947d6a5bbaf0d5c15b84068d42360d9bdbb39',
    true, 'driver_activation', accepted_at, consent_evidence
  where not exists (
    select 1 from public.legal_consent_records
    where subject_type = 'driver'
      and subject_id = viewer_driver_id
      and document_code = 'driver_consent'
      and document_version = '1.0'
      and document_sha256 = 'd69209f4c9829694f512d4da6c0947d6a5bbaf0d5c15b84068d42360d9bdbb39'
      and granted
      and revoked_at is null
  );

  update public.drivers
  set legal_activation_status = 'active',
      legal_activation_status_changed_at = accepted_at,
      legal_activated_at = accepted_at,
      updated_at = accepted_at
  where id = viewer_driver_id
  returning * into target_driver;

  return jsonb_build_object(
    'driver_id', target_driver.id,
    'status', target_driver.legal_activation_status,
    'activated_at', target_driver.legal_activated_at
  );
end;
$$;

revoke all on function public.get_current_driver_legal_activation() from public, anon;
grant execute on function public.get_current_driver_legal_activation() to authenticated;
revoke all on function public.activate_current_driver(jsonb) from public, anon;
grant execute on function public.activate_current_driver(jsonb) to authenticated;

notify pgrst, 'reload schema';
