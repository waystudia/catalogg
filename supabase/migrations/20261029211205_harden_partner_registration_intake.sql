revoke all on table public.partner_applications from public, anon, authenticated;
grant insert on table public.partner_applications to anon, authenticated;
grant select, update on table public.partner_applications to authenticated;

drop policy if exists "public submits partner applications" on public.partner_applications;
create policy "public submits partner applications"
on public.partner_applications
for insert
to anon, authenticated
with check (
  status = 'pending'
  and source = 'client_platform'
  and char_length(trim(applicant_name)) between 3 and 120
  and applicant_phone ~ '^\+?[0-9 ()-]{10,24}$'
  and applicant_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and jsonb_typeof(details) = 'object'
  and accepted_terms_at between now() - interval '5 minutes' and now() + interval '1 minute'
);

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
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_name text := trim(coalesce(p_applicant_name, ''));
  normalized_phone text := trim(coalesce(p_applicant_phone, ''));
  normalized_email text := lower(trim(coalesce(p_applicant_email, '')));
  application_id uuid := gen_random_uuid();
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

  insert into public.partner_applications (
    id,
    application_kind,
    applicant_name,
    applicant_phone,
    applicant_email,
    details,
    accepted_terms_at
  ) values (
    application_id,
    p_application_kind,
    normalized_name,
    normalized_phone,
    normalized_email,
    coalesce(p_details, '{}'::jsonb),
    now()
  );

  return application_id;
end;
$$;

revoke all on function public.submit_partner_application(text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_partner_application(text, text, text, text, jsonb, boolean) to anon, authenticated;
