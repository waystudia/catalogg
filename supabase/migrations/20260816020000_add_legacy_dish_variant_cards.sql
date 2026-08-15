alter table public.product
  add column if not exists publish_choice_cards boolean not null default false,
  add column if not exists generated_from_choice text,
  add column if not exists generated_choice_index integer;

alter table public.product
  drop constraint if exists product_generated_choice_index_check;

alter table public.product
  add constraint product_generated_choice_index_check
  check (generated_choice_index is null or generated_choice_index >= 0);

alter table public.product
  drop constraint if exists product_generated_from_choice_fkey;

alter table public.product
  add constraint product_generated_from_choice_fkey
  foreign key (generated_from_choice)
  references public.product(id)
  on update cascade
  on delete cascade;

create unique index if not exists product_generated_choice_unique_idx
  on public.product (generated_from_choice, generated_choice_index)
  where generated_from_choice is not null;
