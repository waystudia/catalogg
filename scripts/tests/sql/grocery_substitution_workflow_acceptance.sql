\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.order_substitution_requests') is null
    or to_regclass('public.order_messages') is null
    or to_regclass('public.order_payment_adjustments') is null then
    raise exception 'grocery substitution workflow missing';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000108', 'grocery-client@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000110', 'other-grocery-client@wayyaam.test');

insert into public.users (id, auth_user_id, name, phone, email, role)
values
  (
    '00000000-0000-4000-8000-000000000109',
    '00000000-0000-4000-8000-000000000108',
    'Клиент продуктового магазина',
    '+79990000008',
    'grocery-client@wayyaam.test',
    'client'
  ),
  (
    '00000000-0000-4000-8000-000000000111',
    '00000000-0000-4000-8000-000000000110',
    'Другой клиент',
    '+79990000010',
    'other-grocery-client@wayyaam.test',
    'client'
  );

insert into public.client_accounts (id, name, phone, phone_normalized, password_hash)
values
  (
    '00000000-0000-4000-8000-000000000508',
    'Клиент продуктов',
    '+7 999 000-00-08',
    '79990000008',
    extensions.crypt('wayyaam-test-only', extensions.gen_salt('bf'))
  ),
  (
    '00000000-0000-4000-8000-000000000510',
    'Другой клиент',
    '+7 999 000-00-10',
    '79990000010',
    extensions.crypt('wayyaam-test-only', extensions.gen_salt('bf'))
  );

insert into public.client_account_sessions (id, account_id, token_hash, expires_at)
values
  (
    '00000000-0000-4000-8000-000000000518',
    '00000000-0000-4000-8000-000000000508',
    extensions.digest(pg_catalog.convert_to('grocery-client-token', 'UTF8'), 'sha256'),
    now() + interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000000520',
    '00000000-0000-4000-8000-000000000510',
    extensions.digest(pg_catalog.convert_to('other-client-token', 'UTF8'), 'sha256'),
    now() + interval '1 day'
  );

update public.orders
set client_id = '00000000-0000-4000-8000-000000000109',
    customer_phone = '+7 999 000-00-08',
    client_phone = '+7 999 000-00-08'
where id = '00000000-0000-4000-8000-000000000331';

update public.orders
set client_id = '00000000-0000-4000-8000-000000000111',
    customer_phone = '+7 999 000-00-10',
    client_phone = '+7 999 000-00-10'
where id = '00000000-0000-4000-8000-000000000332';

update public.products
set allow_substitution = true
where id = '00000000-0000-4000-8000-000000000302';

select set_config(
  'wayyaam.test.finiki_catalog_id',
  (select catalog.id::text from public.catalogs catalog where catalog.slug = 'finiki-ci'),
  false
);

insert into public.order_items (
  id,
  catalog_id,
  order_id,
  product_id,
  title,
  quantity,
  unit_price,
  line_total
)
select
  '00000000-0000-4000-8000-000000000341',
  product.catalog_id,
  '00000000-0000-4000-8000-000000000331',
  product.id,
  product.title,
  1,
  product.price,
  product.price
from public.products product
where product.id = '00000000-0000-4000-8000-000000000302';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000107', false);
set role authenticated;

do $$
begin
  begin
    perform public.propose_catalog_order_substitution(
      '00000000-0000-4000-8000-000000000341',
      '00000000-0000-4000-8000-000000000301',
      null,
      500,
      'Посторонний не должен иметь доступ'
    );
    raise exception 'expected_outsider_substitution_rejection';
  exception
    when others then
      if sqlerrm = 'expected_outsider_substitution_rejection' then raise; end if;
      if sqlerrm <> 'accepted_catalog_order_assignment_required' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000106', false);
set role authenticated;

