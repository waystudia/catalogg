-- Client account sessions must survive ordinary PWA restarts and inactivity.
-- Explicit logout still revokes a session by deleting its token row.

create or replace function public.keep_client_account_session_persistent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.expires_at := 'infinity';
  return new;
end;
$$;

revoke all on function public.keep_client_account_session_persistent() from public, anon, authenticated;

drop trigger if exists keep_client_account_session_persistent
  on public.client_account_sessions;

create trigger keep_client_account_session_persistent
before insert or update of expires_at
on public.client_account_sessions
for each row
execute function public.keep_client_account_session_persistent();

-- Preserve every session that is valid at deployment time without reviving
-- tokens that had already expired before this policy was introduced.
update public.client_account_sessions
set expires_at = 'infinity'
where expires_at > now();
