alter table public.product
  add column if not exists choice_card_options jsonb not null default '[]'::jsonb;

alter table public.product
  drop constraint if exists product_choice_card_options_array_check;

alter table public.product
  add constraint product_choice_card_options_array_check
  check (jsonb_typeof(choice_card_options) = 'array');