select set_config(
  'wayyaam.test.substitution_id',
  public.propose_catalog_order_substitution(
    '00000000-0000-4000-8000-000000000341',
    '00000000-0000-4000-8000-000000000301',
    null,
    500,
    'Предлагаем 500 г фиников'
  )::text,
  false
);

do $$
begin
  if (public.get_order_conversation(
    '00000000-0000-4000-8000-000000000331',
    current_setting('wayyaam.test.finiki_catalog_id')::uuid
  ) ->> 'viewerKind') <> 'staff' then
    raise exception 'picker cannot read assigned order conversation';
  end if;
end;
$$;

reset role;

do $$
declare
  request_id uuid := current_setting('wayyaam.test.substitution_id')::uuid;
begin
  if not exists (
    select 1
    from public.order_substitution_requests request
    where request.id = request_id
      and request.original_order_item_id = '00000000-0000-4000-8000-000000000341'
      and request.state = 'pending'
      and request.original_line_total_snapshot = 120
      and request.proposed_quantity = 500
      and request.proposed_line_total = 200
      and request.price_delta = 80
  ) then
    raise exception 'substitution offer snapshot or delta is invalid';
  end if;
  if not exists (
    select 1 from public.order_items item
    where item.id = '00000000-0000-4000-8000-000000000341'
      and item.fulfillment_state = 'substitution_pending'
      and item.line_total = 120
  ) then
    raise exception 'pending substitution changed original order amount';
  end if;
end;
$$;

do $$
declare
  sensitive_table text;
begin
  foreach sensitive_table in array array[
    'order_substitution_requests',
    'order_payment_adjustments',
    'order_messages'
  ] loop
    if has_table_privilege('anon', format('public.%I', sensitive_table), 'select')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'insert')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'update')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'delete') then
      raise exception 'anonymous role has direct access to %', sensitive_table;
    end if;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
declare
  request_id uuid := current_setting('wayyaam.test.substitution_id')::uuid;
  result jsonb;
begin
  begin
    perform public.upsert_client_order_push_subscription(
      'grocery-client-token',
      'https://push.example/foreign-order',
      'p256dh',
      'auth',
      '00000000-0000-4000-8000-000000000332',
      'https://finiki.example/'
    );
    raise exception 'expected_other_client_push_rejection';
  exception
    when others then
      if sqlerrm = 'expected_other_client_push_rejection' then raise; end if;
      if sqlerrm <> 'client_push_order_ownership_required' then raise; end if;
  end;

  begin
    perform public.get_order_conversation(
      '00000000-0000-4000-8000-000000000332',
      current_setting('wayyaam.test.finiki_catalog_id')::uuid,
      'grocery-client-token'
    );
    raise exception 'expected_other_client_conversation_rejection';
  exception
    when others then
      if sqlerrm = 'expected_other_client_conversation_rejection' then raise; end if;
      if sqlerrm <> 'order_conversation_access_required' then raise; end if;
  end;

  if (public.get_order_conversation(
    '00000000-0000-4000-8000-000000000331',
    current_setting('wayyaam.test.finiki_catalog_id')::uuid,
    'grocery-client-token'
  ) ->> 'viewerKind') <> 'client' then
    raise exception 'custom-session order client cannot read conversation';
  end if;

  perform public.upsert_client_order_push_subscription(
    'grocery-client-token',
    'https://push.example/own-order',
    'p256dh',
    'auth',
    '00000000-0000-4000-8000-000000000331',
    'https://finiki.example/'
  );

  perform public.send_order_message(
    '00000000-0000-4000-8000-000000000331',
    current_setting('wayyaam.test.finiki_catalog_id')::uuid,
    'Подходит, замените.',
    'grocery-client-token'
  );

  result := public.resolve_order_substitution(
    request_id,
    'accepted',
    1,
    'Согласовано клиентом',
    'grocery-client-token'
  );
  if result ->> 'resolved' <> 'true'
    or result ->> 'state' <> 'accepted'
    or (result ->> 'amountDelta')::integer <> 80 then
    raise exception 'client acceptance result is invalid';
  end if;
  if (public.resolve_order_substitution(
    request_id,
    'accepted',
    1,
    '',
    'grocery-client-token'
  ) ->> 'resolved') <> 'false' then
    raise exception 'stale substitution version resolved twice';
  end if;
