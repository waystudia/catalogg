-- Reusable restaurant commission plans. Existing restaurants keep their
-- published fixed tariff until a platform administrator explicitly assigns a
-- plan, so this migration does not change current billing implicitly.

create table if not exists public.restaurant_commission_plans (
  code text primary key,
  name text not null,
  calculation_type text not null check (calculation_type in ('capped_percent', 'fixed')),
  percent_rate numeric(7,4) not null default 0 check (percent_rate >= 0),
  minimum_amount numeric(12,2) not null default 0 check (minimum_amount >= 0),
  maximum_amount numeric(12,2) check (maximum_amount is null or maximum_amount >= minimum_amount),
  fixed_amount numeric(12,2) not null default 0 check (fixed_amount >= 0),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_commission_plan_assignments (
  client_id uuid primary key references public.clients(id) on delete cascade,
  plan_code text not null references public.restaurant_commission_plans(code) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.restaurant_commission_plans (
  code, name, calculation_type, percent_rate, minimum_amount, maximum_amount,
  fixed_amount, description, is_active
) values
  (
    'restaurant-percent-2-min-30-max-150',
    '2% · от 30 ₽ до 150 ₽',
    'capped_percent', 2, 30, 150, 0,
    '2% от суммы принятого заказа, минимум 30 ₽ и максимум 150 ₽',
    true
  ),
  (
    'restaurant-fixed-30',
    '30 ₽ за заказ',
    'fixed', 0, 0, null, 30,
    'Фиксированная комиссия 30 ₽ с каждого принятого заказа',
    true
  )
on conflict (code) do update set
  name = excluded.name,
  calculation_type = excluded.calculation_type,
  percent_rate = excluded.percent_rate,
  minimum_amount = excluded.minimum_amount,
  maximum_amount = excluded.maximum_amount,
  fixed_amount = excluded.fixed_amount,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.restaurant_commission_plans enable row level security;
alter table public.restaurant_commission_plan_assignments enable row level security;

revoke all on public.restaurant_commission_plans from public, anon, authenticated;
revoke all on public.restaurant_commission_plan_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.restaurant_commission_plans to authenticated;
grant select, insert, update, delete on public.restaurant_commission_plan_assignments to authenticated;

drop policy if exists "platform admins manage restaurant commission plans" on public.restaurant_commission_plans;
create policy "platform admins manage restaurant commission plans"
on public.restaurant_commission_plans for all to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

drop policy if exists "platform admins manage restaurant commission plan assignments" on public.restaurant_commission_plan_assignments;
create policy "platform admins manage restaurant commission plan assignments"
on public.restaurant_commission_plan_assignments for all to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

alter table public.billing_ledger_entries
  add column if not exists commission_plan_code text
  references public.restaurant_commission_plans(code) on delete restrict;

create or replace function public.calculate_restaurant_commission_amount(
  target_calculation_type text,
  target_percent_rate numeric,
  target_minimum_amount numeric,
  target_maximum_amount numeric,
  target_fixed_amount numeric,
  target_order_amount numeric
)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select round(
    case
      when target_calculation_type = 'fixed' then greatest(coalesce(target_fixed_amount, 0), 0)
      when target_calculation_type = 'capped_percent' then greatest(
        coalesce(target_minimum_amount, 0),
        least(
          coalesce(target_maximum_amount, 999999999.99),
          greatest(coalesce(target_order_amount, 0), 0) * coalesce(target_percent_rate, 0) / 100
        )
      )
      else 0
    end,
    2
  );
$$;

revoke all on function public.calculate_restaurant_commission_amount(text, numeric, numeric, numeric, numeric, numeric)
from public, anon, authenticated;

create or replace function public.record_restaurant_order_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client_id uuid;
  target_tariff_id uuid;
  target_plan public.restaurant_commission_plans;
  target_plan_code text;
  commission numeric(12,2);
  order_amount numeric(12,2);
begin
  if new.accepted_at is not null and old.accepted_at is null
     and (new.is_test_order or public.can_catalog_accept_real_orders(new.catalog_id)) then
    select client.id into target_client_id
    from public.clients client
    where client.catalog_id = new.catalog_id
    limit 1;

    select plan.* into target_plan
    from public.restaurant_commission_plan_assignments assignment
    join public.restaurant_commission_plans plan on plan.code = assignment.plan_code
    where assignment.client_id = target_client_id
      and plan.is_active
    limit 1;

    select tariff.id, tariff.restaurant_commission_amount
      into target_tariff_id, commission
    from public.restaurant_tariffs tariff
    where tariff.client_id = target_client_id
      and tariff.status = 'published'
      and coalesce(tariff.starts_at, now()) <= now()
      and (tariff.ends_at is null or tariff.ends_at > now())
    order by tariff.published_at desc
    limit 1;

    if target_plan.code is not null then
      order_amount := coalesce(new.total_amount, new.total::numeric, 0);
      target_plan_code := target_plan.code;
      commission := public.calculate_restaurant_commission_amount(
        target_plan.calculation_type,
        target_plan.percent_rate,
        target_plan.minimum_amount,
        target_plan.maximum_amount,
        target_plan.fixed_amount,
        order_amount
      );
    end if;

    commission := coalesce(
      commission,
      (select restaurant_order_commission from public.platform_financial_policy_settings where id = 'global'),
      30
    );

    insert into public.billing_ledger_entries(
      event_key, ledger_scope, entry_type, account_type, account_id,
      counterparty_type, order_id, tariff_id, commission_plan_code, reason, amount, is_test
    ) values (
      'order:' || new.id || ':restaurant_order_commission', 'platform_debt', 'charge',
      'restaurant', target_client_id, 'platform', new.id, target_tariff_id,
      target_plan_code, 'restaurant_order_commission', commission, new.is_test_order
    ) on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_restaurant_order_commission() from public, anon, authenticated;
