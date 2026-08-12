alter table public.order_items
  add column if not exists fulfillment_state text not null default 'pending',
  add column if not exists replaces_order_item_id uuid,
  add column if not exists source_substitution_id uuid;

alter table public.order_items drop constraint if exists order_items_fulfillment_state_check;
alter table public.order_items
  add constraint order_items_fulfillment_state_check
  check (fulfillment_state in (
    'pending', 'picked', 'unavailable', 'substitution_pending', 'substituted', 'removed'
  ));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_catalog_order_id_key'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_catalog_order_id_key unique (catalog_id, order_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_replaces_order_item_fk'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_replaces_order_item_fk
      foreign key (replaces_order_item_id)
      references public.order_items(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.order_substitution_requests (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null,
  original_order_item_id uuid not null,
  proposed_product_id uuid not null,
  proposed_variant_id uuid,
  state text not null default 'pending',
  original_title_snapshot text not null,
  original_line_total_snapshot integer not null check (original_line_total_snapshot >= 0),
  proposed_title_snapshot text not null,
  proposed_sku_snapshot text not null default '',
  proposed_sale_unit_snapshot text not null,
  proposed_quantity_unit_snapshot text not null,
  proposed_quantity integer not null check (proposed_quantity > 0),
  proposed_price_basis_quantity integer not null check (proposed_price_basis_quantity > 0),
  proposed_unit_price integer not null check (proposed_unit_price >= 0),
  proposed_line_total integer not null check (proposed_line_total >= 0),
  price_delta integer not null,
  proposed_product_snapshot jsonb not null default '{}'::jsonb,
  note text not null default '',
  resolution_note text not null default '',
  proposed_by uuid not null references auth.users(id) on delete restrict,
  resolved_by uuid references auth.users(id) on delete set null,
  replacement_order_item_id uuid references public.order_items(id) on delete set null,
  version integer not null default 1 check (version > 0),
  proposed_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint order_substitution_requests_state_check
    check (state in ('pending', 'accepted', 'removed', 'alternative_requested', 'cancelled')),
  constraint order_substitution_requests_catalog_order_fk
    foreign key (catalog_id, order_id)
    references public.orders(catalog_id, id)
    on delete cascade,
  constraint order_substitution_requests_original_item_fk
    foreign key (catalog_id, order_id, original_order_item_id)
    references public.order_items(catalog_id, order_id, id)
    on delete cascade,
  constraint order_substitution_requests_product_fk
    foreign key (catalog_id, proposed_product_id)
    references public.products(catalog_id, id)
    on delete restrict,
  constraint order_substitution_requests_variant_fk
    foreign key (catalog_id, proposed_variant_id)
    references public.product_variants(catalog_id, id)
    on delete restrict
);

create unique index if not exists order_substitution_one_pending_item_idx
  on public.order_substitution_requests(original_order_item_id)
  where state = 'pending';

create index if not exists order_substitution_order_created_idx
  on public.order_substitution_requests(order_id, proposed_at desc);

create table if not exists public.order_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null,
  substitution_request_id uuid not null references public.order_substitution_requests(id) on delete restrict,
  kind text not null,
  amount_delta integer not null check (amount_delta <> 0),
  state text not null default 'pending',
  reason text not null default 'substitution',
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint order_payment_adjustments_kind_check
    check (kind in ('additional_charge', 'refund')),
  constraint order_payment_adjustments_state_check
    check (state in ('pending', 'settled', 'cancelled')),
  constraint order_payment_adjustments_catalog_order_fk
    foreign key (catalog_id, order_id)
    references public.orders(catalog_id, id)
    on delete cascade,
  unique (substitution_request_id)
);

