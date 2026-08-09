alter table public.platform_banners
  add column if not exists display_duration_ms integer not null default 5000;

alter table public.platform_banners
  drop constraint if exists platform_banners_display_duration_ms_check,
  add constraint platform_banners_display_duration_ms_check
    check (display_duration_ms between 2000 and 60000);
