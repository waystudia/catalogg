-- The established restaurant pricing trigger runs before the universal sale
-- snapshot trigger. Teach it about grocery gram quantities without changing
-- legacy restaurant/confectionery per-kg options.
do $migration$
begin
  if to_regprocedure('public.apply_catalog_variant_price_to_order_item()') is null then
    return;
  end if;

  execute $definition$
    create or replace function public.apply_catalog_variant_price_to_order_item()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $function$
    declare
      settings_product_id text;
      resolved_variant_price integer;
      modifier_delta integer := 0;
      product_config jsonb := '{}'::jsonb;
      product_sale_unit text := 'piece';
      product_price_basis_quantity integer := 1;
      product_minimum_quantity integer := 1;
      product_quantity_step integer := 1;
      product_stock_quantity integer := 0;
      product_is_unlimited boolean := false;
      selected_weight numeric;
      selected_weight_grams integer;
      requested_per_item integer;
      minimum_weight numeric;
      weight_step numeric;
    begin
      settings_product_id := coalesce(
        new.product_id::text,
        nullif(trim(new.options #>> '{0,product_id}'), '')
      );

      if new.product_id is not null then
        select
          coalesce(product.custom_fields, '{}'::jsonb),
          coalesce(product.sale_unit, 'piece'),
          greatest(product.price_basis_quantity, 1),
          greatest(product.minimum_quantity, 1),
          greatest(product.quantity_step, 1),
          greatest(product.stock_quantity, 0),
          product.is_unlimited
        into
          product_config,
          product_sale_unit,
          product_price_basis_quantity,
          product_minimum_quantity,
          product_quantity_step,
          product_stock_quantity,
          product_is_unlimited
        from public.products product
        where product.id = new.product_id
          and product.catalog_id = new.catalog_id;
      end if;

      -- Accepted substitutions intentionally preserve an immutable snapshot and
      -- do not retain a live product_id. Price those rows from the snapshot so
      -- later catalog edits or deletion cannot change the agreed amount.
      if new.product_id is null or not found then
        product_sale_unit := coalesce(nullif(new.sale_unit_snapshot, ''), 'piece');
        product_price_basis_quantity := greatest(
          coalesce(new.price_basis_quantity_snapshot, 1),
          1
        );
        product_minimum_quantity := 1;
        product_quantity_step := 1;
        product_is_unlimited := true;
      end if;

      if new.variant_id is not null then
        select variant.price
        into resolved_variant_price
        from public.product_variants variant
        where variant.id = new.variant_id
          and variant.product_id = new.product_id
          and variant.catalog_id = new.catalog_id;
      end if;

      if resolved_variant_price is null then
        select (choice.value ->> 'price')::integer
        into resolved_variant_price
        from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(product_config -> 'choice_options') = 'array'
            then product_config -> 'choice_options' else '[]'::jsonb end
        ) as choice(value)
        where coalesce(choice.value ->> 'price', '') ~ '^[0-9]+$'
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
            where trim(selected.value ->> 'name') = trim(choice.value ->> 'name')
          )
        limit 1;
      end if;

      if resolved_variant_price is null then
        select (choice.value ->> 'price')::integer
        into resolved_variant_price
        from public.catalog_sections section
        cross join lateral pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(section.settings -> settings_product_id) = 'array'
            then section.settings -> settings_product_id else '[]'::jsonb end
        ) as choice(value)
        where section.catalog_id = new.catalog_id
          and section.key = 'product-choices'
          and coalesce(choice.value ->> 'price', '') ~ '^[0-9]+$'
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
            where trim(selected.value ->> 'name') = trim(choice.value ->> 'name')
          )
        limit 1;
      end if;

      if new.product_id is not null then
        select coalesce(sum(option_row.price_delta), 0)::integer
        into modifier_delta
        from pg_catalog.jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
        join public.product_option_groups group_row
          on group_row.catalog_id = new.catalog_id
         and group_row.product_id = new.product_id
         and group_row.id::text = selected.value ->> 'group_id'
        join public.product_options option_row
          on option_row.catalog_id = new.catalog_id
         and option_row.group_id = group_row.id
         and option_row.id::text = selected.value ->> 'option_id';
      end if;

      if product_config = '{}'::jsonb then
        select coalesce(section.settings -> settings_product_id, '{}'::jsonb)
        into product_config
        from public.catalog_sections section
        where section.catalog_id = new.catalog_id
          and section.key = 'product-config'
        limit 1;
      end if;

      select (selected.value ->> 'value')::numeric
      into selected_weight
      from pg_catalog.jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
      where selected.value ->> 'key' = 'weight'
        and coalesce(selected.value ->> 'value', '') ~ '^[0-9]+([.][0-9]+)?$'
      limit 1;

      if product_sale_unit = 'weight' then
        if selected_weight is not null then
          selected_weight_grams := round(selected_weight * 1000)::integer * greatest(new.quantity, 1);
        end if;

        if new.requested_quantity is null then
          new.requested_quantity := selected_weight_grams;
        elsif selected_weight_grams is not null
          and new.requested_quantity <> selected_weight_grams then
          raise exception 'weighted_requested_quantity_mismatch';
        end if;

        if new.requested_quantity is null or new.requested_quantity <= 0
          or new.requested_quantity % greatest(new.quantity, 1) <> 0 then
          raise exception 'weighted_requested_quantity_required';
        end if;

        requested_per_item := new.requested_quantity / greatest(new.quantity, 1);
        if requested_per_item < product_minimum_quantity
          or mod(requested_per_item - product_minimum_quantity, product_quantity_step) <> 0 then
          raise exception 'weighted_requested_quantity_invalid';
        end if;

        if not product_is_unlimited and new.requested_quantity > product_stock_quantity then
          raise exception 'Product stock is not enough';
        end if;

        new.unit_price := coalesce(resolved_variant_price, new.unit_price) + modifier_delta;
        new.line_total := round(
          new.unit_price::numeric * new.requested_quantity / product_price_basis_quantity
        )::integer;
      elsif product_config ->> 'pricing_type' = 'per_kg' then
        minimum_weight := greatest(0.1, coalesce((product_config ->> 'minimum_weight')::numeric, 1));
        weight_step := greatest(0.1, coalesce((product_config ->> 'weight_step')::numeric, 0.5));
        if selected_weight is null or selected_weight < minimum_weight
          or abs(((selected_weight - minimum_weight) / weight_step)
            - round((selected_weight - minimum_weight) / weight_step)) > 0.0001 then
          raise exception 'Unsupported product weight';
        end if;
        new.unit_price := round(new.unit_price * selected_weight)::integer + modifier_delta;
        new.line_total := new.unit_price * new.quantity;
      else
        new.unit_price := coalesce(resolved_variant_price, new.unit_price) + modifier_delta;
        new.line_total := new.unit_price * new.quantity;
      end if;

      return new;
    end;
    $function$
  $definition$;

  execute 'revoke all on function public.apply_catalog_variant_price_to_order_item() from public, anon, authenticated';
  execute 'grant execute on function public.apply_catalog_variant_price_to_order_item() to service_role';
