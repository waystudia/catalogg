alter table public.client_reviews
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists client_account_id uuid references public.client_accounts(id) on delete set null;

alter table public.client_reviews
  drop constraint if exists client_reviews_order_unique;

alter table public.client_reviews
  add constraint client_reviews_order_unique unique (order_id);

drop policy if exists "client reviews public insert" on public.client_reviews;
revoke insert on table public.client_reviews from anon, authenticated;

create or replace function public.submit_client_review(
  client_session_token text,
  target_order_id uuid,
  target_rating integer,
  target_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account_row public.client_accounts%rowtype;
  order_catalog_id uuid;
  order_phone text;
  normalized_comment text := trim(coalesce(target_comment, ''));
  review_row public.client_reviews%rowtype;
begin
  select account.*
    into account_row
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if account_row.id is null then
    raise exception 'client_review_auth_required';
  end if;

  if target_rating < 1 or target_rating > 5 then
    raise exception 'client_review_rating_invalid';
  end if;

  if char_length(normalized_comment) < 2 or char_length(normalized_comment) > 2000 then
    raise exception 'client_review_comment_invalid';
  end if;

  select orders.catalog_id,
         public.normalize_client_phone(coalesce(nullif(orders.client_phone, ''), orders.customer_phone))
    into order_catalog_id, order_phone
  from public.orders
  where orders.id = target_order_id;

  if order_catalog_id is null then
    raise exception 'client_review_order_not_found';
  end if;

  if order_phone <> account_row.phone_normalized then
    raise exception 'client_review_order_forbidden';
  end if;

  insert into public.client_reviews (
    restaurant_id,
    order_id,
    client_account_id,
    client_name,
    client_phone,
    rating,
    comment,
    target_type,
    is_visible
  )
  values (
    order_catalog_id,
    target_order_id,
    account_row.id,
    account_row.name,
    account_row.phone,
    target_rating,
    normalized_comment,
    'restaurant',
    true
  )
  on conflict (order_id) do update
  set client_account_id = excluded.client_account_id,
      client_name = excluded.client_name,
      client_phone = excluded.client_phone,
      rating = excluded.rating,
      comment = excluded.comment,
      is_visible = true,
      created_at = now()
  where public.client_reviews.client_account_id = excluded.client_account_id
  returning * into review_row;

  if review_row.id is null then
    raise exception 'client_review_order_forbidden';
  end if;

  update public.client_account_sessions
  set last_used_at = now()
  where token_hash = extensions.digest(client_session_token, 'sha256');

  return jsonb_build_object(
    'id', review_row.id,
    'restaurant_id', review_row.restaurant_id,
    'rating', review_row.rating,
    'comment', review_row.comment,
    'created_at', review_row.created_at
  );
end;
$$;

revoke all on function public.submit_client_review(text, uuid, integer, text) from public;
grant execute on function public.submit_client_review(text, uuid, integer, text) to anon, authenticated;
