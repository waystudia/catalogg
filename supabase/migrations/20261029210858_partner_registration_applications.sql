create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  application_kind text not null check (application_kind in ('restaurant', 'shop', 'courier')),
  applicant_name text not null,
  applicant_phone text not null,
  applicant_email text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  accepted_terms_at timestamptz not null,
  source text not null default 'client_platform',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_applications_status_created_idx
  on public.partner_applications(status, created_at desc);

create index if not exists partner_applications_email_kind_idx
  on public.partner_applications(lower(applicant_email), application_kind, created_at desc);

alter table public.partner_applications enable row level security;

revoke all on table public.partner_applications from public, anon, authenticated;
grant select, update on table public.partner_applications to authenticated;

drop policy if exists "platform admins read partner applications" on public.partner_applications;
create policy "platform admins read partner applications"
on public.partner_applications
for select
to authenticated
using ((select public.is_platform_admin()));

drop policy if exists "platform admins update partner applications" on public.partner_applications;
create policy "platform admins update partner applications"
on public.partner_applications
for update
to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

create or replace function public.submit_partner_application(
  p_application_kind text,
  p_applicant_name text,
  p_applicant_phone text,
  p_applicant_email text,
  p_details jsonb,
  p_accepted_terms boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_name text := trim(coalesce(p_applicant_name, ''));
  normalized_phone text := trim(coalesce(p_applicant_phone, ''));
  normalized_email text := lower(trim(coalesce(p_applicant_email, '')));
  application_id uuid;
begin
  if p_application_kind not in ('restaurant', 'shop', 'courier') then
    raise exception 'invalid_application_kind';
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'invalid_applicant_name';
  end if;
  if normalized_phone !~ '^\+?[0-9 ()-]{10,24}$' then
    raise exception 'invalid_applicant_phone';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(normalized_email) > 160 then
    raise exception 'invalid_applicant_email';
  end if;
  if p_accepted_terms is not true then
    raise exception 'terms_are_required';
  end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_application_details';
  end if;

  select id into application_id
  from public.partner_applications
  where application_kind = p_application_kind
    and lower(applicant_email) = normalized_email
    and status in ('pending', 'reviewing')
    and created_at > now() - interval '15 minutes'
  order by created_at desc
  limit 1;

  if application_id is not null then
    return application_id;
  end if;

  insert into public.partner_applications (
    application_kind,
    applicant_name,
    applicant_phone,
    applicant_email,
    details,
    accepted_terms_at
  ) values (
    p_application_kind,
    normalized_name,
    normalized_phone,
    normalized_email,
    coalesce(p_details, '{}'::jsonb),
    now()
  )
  returning id into application_id;

  return application_id;
end;
$$;

revoke all on function public.submit_partner_application(text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_partner_application(text, text, text, text, jsonb, boolean) to anon, authenticated;

comment on function public.submit_partner_application(text, text, text, text, jsonb, boolean) is
  'Public validated intake endpoint. It exposes no application rows and returns only the new or recent matching application id.';