end;
$migration$;

-- Hosted/local fixtures expose auth.users.email as text, while the self-hosted
-- production Auth schema uses varchar. RETURN QUERY requires an exact type.
create or replace function public.get_catalog_staff_for_catalog(target_catalog_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  is_active boolean,
  receives_new_orders boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_team_management_required';
  end if;

  return query
  select
    staff.user_id,
    coalesce(
      nullif(trim(profile.full_name), ''),
      split_part(coalesce(auth_user.email, ''), '@', 1),
      'Сотрудник'
    )::text,
    coalesce(auth_user.email, profile.email, '')::text,
    staff.role_code::text,
    role.name::text,
    staff.is_active,
    staff.receives_new_orders,
    staff.updated_at
  from public.catalog_staff_memberships staff
  join public.catalog_staff_roles role on role.code = staff.role_code
  join auth.users auth_user on auth_user.id = staff.user_id
  left join public.profiles profile on profile.id = staff.user_id
  where staff.catalog_id = target_catalog_id
  order by staff.is_active desc, role.sort_order, staff.updated_at desc;
end;
$$;

-- Self-hosted production may grant new public-schema tables to anon through
-- ALTER DEFAULT PRIVILEGES. Keep all sensitive workflow storage behind the
-- authenticated RLS policies and the custom-session security-definer RPCs.
revoke all on table
  public.catalog_staff_roles,
  public.catalog_staff_permissions,
  public.catalog_staff_role_permissions,
  public.catalog_staff_memberships,
  public.order_work_assignments,
  public.order_work_assignment_events,
  public.order_substitution_requests,
  public.order_payment_adjustments,
  public.order_messages,
  public.catalog_storefront_domains,
  public.catalog_storefront_domain_events
from public, anon;

revoke all on sequence
  public.order_work_assignment_events_id_seq,
  public.catalog_storefront_domain_events_id_seq
from public, anon, authenticated;

grant usage, select on sequence
  public.order_work_assignment_events_id_seq,
  public.catalog_storefront_domain_events_id_seq
to service_role;
