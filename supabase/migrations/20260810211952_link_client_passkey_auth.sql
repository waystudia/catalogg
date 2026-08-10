-- The passkey bootstrap Edge Function creates (or reuses) a Supabase Auth user,
-- then claims it for an already authenticated client account. The custom client
-- session is validated inside the transaction so an Auth identity cannot be
-- attached by knowing only an account UUID.

create or replace function public.link_client_account_auth_user(
  client_session_token text,
  candidate_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id_value uuid;
  linked_auth_user_id uuid;
begin
  if candidate_auth_user_id is null then
    raise exception 'client_auth_user_invalid';
  end if;

  select session.account_id
    into account_id_value
  from public.client_account_sessions session
  where session.token_hash = extensions.digest(
      pg_catalog.convert_to(coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    )
    and session.expires_at > now()
  limit 1
  for update;

  if account_id_value is null then
    raise exception 'client_session_invalid';
  end if;

  update public.client_accounts account
  set auth_user_id = candidate_auth_user_id,
      updated_at = now()
  where account.id = account_id_value
    and account.auth_user_id is null;

  select account.auth_user_id
    into linked_auth_user_id
  from public.client_accounts account
  where account.id = account_id_value;

  if linked_auth_user_id is null then
    raise exception 'client_auth_link_failed';
  end if;

  return linked_auth_user_id;
end;
$$;

revoke all on function public.link_client_account_auth_user(text, uuid)
  from public, anon, authenticated;
grant execute on function public.link_client_account_auth_user(text, uuid)
  to service_role;
