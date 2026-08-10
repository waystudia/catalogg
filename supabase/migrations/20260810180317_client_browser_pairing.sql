-- A Home Screen PWA and Safari have separate storage on iOS. These short-lived,
-- one-time codes let a signed-in client create a separate Safari session without
-- copying a password or the PWA session token between browser containers.

create table public.client_browser_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.client_accounts(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.client_browser_pairing_codes enable row level security;

revoke all on table public.client_browser_pairing_codes from public, anon, authenticated;

create or replace function public.create_client_browser_pairing_code(
  client_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id_value uuid;
  pairing_code_value text;
  expires_at_value timestamptz := now() + interval '5 minutes';
begin
  select session.account_id
    into account_id_value
  from public.client_account_sessions session
  where session.token_hash = extensions.digest(
      pg_catalog.convert_to(coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    )
    and session.expires_at > now()
  limit 1;

  if account_id_value is null then
    raise exception 'client_session_invalid';
  end if;

  -- Only one live code per account. Expired codes are disposable audit noise and
  -- are removed opportunistically without touching redeemed records from others.
  delete from public.client_browser_pairing_codes
  where expires_at <= now()
    or account_id = account_id_value;

  pairing_code_value := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));

  insert into public.client_browser_pairing_codes (
    account_id,
    code_hash,
    expires_at
  ) values (
    account_id_value,
    extensions.digest(pg_catalog.convert_to(pairing_code_value, 'UTF8'), 'sha256'),
    expires_at_value
  );

  return jsonb_build_object(
    'pairing_code', pairing_code_value,
    'expires_at', expires_at_value
  );
end;
$$;

create or replace function public.redeem_client_browser_pairing_code(
  pairing_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(pairing_code, ''), '[^0-9A-Fa-f]', '', 'g'));
  pairing_id_value uuid;
  account_id_value uuid;
  account_name text;
  account_phone text;
  session_token_value text;
  session_expiry_value timestamptz;
begin
  if char_length(normalized_code) <> 12 then
    raise exception 'client_pairing_code_invalid';
  end if;

  select code.id, code.account_id
    into pairing_id_value, account_id_value
  from public.client_browser_pairing_codes code
  where code.code_hash = extensions.digest(
      pg_catalog.convert_to(normalized_code, 'UTF8'),
      'sha256'
    )
    and code.redeemed_at is null
    and code.expires_at > now()
  limit 1
  for update;

  if pairing_id_value is null then
    raise exception 'client_pairing_code_invalid';
  end if;

  select account.name, account.phone
    into account_name, account_phone
  from public.client_accounts account
  where account.id = account_id_value;

  if account_name is null then
    raise exception 'client_pairing_code_invalid';
  end if;

  update public.client_browser_pairing_codes
  set redeemed_at = now()
  where id = pairing_id_value;

  session_token_value := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.client_account_sessions (account_id, token_hash, expires_at)
  values (
    account_id_value,
    extensions.digest(pg_catalog.convert_to(session_token_value, 'UTF8'), 'sha256'),
    now() + interval '30 days'
  )
  returning expires_at into session_expiry_value;

  return jsonb_build_object(
    'account_id', account_id_value,
    'name', account_name,
    'phone', account_phone,
    'session_token', session_token_value,
    'expires_at', session_expiry_value
  );
end;
$$;

revoke all on function public.create_client_browser_pairing_code(text) from public, anon, authenticated;
revoke all on function public.redeem_client_browser_pairing_code(text) from public, anon, authenticated;

grant execute on function public.create_client_browser_pairing_code(text) to anon, authenticated;
grant execute on function public.redeem_client_browser_pairing_code(text) to anon, authenticated;
