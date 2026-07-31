create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  phone_normalized text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_accounts_name_length check (char_length(trim(name)) between 2 and 80),
  constraint client_accounts_phone_length check (char_length(phone_normalized) between 10 and 15)
);

create table if not exists public.client_account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.client_accounts(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists client_account_sessions_account_id_idx
  on public.client_account_sessions(account_id, expires_at desc);

alter table public.client_accounts enable row level security;
alter table public.client_account_sessions enable row level security;

revoke all on table public.client_accounts from public, anon, authenticated;
revoke all on table public.client_account_sessions from public, anon, authenticated;

create or replace function public.normalize_client_phone(raw_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g');
begin
  if char_length(digits) = 11 and left(digits, 1) = '8' then
    digits := '7' || substring(digits from 2);
  elsif char_length(digits) = 10 then
    digits := '7' || digits;
  end if;
  return digits;
end;
$$;

revoke all on function public.normalize_client_phone(text) from public, anon, authenticated;

create or replace function public.register_client_account(
  client_name text,
  client_phone text,
  client_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_name text := trim(coalesce(client_name, ''));
  normalized_phone text := public.normalize_client_phone(client_phone);
  account_row public.client_accounts%rowtype;
  session_token text;
begin
  if char_length(normalized_name) < 2 then
    raise exception 'client_name_invalid';
  end if;
  if char_length(normalized_phone) < 10 or char_length(normalized_phone) > 15 then
    raise exception 'client_phone_invalid';
  end if;
  if char_length(coalesce(client_password, '')) < 6 or char_length(client_password) > 72 then
    raise exception 'client_password_invalid';
  end if;
  if exists (
    select 1 from public.client_accounts
    where phone_normalized = normalized_phone
  ) then
    raise exception 'client_phone_registered';
  end if;

  insert into public.client_accounts (name, phone, phone_normalized, password_hash)
  values (
    normalized_name,
    '+' || normalized_phone,
    normalized_phone,
    extensions.crypt(client_password, extensions.gen_salt('bf', 10))
  )
  returning * into account_row;

  session_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.client_account_sessions (account_id, token_hash, expires_at)
  values (
    account_row.id,
    extensions.digest(session_token, 'sha256'),
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'account_id', account_row.id,
    'name', account_row.name,
    'phone', account_row.phone,
    'session_token', session_token,
    'expires_at', now() + interval '30 days'
  );
end;
$$;

create or replace function public.login_client_account(
  client_phone text,
  client_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_phone text := public.normalize_client_phone(client_phone);
  account_row public.client_accounts%rowtype;
  session_token text;
begin
  select *
    into account_row
  from public.client_accounts
  where phone_normalized = normalized_phone;

  if account_row.id is null
    or account_row.password_hash <> extensions.crypt(coalesce(client_password, ''), account_row.password_hash)
  then
    raise exception 'client_credentials_invalid';
  end if;

  delete from public.client_account_sessions
  where expires_at <= now();

  session_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.client_account_sessions (account_id, token_hash, expires_at)
  values (
    account_row.id,
    extensions.digest(session_token, 'sha256'),
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'account_id', account_row.id,
    'name', account_row.name,
    'phone', account_row.phone,
    'session_token', session_token,
    'expires_at', now() + interval '30 days'
  );
end;
$$;

create or replace function public.get_client_account_session(
  client_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_id_value uuid;
  account_name text;
  account_phone text;
  session_expiry timestamptz;
begin
  select account.id, account.name, account.phone, session.expires_at
    into account_id_value, account_name, account_phone, session_expiry
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if account_id_value is null then
    return null;
  end if;

  update public.client_account_sessions
  set last_used_at = now()
  where token_hash = extensions.digest(client_session_token, 'sha256');

  return jsonb_build_object(
    'account_id', account_id_value,
    'name', account_name,
    'phone', account_phone,
    'expires_at', session_expiry
  );
end;
$$;

create or replace function public.logout_client_account(
  client_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.client_account_sessions
  where token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256');
  return true;
end;
$$;

revoke all on function public.register_client_account(text, text, text) from public;
revoke all on function public.login_client_account(text, text) from public;
revoke all on function public.get_client_account_session(text) from public;
revoke all on function public.logout_client_account(text) from public;

grant execute on function public.register_client_account(text, text, text) to anon, authenticated;
grant execute on function public.login_client_account(text, text) to anon, authenticated;
grant execute on function public.get_client_account_session(text) to anon, authenticated;
grant execute on function public.logout_client_account(text) to anon, authenticated;
