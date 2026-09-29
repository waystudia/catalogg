-- Client registration is performed with the browser publishable key.  The
-- production database had lost the anon grants, causing PostgREST to reject
-- otherwise valid sign-up requests before the function body was reached.
revoke all on function public.register_client_account(text, text, text) from public;
revoke all on function public.login_client_account(text, text) from public;
revoke all on function public.get_client_account_session(text) from public;
revoke all on function public.logout_client_account(text) from public;
revoke all on function public.record_client_legal_consent(text, text, text, text, boolean, text) from public;

grant execute on function public.register_client_account(text, text, text) to anon, authenticated;
grant execute on function public.login_client_account(text, text) to anon, authenticated;
grant execute on function public.get_client_account_session(text) to anon, authenticated;
grant execute on function public.logout_client_account(text) to anon, authenticated;
grant execute on function public.record_client_legal_consent(text, text, text, text, boolean, text) to anon, authenticated;
