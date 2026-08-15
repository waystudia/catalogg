-- Token-owned notification center and lazy expiry. pg_cron is not required:
-- every offer/read access closes stale offers before returning client data.

begin;

create or replace function public.expire_stale_post_order_addons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_offer record;
  expired_count integer := 0;
begin
  for expired_offer in
    update public.addon_offers offer
    set status = 'expired',
        closed_reason = coalesce(offer.closed_reason, 'offer_window_expired'),
        updated_at = now()
    where offer.expires_at <= now()
      and offer.status in ('evaluating', 'available', 'viewed')
    returning offer.id, offer.order_group_id
  loop
    expired_count := expired_count + 1;
    insert into public.order_group_events (
      order_group_id, event_type, actor_type, metadata
    ) values (
      expired_offer.order_group_id,
      'ADDON_EXPIRED',
      'system',
      jsonb_build_object('offer_id', expired_offer.id)
    );
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_stale_post_order_addons()
  from public, anon, authenticated;
grant execute on function public.expire_stale_post_order_addons()
  to service_role;

create or replace function public.get_client_notifications(
  client_session_token text,
  result_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_account_id uuid;
  safe_limit integer := least(greatest(coalesce(result_limit, 30), 1), 100);
begin
  select session.account_id into target_account_id
  from public.client_account_sessions session
  where session.token_hash = extensions.digest(
      convert_to(coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    )
    and session.expires_at > now()
  order by session.created_at desc
  limit 1;

  if target_account_id is null then
    raise exception 'client_session_invalid';
  end if;

  perform public.expire_stale_post_order_addons();

  update public.client_account_sessions session
  set last_used_at = now()
  where session.account_id = target_account_id
    and session.token_hash = extensions.digest(
      convert_to(coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    );

  return jsonb_build_object(
    'unread_count', (
      select count(*)
      from public.notifications notification
      where notification.recipient_client_account_id = target_account_id
        and notification.read_at is null
        and (notification.expires_at is null or notification.expires_at > now())
    ),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', listed.id,
          'type', listed.notification_type,
          'title', listed.title,
          'body', listed.body,
          'action_url', listed.action_url,
          'read_at', listed.read_at,
          'expires_at', listed.expires_at,
          'created_at', listed.created_at,
          'metadata', listed.metadata
        )
        order by listed.created_at desc
      )
      from (
        select notification.*
        from public.notifications notification
        where notification.recipient_client_account_id = target_account_id
          and (notification.expires_at is null or notification.expires_at > now())
        order by notification.created_at desc
        limit safe_limit
      ) listed
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_client_notifications(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_client_notifications(text, integer)
  to anon, authenticated, service_role;

create or replace function public.mark_client_notification_read(
  target_notification_id uuid,
  client_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_account_id uuid;
begin
  select session.account_id into target_account_id
  from public.client_account_sessions session
  where session.token_hash = extensions.digest(
      convert_to(coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    )
    and session.expires_at > now()
  order by session.created_at desc
  limit 1;

  if target_account_id is null then
    raise exception 'client_session_invalid';
  end if;

  update public.notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.recipient_client_account_id = target_account_id;

  return found;
end;
$$;

revoke all on function public.mark_client_notification_read(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_client_notification_read(uuid, text)
  to anon, authenticated, service_role;

do $$
begin
  if to_regprocedure('public.enqueue_web_push_event()') is not null then
    execute 'drop trigger if exists web_push_combined_order_notification on public.notifications';
    execute $trigger$
      create trigger web_push_combined_order_notification
      after insert on public.notifications
      for each row
      when (new.notification_type in (
        'POST_ORDER_ADDON_AVAILABLE',
        'POST_ORDER_ADDON_CREATED',
        'POST_ORDER_ADDON_CANCELLED',
        'COMBINED_ORDER_CANCELLED'
      ))
      execute function public.enqueue_web_push_event()
    $trigger$;
  end if;
end;
$$;

commit;