create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null,
  sender_auth_user_id uuid references auth.users(id) on delete set null,
  sender_kind text not null,
  message_type text not null default 'text',
  body text not null default '',
  substitution_request_id uuid references public.order_substitution_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_messages_sender_kind_check
    check (sender_kind in ('client', 'staff', 'system')),
  constraint order_messages_type_check
    check (message_type in ('text', 'substitution_offer', 'substitution_decision', 'picking_event')),
  constraint order_messages_body_check
    check (char_length(body) between 1 and 2000),
  constraint order_messages_catalog_order_fk
    foreign key (catalog_id, order_id)
    references public.orders(catalog_id, id)
    on delete cascade
);

create index if not exists order_messages_order_created_idx
  on public.order_messages(order_id, created_at, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_source_substitution_fk'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_source_substitution_fk
      foreign key (source_substitution_id)
      references public.order_substitution_requests(id)
      on delete set null;
  end if;
end;
$$;

create or replace function public.is_current_order_client(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders order_record
    join public.users platform_user on platform_user.id = order_record.client_id
    where order_record.id = target_order_id
      and order_record.catalog_id = target_catalog_id
      and platform_user.auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.is_client_session_order_client(
  target_order_id uuid,
  target_catalog_id uuid,
  client_session_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_account_sessions session
    join public.client_accounts account on account.id = session.account_id
    join public.orders order_record
      on order_record.id = target_order_id
     and order_record.catalog_id = target_catalog_id
    where session.token_hash = extensions.digest(
        pg_catalog.convert_to(coalesce(client_session_token, ''), 'UTF8'),
        'sha256'
      )
      and session.expires_at > now()
      and account.phone_normalized = public.normalize_client_phone(
        coalesce(nullif(order_record.client_phone, ''), order_record.customer_phone)
      )
  );
$$;

create or replace function public.can_work_catalog_order(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
    or (
      public.has_catalog_staff_permission(target_catalog_id, 'orders.assign')
      and exists (
        select 1
        from public.orders order_record
        where order_record.id = target_order_id
          and order_record.catalog_id = target_catalog_id
      )
    )
    or exists (
      select 1
      from public.order_work_assignments assignment
      where assignment.order_id = target_order_id
        and assignment.catalog_id = target_catalog_id
        and assignment.assignee_user_id = (select auth.uid())
        and assignment.state = 'accepted'
    );
$$;

create or replace function public.can_access_order_conversation(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_current_order_client(target_order_id, target_catalog_id)
    or public.can_work_catalog_order(target_order_id, target_catalog_id)
    or exists (
      select 1
      from public.order_work_assignments assignment
      where assignment.order_id = target_order_id
        and assignment.catalog_id = target_catalog_id
        and assignment.assignee_user_id = (select auth.uid())
        and assignment.state = 'offered'
    );
$$;

create or replace function public.recalculate_catalog_order_totals(
  target_order_id uuid,
  target_catalog_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_subtotal integer;
begin
  select coalesce(sum(item.line_total), 0)::integer
  into resolved_subtotal
  from public.order_items item
  where item.order_id = target_order_id
    and item.catalog_id = target_catalog_id
    and item.fulfillment_state not in ('substituted', 'removed');

  update public.orders order_record
  set subtotal = resolved_subtotal,
      subtotal_amount = resolved_subtotal,
      total = resolved_subtotal + coalesce(order_record.delivery_fee, 0),
      total_amount = resolved_subtotal + coalesce(order_record.delivery_fee, 0)
  where order_record.id = target_order_id
    and order_record.catalog_id = target_catalog_id;

  if not found then
    raise exception 'catalog_order_not_found';
  end if;
  return resolved_subtotal;
end;
$$;

create or replace function public.mark_catalog_order_item_picked(
  target_order_item_id uuid,
  target_fulfilled_quantity integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.order_items%rowtype;
  resolved_quantity integer;
  resolved_line_total integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;

  select item.* into item_record
  from public.order_items item
  where item.id = target_order_item_id
  for update;

  if item_record.id is null then raise exception 'catalog_order_item_not_found'; end if;
  if not public.can_work_catalog_order(item_record.order_id, item_record.catalog_id) then
    raise exception 'accepted_catalog_order_assignment_required';
  end if;
  if item_record.fulfillment_state not in ('pending', 'unavailable') then
    raise exception 'catalog_order_item_already_resolved';
  end if;

  resolved_quantity := coalesce(target_fulfilled_quantity, item_record.requested_quantity);
  if resolved_quantity <= 0 then raise exception 'fulfilled_quantity_invalid'; end if;

  resolved_line_total := round(
    (item_record.unit_price::numeric * resolved_quantity::numeric)
    / greatest(item_record.price_basis_quantity_snapshot, 1)
  )::integer;

  update public.order_items item
  set fulfillment_state = 'picked',
      fulfilled_quantity = resolved_quantity,
      line_total = resolved_line_total
  where item.id = item_record.id;

  perform public.recalculate_catalog_order_totals(item_record.order_id, item_record.catalog_id);

  insert into public.order_messages (
    catalog_id, order_id, sender_auth_user_id, sender_kind, message_type, body
  ) values (
    item_record.catalog_id,
    item_record.order_id,
    (select auth.uid()),
    'system',
    'picking_event',
    concat('Собрано: ', item_record.title)
  );

  return resolved_line_total;
end;
$$;

create or replace function public.propose_catalog_order_substitution(
  target_order_item_id uuid,
  target_proposed_product_id uuid,
  target_proposed_variant_id uuid default null,
  target_proposed_quantity integer default null,
  target_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.order_items%rowtype;
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  resolved_quantity integer;
  resolved_unit_price integer;
  resolved_title text;
  resolved_sku text;
  resolved_line_total integer;
  created_request_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;

  select item.* into item_record
  from public.order_items item
  where item.id = target_order_item_id
  for update;

  if item_record.id is null then raise exception 'catalog_order_item_not_found'; end if;
  if not public.can_work_catalog_order(item_record.order_id, item_record.catalog_id) then
    raise exception 'accepted_catalog_order_assignment_required';
  end if;
  if item_record.fulfillment_state not in ('pending', 'unavailable', 'substitution_pending') then
    raise exception 'catalog_order_item_already_resolved';
  end if;
  if not exists (
    select 1 from public.products original_product
    where original_product.id = item_record.product_id
      and original_product.catalog_id = item_record.catalog_id
      and original_product.allow_substitution
  ) then
    raise exception 'catalog_order_item_substitution_disabled';
  end if;

  select product.* into product_record
  from public.products product
  where product.id = target_proposed_product_id
    and product.catalog_id = item_record.catalog_id
    and product.status in ('active', 'sold_out');

  if product_record.id is null then raise exception 'catalog_substitution_product_not_found'; end if;
  if product_record.id = item_record.product_id then raise exception 'catalog_substitution_same_product'; end if;

  if target_proposed_variant_id is not null then
    select variant.* into variant_record
    from public.product_variants variant
    where variant.id = target_proposed_variant_id
      and variant.product_id = product_record.id
      and variant.catalog_id = product_record.catalog_id
      and variant.status in ('active', 'sold_out');
    if variant_record.id is null then raise exception 'catalog_substitution_variant_not_found'; end if;
  end if;

  resolved_quantity := coalesce(target_proposed_quantity, product_record.minimum_quantity);
  if resolved_quantity < product_record.minimum_quantity
    or mod(resolved_quantity - product_record.minimum_quantity, product_record.quantity_step) <> 0 then
    raise exception 'catalog_substitution_quantity_invalid';
  end if;
  if not product_record.is_unlimited and resolved_quantity > coalesce(variant_record.stock_quantity, product_record.stock_quantity) then
    raise exception 'catalog_substitution_stock_insufficient';
  end if;

  resolved_unit_price := coalesce(variant_record.price, product_record.price);
  resolved_title := concat_ws(' · ', product_record.title, nullif(variant_record.title, ''));
  resolved_sku := coalesce(nullif(variant_record.sku, ''), product_record.sku, '');
  resolved_line_total := round(
    (resolved_unit_price::numeric * resolved_quantity::numeric)
    / product_record.price_basis_quantity
  )::integer;

  update public.order_substitution_requests request
  set state = 'cancelled',
      resolved_by = (select auth.uid()),
      resolved_at = now(),
      updated_at = now(),
      version = request.version + 1,
      resolution_note = 'replaced_by_new_offer'
  where request.original_order_item_id = item_record.id
    and request.state in ('pending', 'alternative_requested');

  insert into public.order_substitution_requests (
    catalog_id,
    order_id,
    original_order_item_id,
    proposed_product_id,
    proposed_variant_id,
    original_title_snapshot,
    original_line_total_snapshot,
    proposed_title_snapshot,
    proposed_sku_snapshot,
    proposed_sale_unit_snapshot,
    proposed_quantity_unit_snapshot,
    proposed_quantity,
    proposed_price_basis_quantity,
    proposed_unit_price,
    proposed_line_total,
    price_delta,
    proposed_product_snapshot,
    note,
    proposed_by
  ) values (
    item_record.catalog_id,
    item_record.order_id,
    item_record.id,
    product_record.id,
    variant_record.id,
    item_record.title,
    item_record.line_total,
    resolved_title,
    resolved_sku,
    product_record.sale_unit,
    product_record.quantity_unit,
    resolved_quantity,
    product_record.price_basis_quantity,
    resolved_unit_price,
    resolved_line_total,
    resolved_line_total - item_record.line_total,
    jsonb_build_object(
      'id', product_record.id,
      'title', resolved_title,
      'sku', resolved_sku,
      'variant_id', variant_record.id
    ),
    left(trim(coalesce(target_note, '')), 2000),
    (select auth.uid())
  ) returning id into created_request_id;

  update public.order_items item
  set fulfillment_state = 'substitution_pending',
      fulfilled_quantity = 0
  where item.id = item_record.id;

  insert into public.order_messages (
    catalog_id,
    order_id,
    sender_auth_user_id,
    sender_kind,
    message_type,
    body,
    substitution_request_id
  ) values (
    item_record.catalog_id,
    item_record.order_id,
    (select auth.uid()),
    'system',
    'substitution_offer',
    concat(
      'Товара «', item_record.title, '» нет. Предложена замена «', resolved_title,
      '». Разница: ', resolved_line_total - item_record.line_total, ' ₽.'
    ),
    created_request_id
  );

  return created_request_id;
end;
$$;

create or replace function public.resolve_order_substitution(
  target_request_id uuid,
  target_decision text,
  expected_version integer,
  target_note text default '',
  client_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.order_substitution_requests%rowtype;
  original_item public.order_items%rowtype;
  replacement_item_id uuid;
  resolved_delta integer := 0;
  resolved_state text;
begin
  if target_decision not in ('accepted', 'removed', 'alternative_requested') then
    raise exception 'catalog_substitution_decision_invalid';
  end if;

  select request.* into request_record
  from public.order_substitution_requests request
  where request.id = target_request_id
  for update;

  if request_record.id is null then raise exception 'catalog_substitution_not_found'; end if;
  if not (
    public.is_current_order_client(request_record.order_id, request_record.catalog_id)
    or public.is_client_session_order_client(
      request_record.order_id,
      request_record.catalog_id,
      client_session_token
    )
  ) then
    raise exception 'catalog_substitution_client_required';
  end if;
  if request_record.state <> 'pending' or request_record.version <> expected_version then
    return jsonb_build_object('resolved', false, 'state', request_record.state);
  end if;

  select item.* into original_item
  from public.order_items item
  where item.id = request_record.original_order_item_id
  for update;

  if target_decision = 'accepted' then
    insert into public.order_items (
      catalog_id,
      order_id,
      product_id,
      variant_id,
      title,
      quantity,
      unit_price,
      options,
      line_total,
      sku_snapshot,
      sale_unit_snapshot,
      quantity_unit_snapshot,
      requested_quantity,
      fulfilled_quantity,
      price_basis_quantity_snapshot,
      product_snapshot,
      fulfillment_state,
      replaces_order_item_id,
      source_substitution_id
    ) values (
      request_record.catalog_id,
      request_record.order_id,
      null,
      null,
      request_record.proposed_title_snapshot,
      case when request_record.proposed_sale_unit_snapshot = 'piece'
        then request_record.proposed_quantity else 1 end,
      request_record.proposed_unit_price,
      '[]'::jsonb,
      request_record.proposed_line_total,
      request_record.proposed_sku_snapshot,
      request_record.proposed_sale_unit_snapshot,
      request_record.proposed_quantity_unit_snapshot,
      request_record.proposed_quantity,
      request_record.proposed_quantity,
      request_record.proposed_price_basis_quantity,
      request_record.proposed_product_snapshot,
      'picked',
      request_record.original_order_item_id,
      request_record.id
    ) returning id into replacement_item_id;

    update public.order_items item
    set fulfillment_state = 'substituted',
        fulfilled_quantity = 0,
        line_total = 0
    where item.id = request_record.original_order_item_id;
    resolved_delta := request_record.price_delta;
    resolved_state := 'accepted';
  elsif target_decision = 'removed' then
    update public.order_items item
    set fulfillment_state = 'removed',
        fulfilled_quantity = 0,
        line_total = 0
    where item.id = request_record.original_order_item_id;
    resolved_delta := -request_record.original_line_total_snapshot;
    resolved_state := 'removed';
  else
    resolved_state := 'alternative_requested';
  end if;

  update public.order_substitution_requests request
  set state = resolved_state,
      resolved_by = (select auth.uid()),
      resolved_at = now(),
      updated_at = now(),
      version = request.version + 1,
      replacement_order_item_id = replacement_item_id,
      resolution_note = left(trim(coalesce(target_note, '')), 2000)
  where request.id = request_record.id;

  if target_decision in ('accepted', 'removed') then
    perform public.recalculate_catalog_order_totals(request_record.order_id, request_record.catalog_id);
    if resolved_delta <> 0 then
      insert into public.order_payment_adjustments (
        catalog_id,
        order_id,
        substitution_request_id,
        kind,
        amount_delta
      ) values (
        request_record.catalog_id,
        request_record.order_id,
        request_record.id,
        case when resolved_delta > 0 then 'additional_charge' else 'refund' end,
        resolved_delta
      );
    end if;
  end if;

  insert into public.order_messages (
    catalog_id,
    order_id,
    sender_auth_user_id,
    sender_kind,
    message_type,
    body,
    substitution_request_id
  ) values (
    request_record.catalog_id,
    request_record.order_id,
    (select auth.uid()),
    'system',
    'substitution_decision',
    case target_decision
      when 'accepted' then concat('Клиент принял замену. Изменение суммы: ', resolved_delta, ' ₽.')
      when 'removed' then concat('Клиент удалил отсутствующий товар. Изменение суммы: ', resolved_delta, ' ₽.')
      else 'Клиент попросил предложить другой вариант.'
    end,
    request_record.id
  );

  return jsonb_build_object(
    'resolved', true,
    'state', resolved_state,
    'amountDelta', resolved_delta,
    'replacementOrderItemId', replacement_item_id
  );
end;
$$;

create or replace function public.send_order_message(
  target_order_id uuid,
  target_catalog_id uuid,
  target_body text,
  client_session_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_body text := trim(coalesce(target_body, ''));
  resolved_sender_kind text;
  created_message_id uuid;
begin
  if char_length(normalized_body) < 1 or char_length(normalized_body) > 2000 then
    raise exception 'order_message_body_invalid';
  end if;
  if public.is_current_order_client(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token) then
    resolved_sender_kind := 'client';
  elsif public.can_access_order_conversation(target_order_id, target_catalog_id) then
    resolved_sender_kind := 'staff';
  else
    raise exception 'order_conversation_access_required';
  end if;

  insert into public.order_messages (
    catalog_id, order_id, sender_auth_user_id, sender_kind, message_type, body
  ) values (
    target_catalog_id,
    target_order_id,
    (select auth.uid()),
    resolved_sender_kind,
    'text',
    normalized_body
  ) returning id into created_message_id;

  return created_message_id;
end;
$$;

create or replace function public.get_order_conversation(
  target_order_id uuid,
  target_catalog_id uuid,
  client_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_kind text;
begin
  if not (
    public.can_access_order_conversation(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token)
  ) then
    raise exception 'order_conversation_access_required';
  end if;
  viewer_kind := case
    when public.is_current_order_client(target_order_id, target_catalog_id)
      or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token) then 'client'
    else 'staff'
  end;

  return jsonb_build_object(
    'viewerKind', viewer_kind,
    'substitutions', coalesce((
      select jsonb_agg(to_jsonb(request) order by request.proposed_at, request.id)
      from public.order_substitution_requests request
      where request.order_id = target_order_id
        and request.catalog_id = target_catalog_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
      from public.order_messages message
      where message.order_id = target_order_id
        and message.catalog_id = target_catalog_id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(to_jsonb(adjustment) order by adjustment.created_at, adjustment.id)
      from public.order_payment_adjustments adjustment
      where adjustment.order_id = target_order_id
        and adjustment.catalog_id = target_catalog_id
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.order_substitution_requests enable row level security;
alter table public.order_payment_adjustments enable row level security;
alter table public.order_messages enable row level security;

drop policy if exists "order substitutions participant read" on public.order_substitution_requests;
create policy "order substitutions participant read"
on public.order_substitution_requests for select to authenticated
using (public.can_access_order_conversation(order_id, catalog_id));

drop policy if exists "order adjustments participant read" on public.order_payment_adjustments;
create policy "order adjustments participant read"
on public.order_payment_adjustments for select to authenticated
using (public.can_access_order_conversation(order_id, catalog_id));

drop policy if exists "order messages participant read" on public.order_messages;
create policy "order messages participant read"
on public.order_messages for select to authenticated
using (public.can_access_order_conversation(order_id, catalog_id));

grant select on table public.order_substitution_requests to authenticated, service_role;
grant select on table public.order_payment_adjustments to authenticated, service_role;
grant select on table public.order_messages to authenticated, service_role;
grant insert, update on table public.order_substitution_requests to service_role;
grant insert, update on table public.order_payment_adjustments to service_role;
grant insert on table public.order_messages to service_role;

revoke all on function public.is_current_order_client(uuid, uuid) from public, anon;
revoke all on function public.is_client_session_order_client(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.can_work_catalog_order(uuid, uuid) from public, anon;
revoke all on function public.can_access_order_conversation(uuid, uuid) from public, anon;
revoke all on function public.recalculate_catalog_order_totals(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_catalog_order_item_picked(uuid, integer) from public, anon;
revoke all on function public.propose_catalog_order_substitution(uuid, uuid, uuid, integer, text) from public, anon;
revoke all on function public.resolve_order_substitution(uuid, text, integer, text, text) from public, anon;
revoke all on function public.send_order_message(uuid, uuid, text, text) from public, anon;
revoke all on function public.get_order_conversation(uuid, uuid, text) from public, anon;

grant execute on function public.is_current_order_client(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_client_session_order_client(uuid, uuid, text) to service_role;
grant execute on function public.can_work_catalog_order(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_order_conversation(uuid, uuid) to authenticated, service_role;
grant execute on function public.mark_catalog_order_item_picked(uuid, integer) to authenticated, service_role;
grant execute on function public.propose_catalog_order_substitution(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.resolve_order_substitution(uuid, text, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.send_order_message(uuid, uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.get_order_conversation(uuid, uuid, text) to anon, authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.order_substitution_requests;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.order_messages;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;

create or replace function public.protect_client_order_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'client'
    and (
      new.order_id is null
      or not exists (
        select 1
        from public.orders order_record
        where order_record.id = new.order_id
          and (
            exists (
              select 1
              from public.users platform_user
              where platform_user.id = order_record.client_id
                and platform_user.auth_user_id = new.user_id
            )
            or exists (
              select 1
              from public.client_accounts account
              where account.id = new.user_id
                and account.phone_normalized = public.normalize_client_phone(
                  pg_catalog.coalesce(order_record.client_phone, order_record.customer_phone, '')
                )
            )
          )
      )
    ) then
    raise exception 'client_push_order_ownership_required';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_client_order_push_subscription() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.web_push_subscriptions') is not null then
    execute format(
      'alter table public.web_push_subscriptions add column if not exists app_base_url text not null default %L',
      ''
    );
    execute 'drop trigger if exists protect_client_order_push_subscription on public.web_push_subscriptions';
    execute 'create trigger protect_client_order_push_subscription before insert or update of role, order_id, user_id on public.web_push_subscriptions for each row execute function public.protect_client_order_push_subscription()';
  end if;
end;
$$;

create or replace function public.upsert_client_order_push_subscription(
  client_session_token text,
  subscription_endpoint text,
  p256dh_key text,
  auth_key text,
  order_id_input uuid,
  app_base_url_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_record public.client_accounts%rowtype;
  order_catalog_id uuid;
  subscription_id uuid;
begin
  select account.*
  into account_record
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(
      pg_catalog.convert_to(pg_catalog.coalesce(client_session_token, ''), 'UTF8'),
      'sha256'
    )
    and session.expires_at > pg_catalog.now();

  if account_record.id is null then
    raise exception 'client_session_invalid';
  end if;

  select order_record.catalog_id
  into order_catalog_id
  from public.orders order_record
  where order_record.id = order_id_input
    and public.normalize_client_phone(
      pg_catalog.coalesce(order_record.client_phone, order_record.customer_phone, '')
    ) = account_record.phone_normalized;

  if order_catalog_id is null then
    raise exception 'client_push_order_ownership_required';
  end if;

  insert into public.web_push_subscriptions (
    user_id, role, catalog_id, driver_id, order_id, endpoint, p256dh, auth, app_base_url, user_agent, last_seen_at
  ) values (
    account_record.id, 'client', order_catalog_id, null, order_id_input,
    pg_catalog.trim(subscription_endpoint), pg_catalog.trim(p256dh_key), pg_catalog.trim(auth_key),
    case when pg_catalog.trim(pg_catalog.coalesce(app_base_url_input, '')) ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*)?$'
      then pg_catalog.rtrim(pg_catalog.trim(app_base_url_input), '/') else '' end,
    pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.current_setting('request.headers', true), '')::json ->> 'user-agent',
      ''
    ),
    pg_catalog.now()
  )
  on conflict (user_id, endpoint) do update set
    role = excluded.role,
    catalog_id = excluded.catalog_id,
    driver_id = excluded.driver_id,
    order_id = excluded.order_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    app_base_url = excluded.app_base_url,
    user_agent = excluded.user_agent,
    last_seen_at = pg_catalog.now()
  returning id into subscription_id;

  update public.client_account_sessions
  set last_used_at = pg_catalog.now()
  where token_hash = extensions.digest(
    pg_catalog.convert_to(pg_catalog.coalesce(client_session_token, ''), 'UTF8'),
    'sha256'
  );

  return subscription_id;
end;
$$;

revoke all on function public.upsert_client_order_push_subscription(text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.upsert_client_order_push_subscription(text, text, text, text, uuid, text)
  to anon, authenticated, service_role;

do $$
begin
  if to_regprocedure('public.enqueue_web_push_event()') is not null then
    execute 'drop trigger if exists web_push_order_substitution_event on public.order_substitution_requests';
    execute 'create trigger web_push_order_substitution_event after insert or update of state on public.order_substitution_requests for each row execute function public.enqueue_web_push_event()';
    execute 'drop trigger if exists web_push_order_message_event on public.order_messages';
    execute 'create trigger web_push_order_message_event after insert on public.order_messages for each row execute function public.enqueue_web_push_event()';
  end if;
end;
$$;
