create or replace function public.update_client_account_name(
  client_session_token text,
  client_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_account_id uuid;
  normalized_name text := trim(coalesce(client_name, ''));
  account_row public.client_accounts%rowtype;
  session_expiry timestamptz;
begin
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 80 then
    raise exception 'client_name_invalid';
  end if;

  select session.account_id, session.expires_at
    into target_account_id, session_expiry
  from public.client_account_sessions session
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if target_account_id is null then
    raise exception 'client_session_invalid';
  end if;

  update public.client_accounts
  set name = normalized_name, updated_at = now()
  where id = target_account_id
  returning * into account_row;

  update public.client_account_sessions
  set last_used_at = now()
  where token_hash = extensions.digest(client_session_token, 'sha256');

  return jsonb_build_object(
    'account_id', account_row.id,
    'name', account_row.name,
    'phone', account_row.phone,
    'expires_at', session_expiry
  );
end;
$$;

revoke all on function public.update_client_account_name(text, text) from public;
grant execute on function public.update_client_account_name(text, text) to anon, authenticated;
