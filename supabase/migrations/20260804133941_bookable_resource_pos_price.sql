-- Preserve the optional cabin price used by the POS and hall editor.
-- Existing resources remain unchanged and default to a free place.
alter table public.bookable_resources
  add column if not exists price integer not null default 0;

alter table public.bookable_resources
  drop constraint if exists bookable_resources_price_nonnegative;

alter table public.bookable_resources
  add constraint bookable_resources_price_nonnegative check (price >= 0);
