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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  stock_count integer not null default 0 check (stock_count >= 0),
  category_id text not null references public.category(id) on update cascade on delete restrict,
  drink_type text,
  pair_ids text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  background_color text not null default '#f7f3ec',
  background_image_url text not null default '',
  card_color text not null default '#ffffff',
  product_card_color text not null default '#ffffff',
  product_card_text_color text not null default '#181510',
  settings_card_color text not null default '#ffffff',
  settings_card_text_color text not null default '#181510',
  cart_panel_color text not null default '#111111',
  cart_panel_text_color text not null default '#f8f5ef',
  card_radius integer not null default 18,
  card_shadow text not null default '0 18px 46px rgba(45, 35, 20, 0.12)',
  text_primary text not null default '#181510',
  text_secondary text not null default '#766d62',
  product_title_color text not null default '#111827',
  category_title_color text not null default '#f8f5ef',
  accent_color text not null default '#e8a23a',
  accent_secondary text not null default '#ffd082',
  button_style text not null default 'filled' check (button_style in ('filled', 'outline')),
  button_radius integer not null default 14,
  header_style text not null default 'centered' check (header_style in ('centered', 'compact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.theme_settings add column if not exists product_card_color text not null default '#ffffff';
alter table public.theme_settings add column if not exists product_card_text_color text not null default '#181510';
alter table public.theme_settings add column if not exists settings_card_color text not null default '#ffffff';
alter table public.theme_settings add column if not exists settings_card_text_color text not null default '#181510';
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

insert into public.restaurant (id, name, subtitle, logo_url, banner_url, whatsapp, instagram_url, address)
values (
  'mangal',
  'Мангал',
  'ресторан',
  '',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=78&restaurant',
  '79990000000',
  'https://instagram.com/',
  'ул. Центральная, 12'
)
on conflict (id) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  logo_url = excluded.logo_url,
  banner_url = excluded.banner_url,
  whatsapp = excluded.whatsapp,
  instagram_url = excluded.instagram_url,
  address = excluded.address;

insert into public.category (id, name, image, icon, kind, sort_order)
values
  ('chechen', 'Чеченские блюда', 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=78&soup', 'pot', 'food', 0),
  ('pizza', 'Пиццы', 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=900&q=78&pizza', 'pizza', 'food', 1),
  ('fastfood', 'Фастфуд', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=78&burger', 'burger', 'food', 2),
  ('grill', 'Мясо', 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=900&q=78&kebab', 'flame', 'food', 3),
  ('fridge', 'Напитки из холодильника', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=78&soda', 'bottle', 'drink', 4),
  ('lemonades', 'Лимонады в графине', 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=78&lemonade', 'glass', 'drink', 5),
  ('tea', 'Чай', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=78&tea', 'tea', 'drink', 6),
  ('cabins', 'Кабинки', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=78&restaurant', 'home', 'space', 7)
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
  ('lamb-skewer', 'Шашлык из баранины', 690, 'Сочный шашлык из баранины с пряными специями и луком.', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=78&skewers', 'Баранина, специи, лук, соль, перец', '250 г', 2, 'с луком и соусом', true, false, true, false, 12, 'grill', null, array['chechen-tea', 'ayran', 'tarhun', 'signature-sauce'], 0),
  ('zhizhig-galnash', 'Жижиг-галнаш', 380, 'Традиционный чеченский суп с галушками из теста.', 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=78&soup', 'Говядина, галушки, бульон, зелень', '420 г', 1, 'с чесночным соусом', true, false, false, false, 8, 'chechen', null, array['chechen-tea', 'ayran'], 1),
  ('four-seasons', 'Четыре сезона', 550, 'Пицца с ветчиной, грибами, оливками и артишоками.', 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=900&q=78&pizza', 'Тесто, сыр, томаты, ветчина, грибы, оливки', '520 г', 0, 'с томатным соусом', true, false, false, false, 9, 'pizza', null, array['coca-cola', 'sprite'], 2),
  ('shawarma-combo', 'Комбо шаурма', 400, 'Шаурма с сочным мясом, овощами и картофелем.', 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=78&wrap', 'Курица, лаваш, овощи, картофель, соус', '360 г', 1, 'с картофелем', true, true, false, false, 16, 'fastfood', null, array['pepsi', 'fanta'], 3),
  ('bone-steak', 'Стейк на косточке', 1390, 'Сочный стейк из говядины на кости.', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=78&steak', 'Говядина, соль, перец, розмарин', '430 г', 1, 'с перечным соусом', false, false, true, false, 5, 'grill', null, array['blue-lagoon', 'signature-sauce'], 4),
  ('grilled-vegetables', 'Овощи на мангале', 320, 'Сезонные овощи, приготовленные на углях.', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=78&vegetables', 'Перец, баклажан, кабачок, томаты', '280 г', 0, 'с зеленью', true, false, false, false, 0, 'grill', null, array['ayran'], 5),
  ('coca-cola', 'Coca-Cola', 120, 'Классический освежающий вкус.', 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=900&q=78&cola', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 20, 'fridge', 'Холодильник', '{}', 6),
  ('pepsi', 'Pepsi', 120, 'Освежающий вкус с легкой сладостью.', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=78&pepsi', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 20, 'fridge', 'Холодильник', '{}', 7),
  ('fanta', 'Fanta', 120, 'Апельсиновый вкус и яркое настроение.', 'https://images.unsplash.com/photo-1601643157091-ce5c665179ab?auto=format&fit=crop&w=900&q=78&orange soda', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 15, 'fridge', 'Холодильник', '{}', 8),
  ('sprite', 'Sprite', 120, 'Лимонно-лаймовый вкус и свежесть.', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=78&sprite', 'Газированный напиток', '330 мл', 0, 'охлажденная', false, false, false, false, 18, 'fridge', 'Холодильник', '{}', 9),
  ('ayran', 'Айран', 150, 'Освежающий кисломолочный напиток.', 'https://images.unsplash.com/photo-1564758565388-0d5da0cbb064?auto=format&fit=crop&w=900&q=78&ayran', 'Кисломолочный напиток, соль, мята', '250 мл', 0, 'охлажденный', true, false, false, false, 14, 'fridge', 'Айран', '{}', 10),
  ('chechen-tea', 'Чеченский чай', 200, 'Душистый зеленый чай с чабрецом и горными травами.', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=78&tea', 'Зеленый чай, чабрец, травы', '450 мл', 0, 'в чайнике', true, false, false, false, 30, 'tea', 'Чай', '{}', 11),
  ('strawberry-lemonade', 'Клубничный лимонад', 220, 'Освежающий лимонад с клубникой и мятой.', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=78&strawberry lemonade', 'Клубника, лимон, мята, содовая', '450 мл', 0, 'со льдом', true, true, false, false, 10, 'lemonades', 'Лимонады', '{}', 12),
  ('blue-lagoon', 'Синяя лагуна', 250, 'Яркий цитрусовый лимонад с легкими морскими нотками.', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=78&blue cocktail', 'Лимон, содовая, сироп блю кюрасао', '450 мл', 0, 'со льдом', false, false, false, false, 11, 'lemonades', 'Лимонады', '{}', 13),
  ('tarhun', 'Лимонад тархун', 150, 'Домашний лимонад с ароматом тархуна.', 'https://images.unsplash.com/photo-1523371054106-bbf80586c38c?auto=format&fit=crop&w=900&q=78&green lemonade', 'Тархун, лимон, мята, содовая', '350 мл', 0, 'со льдом', false, false, false, false, 8, 'lemonades', 'Лимонады', '{}', 14),
  ('signature-sauce', 'Соус фирменный', 80, 'Пикантный соус по авторскому рецепту.', 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=900&q=78&sauce', 'Томаты, специи, чеснок', '60 г', 2, 'в соуснике', false, false, false, false, 30, 'grill', null, '{}', 15)
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
  drink_type = excluded.drink_type,
  pair_ids = excluded.pair_ids,
  sort_order = excluded.sort_order;

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
  ('cabin-1', 'Кабинка №1', 'до 4 гостей', 'Закрывается шторами', 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=78&private dining', 0),
  ('cabin-2', 'Кабинка №2', 'до 4 гостей', 'Отдельная дверь', 'https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=900&q=78&restaurant booth', 1),
  ('big-cabin', 'Большая кабинка', 'до 10 гостей', 'Отдельная дверь', 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=900&q=78&large restaurant table', 2),
  ('main-hall', 'Общий зал', 'до 20 гостей', 'Открытое пространство', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=78&restaurant hall', 3)
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
  '#f7f3ec',
  '',
  '#ffffff',
  '#ffffff',
  '#181510',
  '#ffffff',
  '#181510',
  '#111111',
  '#f8f5ef',
  18,
  '0 18px 46px rgba(45, 35, 20, 0.12)',
  '#181510',
  '#766d62',
  '#111827',
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
