create or replace function public.update_client_account_name(client_session_token text, client_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_id_value uuid;
  cleaned_name text := trim(coalesce(client_name, ''));
begin
  if char_length(cleaned_name) not between 2 and 80 then
    raise exception 'client_name_invalid';
  end if;
  select account_id into account_id_value
  from public.client_account_sessions
  where token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and expires_at > now()
  limit 1;
  if account_id_value is null then
    return null;
  end if;
  update public.client_accounts set name = cleaned_name, updated_at = now()
  where id = account_id_value;
  return public.get_client_account_session(client_session_token);
end;
$$;
revoke all on function public.update_client_account_name(text, text) from public;
grant execute on function public.update_client_account_name(text, text) to anon, authenticated;
