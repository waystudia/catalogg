-- Mangal Supabase schema and starter data.
-- Paste this whole file into Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.admin_user (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant (
  id text primary key,
  name text not null default '',
  subtitle text not null default '',
  logo_url text not null default '',
  banner_url text not null default '',
  whatsapp text not null default '',
  instagram_url text not null default '',
  address text not null default '',
  "mapLink" text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant add column if not exists "mapLink" text not null default '';

create table if not exists public.category (
  id text primary key,
  name text not null,
  image text not null default '',
  icon text not null default 'flame',
  kind text not null default 'food' check (kind in ('food', 'drink', 'space')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.category add column if not exists show_on_home boolean not null default true;
alter table public.category add column if not exists show_in_order_flow boolean not null default false;

create table if not exists public.catalog_tag (
  id text primary key,
  name text not null,
  icon text not null default '',
  color text not null default '#f59e0b',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product (
  id text primary key,
  title text not null,
  price integer not null default 0 check (price >= 0),
  description text not null default '',
  image_url text not null default '',
  ingredients text not null default '',
  weight text not null default '',
  spicy_level integer not null default 0 check (spicy_level between 0 and 3),
  serving text not null default '',
  is_popular boolean not null default false,
  is_new boolean not null default false,
  is_hit boolean not null default false,
  is_hidden boolean not null default false,
  daily_stock integer not null default 0 check (daily_stock >= 0),
  current_stock integer not null default 0 check (current_stock >= 0),
  is_unlimited boolean not null default false,
  stock_count integer not null default 0 check (stock_count >= 0),
  category_id text not null references public.category(id) on update cascade on delete restrict,
  category_ids text[] not null default '{}',
  drink_type text,
  pair_ids text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product add column if not exists category_ids text[] not null default '{}';
alter table public.product add column if not exists daily_stock integer not null default 0 check (daily_stock >= 0);
alter table public.product add column if not exists current_stock integer not null default 0 check (current_stock >= 0);
alter table public.product add column if not exists is_unlimited boolean not null default false;
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
update public.product set category_ids = array[category_id] where category_ids = '{}';
update public.product
set daily_stock = stock_count,
    current_stock = stock_count
where daily_stock = 0 and current_stock = 0 and stock_count > 0;

create table if not exists public.product_tag (
  product_id text not null references public.product(id) on update cascade on delete cascade,
  tag_id text not null references public.catalog_tag(id) on update cascade on delete cascade,
  primary key (product_id, tag_id)
);

create table if not exists public.cabin (
  id text primary key,
  title text not null,
  capacity text not null default '',
  feature text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.theme_settings (
  id text primary key,
  restaurant_id text not null references public.restaurant(id) on update cascade on delete cascade,
  background_type text not null default 'color' check (background_type in ('color', 'image')),
  background_color text not null default '#070809',
  background_image_url text not null default '',
  card_color text not null default '#121416',
  product_card_color text not null default '#121416',
  product_card_text_color text not null default '#f8f5ef',
  settings_card_color text not null default '#121416',
  settings_card_text_color text not null default '#f8f5ef',
  cart_panel_color text not null default '#111111',
  cart_panel_text_color text not null default '#f8f5ef',
  card_radius integer not null default 18,
  card_shadow text not null default '0 18px 46px rgba(0, 0, 0, 0.28)',
  text_primary text not null default '#f8f5ef',
  text_secondary text not null default '#aaa39a',
  product_title_color text not null default '#f8f5ef',
  category_title_color text not null default '#f8f5ef',
  accent_color text not null default '#e8a23a',
  accent_secondary text not null default '#ffd082',
  button_style text not null default 'filled' check (button_style in ('filled', 'outline')),
  button_radius integer not null default 14,
  header_style text not null default 'centered' check (header_style in ('centered', 'compact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.theme_settings add column if not exists product_card_color text not null default '#121416';
alter table public.theme_settings add column if not exists product_card_text_color text not null default '#f8f5ef';
alter table public.theme_settings add column if not exists settings_card_color text not null default '#121416';
alter table public.theme_settings add column if not exists settings_card_text_color text not null default '#f8f5ef';
alter table public.theme_settings add column if not exists cart_panel_color text not null default '#111111';
alter table public.theme_settings add column if not exists cart_panel_text_color text not null default '#f8f5ef';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_updated_at on public.restaurant;
create trigger restaurant_updated_at before update on public.restaurant for each row execute function public.set_updated_at();
drop trigger if exists category_updated_at on public.category;
create trigger category_updated_at before update on public.category for each row execute function public.set_updated_at();
drop trigger if exists catalog_tag_updated_at on public.catalog_tag;
create trigger catalog_tag_updated_at before update on public.catalog_tag for each row execute function public.set_updated_at();
drop trigger if exists product_updated_at on public.product;
create trigger product_updated_at before update on public.product for each row execute function public.set_updated_at();
drop trigger if exists cabin_updated_at on public.cabin;
create trigger cabin_updated_at before update on public.cabin for each row execute function public.set_updated_at();
drop trigger if exists theme_settings_updated_at on public.theme_settings;
create trigger theme_settings_updated_at before update on public.theme_settings for each row execute function public.set_updated_at();

alter table public.restaurant enable row level security;
alter table public.admin_user enable row level security;
alter table public.category enable row level security;
alter table public.catalog_tag enable row level security;
alter table public.product enable row level security;
alter table public.product_tag enable row level security;
alter table public.cabin enable row level security;
alter table public.theme_settings enable row level security;

drop policy if exists "admin users read own row" on public.admin_user;
create policy "admin users read own row" on public.admin_user for select using (auth.uid() = user_id);

drop policy if exists "admin users manage admin users" on public.admin_user;

drop policy if exists "public read restaurant" on public.restaurant;
create policy "public read restaurant" on public.restaurant for select using (true);
drop policy if exists "public write restaurant" on public.restaurant;
drop policy if exists "admin write restaurant" on public.restaurant;
create policy "admin write restaurant" on public.restaurant for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read category" on public.category;
create policy "public read category" on public.category for select using (true);
drop policy if exists "public write category" on public.category;
drop policy if exists "admin write category" on public.category;
create policy "admin write category" on public.category for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read catalog_tag" on public.catalog_tag;
create policy "public read catalog_tag" on public.catalog_tag for select using (true);
drop policy if exists "public write catalog_tag" on public.catalog_tag;
drop policy if exists "admin write catalog_tag" on public.catalog_tag;
create policy "admin write catalog_tag" on public.catalog_tag for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read product" on public.product;
create policy "public read product" on public.product for select using (true);
drop policy if exists "public write product" on public.product;
drop policy if exists "admin write product" on public.product;
create policy "admin write product" on public.product for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read product_tag" on public.product_tag;
create policy "public read product_tag" on public.product_tag for select using (true);
drop policy if exists "public write product_tag" on public.product_tag;
drop policy if exists "admin write product_tag" on public.product_tag;
create policy "admin write product_tag" on public.product_tag for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read cabin" on public.cabin;
create policy "public read cabin" on public.cabin for select using (true);
drop policy if exists "public write cabin" on public.cabin;
drop policy if exists "admin write cabin" on public.cabin;
create policy "admin write cabin" on public.cabin for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

drop policy if exists "public read theme_settings" on public.theme_settings;
create policy "public read theme_settings" on public.theme_settings for select using (true);
drop policy if exists "public write theme_settings" on public.theme_settings;
drop policy if exists "admin write theme_settings" on public.theme_settings;
create policy "admin write theme_settings" on public.theme_settings for all
using (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()))
with check (exists (select 1 from public.admin_user admin where admin.user_id = auth.uid()));

insert into public.restaurant (id, name, subtitle, logo_url, banner_url, whatsapp, instagram_url, address, "mapLink")
values (
  'mangal',
  'Мангал',
  'ресторан',
  '',
  '/assets/mangal-demo/cover.webp',
  '79990000000',
  'https://instagram.com/',
  'ул. Центральная, 12',
  'https://yandex.ru/maps/?ll=45.6986,43.3178&z=16&pt=45.6986,43.3178,pm2rdm'
)
on conflict (id) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  logo_url = excluded.logo_url,
  banner_url = excluded.banner_url,
  whatsapp = excluded.whatsapp,
  instagram_url = excluded.instagram_url,
  address = excluded.address,
  "mapLink" = excluded."mapLink";

insert into public.category (id, name, image, icon, kind, sort_order)
values
  ('chechen', 'Чеченские блюда', '/assets/mangal-demo/products/zhizhig-galnash.webp', 'pot', 'food', 0),
  ('pizza', 'Пиццы', '/assets/mangal-demo/products/four-seasons.webp', 'pizza', 'food', 1),
  ('fastfood', 'Фастфуд', '/assets/mangal-demo/products/shawarma-combo.webp', 'burger', 'food', 2),
  ('grill', 'Мясо', '/assets/mangal-demo/products/lamb-skewer.webp', 'flame', 'food', 3),
  ('fridge', 'Напитки из холодильника', '/assets/mangal-demo/products/pepsi.webp', 'bottle', 'drink', 4),
  ('lemonades', 'Лимонады в графине', '/assets/mangal-demo/products/strawberry-lemonade.webp', 'glass', 'drink', 5),
  ('tea', 'Чай', '/assets/mangal-demo/products/chechen-tea.webp', 'tea', 'drink', 6),
  ('cabins', 'Кабинки', '/assets/mangal-demo/cabins/cabin-1.webp', 'home', 'space', 7)
on conflict (id) do update set
  name = excluded.name,
  image = excluded.image,
  icon = excluded.icon,
  kind = excluded.kind,
  sort_order = excluded.sort_order;

insert into public.catalog_tag (id, name, icon, color, sort_order)
values
  ('hit', 'Хит', '🔥', '#ef4444', 0),
  ('popular', 'Популярное', '⭐', '#f59e0b', 1),
  ('new', 'Новинка', 'NEW', '#38bdf8', 2),
  ('vegetarian', 'Вегетарианское', '🌿', '#22c55e', 3)
on conflict (id) do update set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color,
  sort_order = excluded.sort_order;

insert into public.product (
  id, title, price, description, image_url, ingredients, weight, spicy_level, serving,
  is_popular, is_new, is_hit, is_hidden, stock_count, category_id, drink_type, pair_ids, sort_order
)
values
  ('lamb-skewer', 'Шашлык из баранины', 690, 'Сочный шашлык из баранины с пряными специями и луком.', '/assets/mangal-demo/products/lamb-skewer.webp', 'Баранина, специи, лук, соль, перец', '250 г', 2, 'с луком и соусом', true, false, true, false, 12, 'grill', null, array['chechen-tea', 'ayran', 'tarhun', 'signature-sauce'], 0),
  ('zhizhig-galnash', 'Жижиг-галнаш', 380, 'Традиционный чеченский суп с галушками из теста.', '/assets/mangal-demo/products/zhizhig-galnash.webp', 'Говядина, галушки, бульон, зелень', '420 г', 1, 'с чесночным соусом', true, false, false, false, 8, 'chechen', null, array['chechen-tea', 'ayran'], 1),
  ('four-seasons', 'Четыре сезона', 550, 'Пицца с ветчиной, грибами, оливками и артишоками.', '/assets/mangal-demo/products/four-seasons.webp', 'Тесто, сыр, томаты, ветчина, грибы, оливки', '520 г', 0, 'с томатным соусом', true, false, false, false, 9, 'pizza', null, array['coca-cola', 'sprite'], 2),
  ('shawarma-combo', 'Комбо шаурма', 400, 'Шаурма с сочным мясом, овощами и картофелем.', '/assets/mangal-demo/products/shawarma-combo.webp', 'Курица, лаваш, овощи, картофель, соус', '360 г', 1, 'с картофелем', true, true, false, false, 16, 'fastfood', null, array['pepsi', 'fanta'], 3),
  ('bone-steak', 'Стейк на косточке', 1390, 'Сочный стейк из говядины на кости.', '/assets/mangal-demo/products/bone-steak.webp', 'Говядина, соль, перец, розмарин', '430 г', 1, 'с перечным соусом', false, false, true, false, 5, 'grill', null, array['blue-lagoon', 'signature-sauce'], 4),
  ('grilled-vegetables', 'Овощи на мангале', 320, 'Сезонные овощи, приготовленные на углях.', '/assets/mangal-demo/products/grilled-vegetables.webp', 'Перец, баклажан, кабачок, томаты', '280 г', 0, 'с зеленью', true, false, false, false, 0, 'grill', null, array['ayran'], 5),
  ('coca-cola', 'Coca-Cola', 120, 'Классический освежающий вкус.', '/assets/mangal-demo/products/coca-cola.webp', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 20, 'fridge', 'Холодильник', '{}', 6),
  ('pepsi', 'Pepsi', 120, 'Освежающий вкус с легкой сладостью.', '/assets/mangal-demo/products/pepsi.webp', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 20, 'fridge', 'Холодильник', '{}', 7),
  ('fanta', 'Fanta', 120, 'Апельсиновый вкус и яркое настроение.', '/assets/mangal-demo/products/fanta.webp', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 15, 'fridge', 'Холодильник', '{}', 8),
  ('sprite', 'Sprite', 120, 'Лимонно-лаймовый вкус и свежесть.', '/assets/mangal-demo/products/sprite.webp', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 18, 'fridge', 'Холодильник', '{}', 9),
  ('ayran', 'Айран', 150, 'Освежающий кисломолочный напиток.', '/assets/mangal-demo/products/ayran.webp', 'Кисломолочный напиток, соль, мята', '250 мл', 0, 'охлажденный', true, false, false, false, 14, 'fridge', 'Айран', '{}', 10),
  ('chechen-tea', 'Чеченский чай', 200, 'Душистый зеленый чай с чабрецом и горными травами.', '/assets/mangal-demo/products/chechen-tea.webp', 'Зеленый чай, чабрец, травы', '450 мл', 0, 'в чайнике', true, false, false, false, 30, 'tea', 'Чай', '{}', 11),
  ('strawberry-lemonade', 'Клубничный лимонад', 220, 'Освежающий лимонад с клубникой и мятой.', '/assets/mangal-demo/products/strawberry-lemonade.webp', 'Клубника, лимон, мята, содовая', '450 мл', 0, 'со льдом', true, true, false, false, 10, 'lemonades', 'Лимонады', '{}', 12),
  ('blue-lagoon', 'Синяя лагуна', 250, 'Яркий цитрусовый лимонад с легкими морскими нотками.', '/assets/mangal-demo/products/blue-lagoon.webp', 'Лимон, содовая, сироп блю кюрасао', '450 мл', 0, 'со льдом', false, false, false, false, 11, 'lemonades', 'Лимонады', '{}', 13),
  ('tarhun', 'Лимонад тархун', 150, 'Домашний лимонад с ароматом тархуна.', '/assets/mangal-demo/products/tarhun.webp', 'Тархун, лимон, мята, содовая', '350 мл', 0, 'со льдом', false, false, false, false, 8, 'lemonades', 'Лимонады', '{}', 14),
  ('signature-sauce', 'Соус фирменный', 80, 'Пикантный соус по авторскому рецепту.', '/assets/mangal-demo/products/signature-sauce.webp', 'Томаты, специи, чеснок', '60 г', 2, 'в соуснике', false, false, false, false, 30, 'grill', null, '{}', 15),
  ('lipton-lemon', 'Lipton Лимон', 150, 'Холодный чай с освежающим лимонным вкусом.', '/assets/mangal-demo/products/lipton-lemon.webp', 'Чайный напиток, лимон', '500 мл', 0, 'охлажденный', false, true, false, false, 20, 'fridge', 'Холодильник', '{}', 16),
  ('lipton-peach', 'Lipton Персик', 150, 'Холодный чай с мягким персиковым вкусом.', '/assets/mangal-demo/products/lipton-peach.webp', 'Чайный напиток, персик', '500 мл', 0, 'охлажденный', false, true, false, false, 20, 'fridge', 'Холодильник', '{}', 17),
  ('orange-juice', 'Сок апельсиновый', 180, 'Натуральный апельсиновый сок.', '/assets/mangal-demo/products/orange-juice.webp', 'Апельсиновый сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 'fridge', 'Соки', '{}', 18),
  ('apple-juice', 'Сок яблочный', 180, 'Натуральный яблочный сок.', '/assets/mangal-demo/products/apple-juice.webp', 'Яблочный сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 'fridge', 'Соки', '{}', 19),
  ('cherry-juice', 'Сок вишнёвый', 180, 'Натуральный вишнёвый сок.', '/assets/mangal-demo/products/cherry-juice.webp', 'Вишнёвый сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 'fridge', 'Соки', '{}', 20),
  ('still-water', 'Вода без газа', 100, 'Питьевая негазированная вода.', '/assets/mangal-demo/products/still-water.webp', 'Питьевая вода', '500 мл', 0, 'охлажденная', false, false, false, false, 24, 'fridge', 'Вода', '{}', 21),
  ('mineral-water', 'Вода газированная', 100, 'Питьевая газированная вода.', '/assets/mangal-demo/products/mineral-water.webp', 'Питьевая вода', '500 мл', 0, 'охлажденная', false, false, false, false, 24, 'fridge', 'Вода', '{}', 22)
on conflict (id) do update set
  title = excluded.title,
  price = excluded.price,
  description = excluded.description,
  image_url = excluded.image_url,
  ingredients = excluded.ingredients,
  weight = excluded.weight,
  spicy_level = excluded.spicy_level,
  serving = excluded.serving,
  is_popular = excluded.is_popular,
  is_new = excluded.is_new,
  is_hit = excluded.is_hit,
  is_hidden = excluded.is_hidden,
  stock_count = excluded.stock_count,
  category_id = excluded.category_id,
  category_ids = case when excluded.category_ids = '{}' then array[excluded.category_id] else excluded.category_ids end,
  drink_type = excluded.drink_type,
  pair_ids = excluded.pair_ids,
  sort_order = excluded.sort_order;

update public.product
set daily_stock = stock_count,
    current_stock = stock_count
where daily_stock = 0 and current_stock = 0 and stock_count > 0;

insert into public.product_tag (product_id, tag_id)
select id, 'popular' from public.product where is_popular
on conflict do nothing;
insert into public.product_tag (product_id, tag_id)
select id, 'hit' from public.product where is_hit
on conflict do nothing;
insert into public.product_tag (product_id, tag_id)
select id, 'new' from public.product where is_new
on conflict do nothing;

insert into public.cabin (id, title, capacity, feature, image_url, sort_order)
values
  ('cabin-1', 'Кабинка №1', 'до 4 гостей', 'Закрывается шторами', '/assets/mangal-demo/cabins/cabin-1.webp', 0),
  ('cabin-2', 'Кабинка №2', 'до 4 гостей', 'Отдельная дверь', '/assets/mangal-demo/cabins/cabin-2.webp', 1),
  ('big-cabin', 'Большая кабинка', 'до 10 гостей', 'Отдельная дверь', '/assets/mangal-demo/cabins/big-cabin.webp', 2),
  ('main-hall', 'Общий зал', 'до 20 гостей', 'Открытое пространство', '/assets/mangal-demo/cabins/main-hall.webp', 3)
on conflict (id) do update set
  title = excluded.title,
  capacity = excluded.capacity,
  feature = excluded.feature,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order;

insert into public.theme_settings (
  id, restaurant_id, background_type, background_color, background_image_url, card_color,
  product_card_color, product_card_text_color, settings_card_color, settings_card_text_color,
  cart_panel_color, cart_panel_text_color,
  card_radius, card_shadow, text_primary, text_secondary, product_title_color,
  category_title_color, accent_color, accent_secondary, button_style, button_radius, header_style
)
values (
  'theme-mangal',
  'mangal',
  'color',
  '#070809',
  '',
  '#121416',
  '#121416',
  '#f8f5ef',
  '#121416',
  '#f8f5ef',
  '#111111',
  '#f8f5ef',
  18,
  '0 18px 46px rgba(0, 0, 0, 0.28)',
  '#f8f5ef',
  '#aaa39a',
  '#f8f5ef',
  '#f8f5ef',
  '#e8a23a',
  '#ffd082',
  'filled',
  14,
  'centered'
)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  background_type = excluded.background_type,
  background_color = excluded.background_color,
  background_image_url = excluded.background_image_url,
  card_color = excluded.card_color,
  product_card_color = excluded.product_card_color,
  product_card_text_color = excluded.product_card_text_color,
  settings_card_color = excluded.settings_card_color,
  settings_card_text_color = excluded.settings_card_text_color,
  cart_panel_color = excluded.cart_panel_color,
  cart_panel_text_color = excluded.cart_panel_text_color,
  card_radius = excluded.card_radius,
  card_shadow = excluded.card_shadow,
  text_primary = excluded.text_primary,
  text_secondary = excluded.text_secondary,
  product_title_color = excluded.product_title_color,
  category_title_color = excluded.category_title_color,
  accent_color = excluded.accent_color,
  accent_secondary = excluded.accent_secondary,
  button_style = excluded.button_style,
  button_radius = excluded.button_radius,
  header_style = excluded.header_style;
