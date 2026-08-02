begin;

update public.product_images
set url = replace(
  url,
  'https://tggwiyvalfvcsvuyhaxc.supabase.co',
  'https://api.wayyaam.ru'
)
where url like 'https://tggwiyvalfvcsvuyhaxc.supabase.co/%';

update public.platform_banners
set image_url = replace(
  image_url,
  'https://tggwiyvalfvcsvuyhaxc.supabase.co',
  'https://api.wayyaam.ru'
)
where image_url like 'https://tggwiyvalfvcsvuyhaxc.supabase.co/%';

update public.platform_content_pages
set blocks = replace(
  blocks::text,
  'https://tggwiyvalfvcsvuyhaxc.supabase.co',
  'https://api.wayyaam.ru'
)::jsonb
where blocks::text like '%https://tggwiyvalfvcsvuyhaxc.supabase.co/%';

do $$
begin
  if exists (
    select 1
    from public.product_images
    where url like '%supabase.co%'
  ) or exists (
    select 1
    from public.platform_banners
    where coalesce(image_url, '') like '%supabase.co%'
  ) or exists (
    select 1
    from public.platform_content_pages
    where blocks::text like '%supabase.co%'
  ) then
    raise exception 'Cloud Supabase Storage URLs remain in runtime content';
  end if;
end
$$;

commit;
