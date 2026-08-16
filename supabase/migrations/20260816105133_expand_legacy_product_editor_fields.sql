alter table public.product
  add column if not exists old_price integer,
  add column if not exists modifier_groups jsonb not null default '[]'::jsonb,
  add column if not exists pricing_type text,
  add column if not exists price_prefix text,
  add column if not exists price_tier text,
  add column if not exists unit text,
  add column if not exists minimum_weight numeric,
  add column if not exists weight_step numeric,
  add column if not exists preparation_time text,
  add column if not exists advance_order_hours integer,
  add column if not exists allergens text[] not null default '{}'::text[],
  add column if not exists badges text[] not null default '{}'::text[],
  add column if not exists allow_inscription boolean not null default false,
  add column if not exists allow_decoration_comment boolean not null default false,
  add column if not exists allow_production_schedule boolean not null default false,
  add column if not exists placeholder_kind text,
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists cost_price integer,
  add column if not exists minimum_stock integer,
  add column if not exists master_product_id uuid,
  add column if not exists master_content_version integer,
  add column if not exists content_source text,
  add column if not exists sale_unit text,
  add column if not exists quantity_unit text,
  add column if not exists price_basis_quantity integer,
  add column if not exists minimum_quantity integer,
  add column if not exists quantity_step integer,
  add column if not exists stock_quantity integer,
  add column if not exists allow_substitution boolean not null default false;

alter table public.product
  drop constraint if exists product_modifier_groups_array_check;

alter table public.product
  add constraint product_modifier_groups_array_check
  check (jsonb_typeof(modifier_groups) = 'array');

notify pgrst, 'reload schema';
