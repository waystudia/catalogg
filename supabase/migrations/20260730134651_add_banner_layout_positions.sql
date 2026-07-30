alter table public.platform_banners
  add column if not exists content_position text not null default 'top-left',
  add column if not exists button_position text not null default 'bottom-left';

alter table public.platform_banners
  drop constraint if exists platform_banners_content_position_check,
  add constraint platform_banners_content_position_check
    check (content_position in (
      'top-left', 'top-center', 'top-right',
      'center-left', 'center', 'center-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    )),
  drop constraint if exists platform_banners_button_position_check,
  add constraint platform_banners_button_position_check
    check (button_position in (
      'top-left', 'top-center', 'top-right',
      'center-left', 'center', 'center-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ));
