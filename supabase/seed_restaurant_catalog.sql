-- Seed or repair an existing restaurant catalog with starter Mangal-style content.
-- Change v_catalog_slug if you need to repair another client catalog.
-- Safe to run multiple times.

do $$
declare
  v_catalog_slug text := 'barakat';
  v_catalog_id uuid;
begin
  select id into v_catalog_id
  from public.catalogs
  where slug = v_catalog_slug;

  if v_catalog_id is null then
    raise exception 'Catalog with slug % was not found.', v_catalog_slug;
  end if;

  create temp table if not exists tmp_seed_categories (
    slug text primary key,
    name text not null,
    image_url text not null,
    icon text not null,
    sort_order integer not null
  ) on commit drop;

  create temp table if not exists tmp_seed_products (
    slug text primary key,
    title text not null,
    price integer not null,
    description text not null,
    image_url text not null,
    ingredients text not null,
    weight text not null,
    serving text not null,
    stock_count integer not null,
    category_slug text not null,
    is_popular boolean not null,
    is_new boolean not null,
    is_promo boolean not null,
    sort_order integer not null
  ) on commit drop;

  truncate tmp_seed_categories;
  truncate tmp_seed_products;

  insert into tmp_seed_categories (slug, name, image_url, icon, sort_order)
  values
    ('chechen', 'Чеченские блюда', '/assets/mangal-demo/products/zhizhig-galnash.webp', 'pot', 10),
    ('pizza', 'Пиццы', '/assets/mangal-demo/products/four-seasons.webp', 'pizza', 20),
    ('fastfood', 'Фастфуд', '/assets/mangal-demo/products/shawarma-combo.webp', 'burger', 30),
    ('grill', 'Мясо', '/assets/mangal-demo/products/lamb-skewer.webp', 'flame', 40),
    ('fridge', 'Напитки из холодильника', '/assets/mangal-demo/products/pepsi.webp', 'bottle', 50),
    ('lemonades', 'Лимонады в графине', '/assets/mangal-demo/products/strawberry-lemonade.webp', 'glass', 60),
    ('tea', 'Чай', '/assets/mangal-demo/products/chechen-tea.webp', 'tea', 70),
    ('cabins', 'Кабинки', '/assets/mangal-demo/cabins/cabin-1.webp', 'home', 80);

  insert into public.categories (catalog_id, slug, name, image_url, icon, sort_order)
  select v_catalog_id, slug, name, image_url, icon, sort_order
  from tmp_seed_categories
  on conflict (catalog_id, slug) do update set
    name = excluded.name,
    image_url = excluded.image_url,
    icon = excluded.icon,
    sort_order = excluded.sort_order;

  insert into tmp_seed_products (
    slug, title, price, description, image_url, ingredients, weight, serving, stock_count,
    category_slug, is_popular, is_new, is_promo, sort_order
  )
  values
    ('lamb-skewer', 'Шашлык из баранины', 690, 'Сочный шашлык из баранины с пряными специями и луком.', '/assets/mangal-demo/products/lamb-skewer.webp', 'Баранина, специи, лук, соль, перец', '250 г', 'с луком и соусом', 12, 'grill', true, false, true, 10),
    ('zhizhig-galnash', 'Жижиг-галнаш', 380, 'Традиционный чеченский суп с галушками из теста.', '/assets/mangal-demo/products/zhizhig-galnash.webp', 'Говядина, галушки, бульон, зелень', '420 г', 'с чесночным соусом', 8, 'chechen', true, false, false, 20),
    ('four-seasons', 'Четыре сезона', 550, 'Пицца с ветчиной, грибами, оливками и артишоками.', '/assets/mangal-demo/products/four-seasons.webp', 'Тесто, сыр, томаты, ветчина, грибы, оливки', '520 г', 'с томатным соусом', 9, 'pizza', true, false, false, 30),
    ('shawarma-combo', 'Комбо шаурма', 400, 'Шаурма с сочным мясом, овощами и картофелем.', '/assets/mangal-demo/products/shawarma-combo.webp', 'Курица, лаваш, овощи, картофель, соус', '360 г', 'с картофелем', 16, 'fastfood', true, true, false, 40),
    ('bone-steak', 'Стейк на косточке', 1390, 'Сочный стейк из говядины на кости.', '/assets/mangal-demo/products/bone-steak.webp', 'Говядина, соль, перец, розмарин', '430 г', 'с перечным соусом', 5, 'grill', false, false, true, 50),
    ('coca-cola', 'Coca-Cola', 120, 'Классический освежающий вкус.', '/assets/mangal-demo/products/coca-cola.webp', 'Газированный напиток', '330 мл', 'охлажденная', 20, 'fridge', false, false, false, 60),
    ('chechen-tea', 'Чеченский чай', 200, 'Душистый зеленый чай с чабрецом и горными травами.', '/assets/mangal-demo/products/chechen-tea.webp', 'Зеленый чай, чабрец, травы', '450 мл', 'в чайнике', 30, 'tea', true, false, false, 70),
    ('strawberry-lemonade', 'Клубничный лимонад', 220, 'Освежающий лимонад с клубникой и мятой.', '/assets/mangal-demo/products/strawberry-lemonade.webp', 'Клубника, лимон, мята, содовая', '450 мл', 'со льдом', 10, 'lemonades', true, true, false, 80),
    ('lipton-lemon', 'Lipton Лимон', 150, 'Холодный чай с освежающим лимонным вкусом.', '/assets/mangal-demo/products/lipton-lemon.webp', 'Чайный напиток, лимон', '500 мл', 'охлажденный', 20, 'fridge', false, true, false, 90),
    ('lipton-peach', 'Lipton Персик', 150, 'Холодный чай с мягким персиковым вкусом.', '/assets/mangal-demo/products/lipton-peach.webp', 'Чайный напиток, персик', '500 мл', 'охлажденный', 20, 'fridge', false, true, false, 100),
    ('orange-juice', 'Сок апельсиновый', 180, 'Натуральный апельсиновый сок.', '/assets/mangal-demo/products/orange-juice.webp', 'Апельсиновый сок', '250 мл', 'охлажденный', 15, 'fridge', false, true, false, 110),
    ('apple-juice', 'Сок яблочный', 180, 'Натуральный яблочный сок.', '/assets/mangal-demo/products/apple-juice.webp', 'Яблочный сок', '250 мл', 'охлажденный', 15, 'fridge', false, true, false, 120),
    ('cherry-juice', 'Сок вишнёвый', 180, 'Натуральный вишнёвый сок.', '/assets/mangal-demo/products/cherry-juice.webp', 'Вишнёвый сок', '250 мл', 'охлажденный', 15, 'fridge', false, true, false, 130),
    ('still-water', 'Вода без газа', 100, 'Питьевая негазированная вода.', '/assets/mangal-demo/products/still-water.webp', 'Питьевая вода', '500 мл', 'охлажденная', 24, 'fridge', false, false, false, 140),
    ('mineral-water', 'Вода газированная', 100, 'Питьевая газированная вода.', '/assets/mangal-demo/products/mineral-water.webp', 'Питьевая вода', '500 мл', 'охлажденная', 24, 'fridge', false, false, false, 150);

  insert into public.products (
    catalog_id, category_id, slug, title, status, price, description, ingredients, weight, serving,
    stock_count, is_popular, is_new, is_promo, sort_order
  )
  select
    v_catalog_id,
    category.id,
    product_seed.slug,
    product_seed.title,
    'active',
    product_seed.price,
    product_seed.description,
    product_seed.ingredients,
    product_seed.weight,
    product_seed.serving,
    product_seed.stock_count,
    product_seed.is_popular,
    product_seed.is_new,
    product_seed.is_promo,
    product_seed.sort_order
  from tmp_seed_products product_seed
  join public.categories category
    on category.catalog_id = v_catalog_id
   and category.slug = product_seed.category_slug
  on conflict (catalog_id, slug) do update set
    category_id = excluded.category_id,
    title = excluded.title,
    status = excluded.status,
    price = excluded.price,
    description = excluded.description,
    ingredients = excluded.ingredients,
    weight = excluded.weight,
    serving = excluded.serving,
    stock_count = excluded.stock_count,
    is_popular = excluded.is_popular,
    is_new = excluded.is_new,
    is_promo = excluded.is_promo,
    sort_order = excluded.sort_order;

  delete from public.product_images image
  using public.products product
  where image.product_id = product.id
    and product.catalog_id = v_catalog_id
    and product.slug in (select slug from tmp_seed_products);

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select v_catalog_id, product.id, product_seed.image_url, product_seed.title, 0
  from tmp_seed_products product_seed
  join public.products product
    on product.catalog_id = v_catalog_id
   and product.slug = product_seed.slug;

  delete from public.bookable_resources
  where catalog_id = v_catalog_id
    and title in ('Кабинка №1', 'Кабинка №2', 'Большая кабинка');

  insert into public.bookable_resources (catalog_id, title, capacity, image_url, sort_order)
  values
    (v_catalog_id, 'Кабинка №1', 4, '/assets/mangal-demo/cabins/cabin-1.webp', 10),
    (v_catalog_id, 'Кабинка №2', 4, '/assets/mangal-demo/cabins/cabin-2.webp', 20),
    (v_catalog_id, 'Большая кабинка', 10, '/assets/mangal-demo/cabins/big-cabin.webp', 30);
end $$;
