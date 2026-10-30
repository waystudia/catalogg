-- Avoid PL/pgSQL variable/column ambiguity when persisting client receipt.
CREATE OR REPLACE FUNCTION public.confirm_client_order_receipt(client_session_token text, target_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  viewer_account_id uuid;
  account_phone text;
  order_phone text;
  target_delivery_id uuid;
  receipt_at timestamptz;
begin
  select account.id, account.phone_normalized
    into viewer_account_id, account_phone
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if viewer_account_id is null then
    raise exception 'client_handoff_auth_required';
  end if;

  select public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone))
    into order_phone
  from public.orders o
  where o.id = target_order_id;

  if order_phone is null then
    raise exception 'client_handoff_order_not_found';
  end if;

  if order_phone <> account_phone then
    raise exception 'client_handoff_order_forbidden';
  end if;

  update public.deliveries d
  set client_received_at = coalesce(d.client_received_at, now()),
      updated_at = now()
  where d.id = (
      select candidate.id
      from public.deliveries candidate
      where candidate.order_id = target_order_id
      order by candidate.updated_at desc nulls last, candidate.created_at desc
      limit 1
    )
    and d.status = 'arrived_to_client'
    and d.driver_handed_to_client_at is not null
  returning d.id, d.client_received_at into target_delivery_id, receipt_at;

  if target_delivery_id is null then
    raise exception 'client_receipt_not_allowed';
  end if;

  if not exists (
    select 1
    from public.delivery_status_history h
    where h.delivery_id = target_delivery_id
      and h.comment = 'client confirmed order receipt'
  ) then
    insert into public.delivery_status_history (delivery_id, status, comment)
    values (target_delivery_id, 'arrived_to_client', 'client confirmed order receipt');
  end if;

  update public.client_account_sessions session
  set last_used_at = now()
  where session.account_id = viewer_account_id
    and session.token_hash = extensions.digest(client_session_token, 'sha256');

  return jsonb_build_object(
    'delivery_id', target_delivery_id,
    'driver_handed_to_client_at', (
      select d.driver_handed_to_client_at from public.deliveries d where d.id = target_delivery_id
    ),
    'client_received_at', receipt_at
  );
end;
$$;
