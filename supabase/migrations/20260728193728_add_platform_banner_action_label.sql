alter table public.platform_banners
  add column if not exists action_label text not null default 'Заказать';
