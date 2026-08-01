alter table public.product_option_groups
  add column if not exists is_active boolean not null default true;

alter table public.product_options
  add column if not exists is_active boolean not null default true;