end;
$$;

reset role;

do $$
declare
  request_id uuid := current_setting('wayyaam.test.substitution_id')::uuid;
begin
  if not exists (
    select 1
    from public.web_push_subscriptions subscription
    where subscription.user_id = '00000000-0000-4000-8000-000000000508'
      and subscription.order_id = '00000000-0000-4000-8000-000000000331'
      and subscription.role = 'client'
      and subscription.app_base_url = 'https://finiki.example'
  ) then
    raise exception 'custom-session client push subscription missing';
  end if;

  if not exists (
    select 1 from public.order_substitution_requests request
    where request.id = request_id
      and request.state = 'accepted'
      and request.version = 2
      and request.replacement_order_item_id is not null
  ) then
    raise exception 'accepted substitution audit state missing';
  end if;
  if not exists (
    select 1 from public.order_items item
    where item.source_substitution_id = request_id
      and item.replaces_order_item_id = '00000000-0000-4000-8000-000000000341'
      and item.title = 'Финики после редактирования'
      and item.requested_quantity = 500
      and item.line_total = 200
      and item.fulfillment_state = 'picked'
  ) then
    raise exception 'accepted replacement order line missing';
  end if;
  if not exists (
    select 1 from public.order_items item
    where item.id = '00000000-0000-4000-8000-000000000341'
      and item.fulfillment_state = 'substituted'
      and item.line_total = 0
  ) then
    raise exception 'original order line was not retained as substituted';
  end if;
  if not exists (
    select 1 from public.order_payment_adjustments adjustment
    where adjustment.substitution_request_id = request_id
      and adjustment.kind = 'additional_charge'
      and adjustment.amount_delta = 80
      and adjustment.state = 'pending'
  ) then
    raise exception 'substitution payment adjustment missing';
  end if;
  if not exists (
    select 1 from public.orders order_record
    where order_record.id = '00000000-0000-4000-8000-000000000331'
      and order_record.subtotal = 200
      and order_record.total = 200
  ) then
    raise exception 'accepted substitution did not recalculate order total';
  end if;
end;
$$;

insert into public.order_items (
  id,
  catalog_id,
  order_id,
  product_id,
  title,
  quantity,
  unit_price,
  requested_quantity,
  line_total
)
select
  '00000000-0000-4000-8000-000000000343',
  product.catalog_id,
  '00000000-0000-4000-8000-000000000331',
  product.id,
  product.title,
  1,
  product.price,
  350,
  140
from public.products product
where product.id = '00000000-0000-4000-8000-000000000301';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000106', false);
set role authenticated;

do $$
begin
  if public.mark_catalog_order_item_picked(
    '00000000-0000-4000-8000-000000000343',
    400
  ) <> 160 then
    raise exception 'actual weighted quantity was not priced correctly';
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.order_items item
    where item.id = '00000000-0000-4000-8000-000000000343'
      and item.fulfillment_state = 'picked'
      and item.requested_quantity = 350
      and item.fulfilled_quantity = 400
      and item.line_total = 160
  ) then
    raise exception 'weighted picking state is inconsistent';
  end if;
  if not exists (
    select 1 from public.orders order_record
    where order_record.id = '00000000-0000-4000-8000-000000000331'
      and order_record.subtotal = 360
  ) then
    raise exception 'weighted fulfillment did not update order subtotal';
  end if;
  if (select count(*) from public.order_messages message
      where message.order_id = '00000000-0000-4000-8000-000000000331') < 4 then
    raise exception 'substitution and chat events are incomplete';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);

\echo 'Grocery substitution workflow acceptance passed.'
