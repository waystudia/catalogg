-- Wake the send-web-push Edge Function when the PWA is closed.
-- Secrets are kept in Supabase Vault, never in this migration.

create extension if not exists pg_net with schema extensions;

create or replace function public.enqueue_web_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_url text;
  webhook_secret text;
begin
  select decrypted_secret into endpoint_url
    from vault.decrypted_secrets
   where name = 'web_push_function_url'
   limit 1;

  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
   where name = 'web_push_webhook_secret'
   limit 1;

  if endpoint_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new),
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(old) end
    )
  );

  return new;
end;
$$;

drop trigger if exists web_push_orders_event on public.orders;
create trigger web_push_orders_event
after insert or update of status, payment_status on public.orders
for each row execute function public.enqueue_web_push_event();

drop trigger if exists web_push_deliveries_event on public.deliveries;
create trigger web_push_deliveries_event
after insert or update of status, driver_id on public.deliveries
for each row execute function public.enqueue_web_push_event();

drop trigger if exists web_push_order_work_assignment_event on public.order_work_assignments;
create trigger web_push_order_work_assignment_event
after insert or update of state, assignee_user_id on public.order_work_assignments
for each row execute function public.enqueue_web_push_event();

drop trigger if exists web_push_order_substitution_event on public.order_substitution_requests;
create trigger web_push_order_substitution_event
after insert or update of state on public.order_substitution_requests
for each row execute function public.enqueue_web_push_event();

drop trigger if exists web_push_order_message_event on public.order_messages;
create trigger web_push_order_message_event
after insert on public.order_messages
for each row execute function public.enqueue_web_push_event();
