do $$
declare
  v_catalog_id uuid;
begin
  select id into v_catalog_id
  from public.catalogs
  where slug = 'mangal';

  if v_catalog_id is null then
    raise exception 'Catalog mangal was not found';
  end if;

  update public.catalogs
  set banner_url = '/assets/mangal-demo/cover.webp',
      updated_at = now()
  where id = v_catalog_id;

  update public.restaurant
  set banner_url = '/assets/mangal-demo/cover.webp',
      updated_at = now()
  where id = 'mangal';

  update public.categories
  set image_url = case name
      when 'Чеченские блюда' then '/assets/mangal-demo/products/zhizhig-galnash.webp'
      when 'Пиццы' then '/assets/mangal-demo/products/four-seasons.webp'
      when 'Фастфуд' then '/assets/mangal-demo/products/shawarma-combo.webp'
      when 'Мясо' then '/assets/mangal-demo/products/lamb-skewer.webp'
      when 'Напитки' then '/assets/mangal-demo/products/pepsi.webp'
      when 'Напитки из холодильника' then '/assets/mangal-demo/products/pepsi.webp'
      when 'Лимонады в графине' then '/assets/mangal-demo/products/strawberry-lemonade.webp'
      when 'Чай' then '/assets/mangal-demo/products/chechen-tea.webp'
      when 'Кабинки' then '/assets/mangal-demo/cabins/cabin-1.webp'
      when 'Соусы' then '/assets/mangal-demo/products/signature-sauce.webp'
      when 'Тест' then '/assets/mangal-demo/cover.webp'
      when 'Кофе' then '/assets/template-coffee-shop/classic-coffee.webp'
      else image_url
    end
  where catalog_id = v_catalog_id;

  update public.category
  set image = case id
      when 'chechen' then '/assets/mangal-demo/products/zhizhig-galnash.webp'
      when 'pizza' then '/assets/mangal-demo/products/four-seasons.webp'
      when 'fastfood' then '/assets/mangal-demo/products/shawarma-combo.webp'
      when 'grill' then '/assets/mangal-demo/products/lamb-skewer.webp'
      when 'fridge' then '/assets/mangal-demo/products/pepsi.webp'
      when 'lemonades' then '/assets/mangal-demo/products/strawberry-lemonade.webp'
      when 'tea' then '/assets/mangal-demo/products/chechen-tea.webp'
      when 'cabins' then '/assets/mangal-demo/cabins/cabin-1.webp'
      when 'category-mqx1fnm0-oodto' then '/assets/mangal-demo/products/signature-sauce.webp'
      when 'category-mqy52109-wwud3' then '/assets/mangal-demo/cover.webp'
      when 'category-ms28utxi-saono' then '/assets/template-coffee-shop/classic-coffee.webp'
      else image
    end,
    updated_at = now();

  with media(id, url) as (
    values
      ('lamb-skewer', '/assets/mangal-demo/products/lamb-skewer.webp'),
      ('zhizhig-galnash', '/assets/mangal-demo/products/zhizhig-galnash.webp'),
      ('four-seasons', '/assets/mangal-demo/products/four-seasons.webp'),
      ('shawarma-combo', '/assets/mangal-demo/products/shawarma-combo.webp'),
      ('bone-steak', '/assets/mangal-demo/products/bone-steak.webp'),
      ('grilled-vegetables', '/assets/mangal-demo/products/grilled-vegetables.webp'),
      ('coca-cola', '/assets/mangal-demo/products/coca-cola.webp'),
      ('pepsi', '/assets/mangal-demo/products/pepsi.webp'),
      ('fanta', '/assets/mangal-demo/products/fanta.webp'),
      ('sprite', '/assets/mangal-demo/products/sprite.webp'),
      ('ayran', '/assets/mangal-demo/products/ayran.webp'),
      ('chechen-tea', '/assets/mangal-demo/products/chechen-tea.webp'),
      ('strawberry-lemonade', '/assets/mangal-demo/products/strawberry-lemonade.webp'),
      ('blue-lagoon', '/assets/mangal-demo/products/blue-lagoon.webp'),
      ('tarhun', '/assets/mangal-demo/products/tarhun.webp'),
      ('signature-sauce', '/assets/mangal-demo/products/signature-sauce.webp')
  )
  update public.product product
  set image_url = media.url,
      image_urls = array[media.url],
      updated_at = now()
  from media
  where product.id = media.id;

  insert into public.product (
    id, title, price, description, image_url, ingredients, weight, spicy_level, serving,
    is_popular, is_new, is_hit, is_hidden, daily_stock, current_stock, is_unlimited,
    stock_count, category_id, category_ids, drink_type, pair_ids, sort_order, image_urls
  )
  values
    ('lipton-lemon', 'Lipton Лимон', 150, 'Холодный чай с освежающим лимонным вкусом.', '/assets/mangal-demo/products/lipton-lemon.webp', 'Чайный напиток, лимон', '500 мл', 0, 'охлажденный', false, true, false, false, 20, 20, false, 20, 'fridge', array['fridge'], 'Холодильник', '{}', 16, array['/assets/mangal-demo/products/lipton-lemon.webp']),
    ('lipton-peach', 'Lipton Персик', 150, 'Холодный чай с мягким персиковым вкусом.', '/assets/mangal-demo/products/lipton-peach.webp', 'Чайный напиток, персик', '500 мл', 0, 'охлажденный', false, true, false, false, 20, 20, false, 20, 'fridge', array['fridge'], 'Холодильник', '{}', 17, array['/assets/mangal-demo/products/lipton-peach.webp']),
    ('orange-juice', 'Сок апельсиновый', 180, 'Натуральный апельсиновый сок.', '/assets/mangal-demo/products/orange-juice.webp', 'Апельсиновый сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 15, false, 15, 'fridge', array['fridge'], 'Соки', '{}', 18, array['/assets/mangal-demo/products/orange-juice.webp']),
    ('apple-juice', 'Сок яблочный', 180, 'Натуральный яблочный сок.', '/assets/mangal-demo/products/apple-juice.webp', 'Яблочный сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 15, false, 15, 'fridge', array['fridge'], 'Соки', '{}', 19, array['/assets/mangal-demo/products/apple-juice.webp']),
    ('cherry-juice', 'Сок вишнёвый', 180, 'Натуральный вишнёвый сок.', '/assets/mangal-demo/products/cherry-juice.webp', 'Вишнёвый сок', '250 мл', 0, 'охлажденный', false, true, false, false, 15, 15, false, 15, 'fridge', array['fridge'], 'Соки', '{}', 20, array['/assets/mangal-demo/products/cherry-juice.webp']),
    ('still-water', 'Вода без газа', 100, 'Питьевая негазированная вода.', '/assets/mangal-demo/products/still-water.webp', 'Питьевая вода', '500 мл', 0, 'охлажденная', false, false, false, false, 24, 24, false, 24, 'fridge', array['fridge'], 'Вода', '{}', 21, array['/assets/mangal-demo/products/still-water.webp']),
    ('mineral-water', 'Вода газированная', 100, 'Питьевая газированная вода.', '/assets/mangal-demo/products/mineral-water.webp', 'Питьевая вода', '500 мл', 0, 'охлажденная', false, false, false, false, 24, 24, false, 24, 'fridge', array['fridge'], 'Вода', '{}', 22, array['/assets/mangal-demo/products/mineral-water.webp'])
  on conflict (id) do update set
    image_url = excluded.image_url,
    image_urls = excluded.image_urls,
    updated_at = now();

  update public.cabin
  set image_url = case id
      when 'cabin-1' then '/assets/mangal-demo/cabins/cabin-1.webp'
      when 'cabin-2' then '/assets/mangal-demo/cabins/cabin-2.webp'
      when 'big-cabin' then '/assets/mangal-demo/cabins/big-cabin.webp'
      when 'main-hall' then '/assets/mangal-demo/cabins/main-hall.webp'
      else image_url
    end,
    updated_at = now();

  update public.bookable_resources
  set image_url = case title
      when 'Кабинка №1' then '/assets/mangal-demo/cabins/cabin-1.webp'
      when 'Кабинка №2' then '/assets/mangal-demo/cabins/cabin-2.webp'
      when 'Большая кабинка' then '/assets/mangal-demo/cabins/big-cabin.webp'
      when 'Общий зал' then '/assets/mangal-demo/cabins/main-hall.webp'
      else image_url
    end
  where catalog_id = v_catalog_id;

  with product_seed (
    slug, category_name, title, price, description, ingredients, weight, serving,
    stock_count, is_popular, is_new, is_promo, sort_order
  ) as (
    values
      ('lamb-skewer', 'Мясо', 'Шашлык из баранины', 690, 'Сочный шашлык из баранины с пряными специями и луком.', 'Баранина, специи, лук, соль, перец', '250 г', 'с луком и соусом', 12, true, false, false, 0),
      ('zhizhig-galnash', 'Чеченские блюда', 'Жижиг-галнаш', 380, 'Традиционное чеченское блюдо с галушками из теста.', 'Говядина, галушки, бульон, зелень', '420 г', 'с чесночным соусом', 8, true, false, false, 1),
      ('four-seasons', 'Пиццы', 'Четыре сезона', 550, 'Пицца с ветчиной, грибами, оливками и артишоками.', 'Тесто, сыр, томаты, ветчина, грибы, оливки', '520 г', 'с томатным соусом', 9, true, false, false, 2),
      ('shawarma-combo', 'Фастфуд', 'Комбо шаурма', 400, 'Шаурма с сочным мясом, овощами и картофелем.', 'Курица, лаваш, овощи, картофель, соус', '360 г', 'с картофелем', 16, true, true, false, 3),
      ('bone-steak', 'Мясо', 'Стейк на косточке', 1390, 'Сочный стейк из говядины на кости.', 'Говядина, соль, перец, розмарин', '430 г', 'с перечным соусом', 5, false, false, false, 4),
      ('grilled-vegetables', 'Мясо', 'Овощи на мангале', 320, 'Сезонные овощи, приготовленные на углях.', 'Перец, баклажан, кабачок, томаты', '280 г', 'с зеленью', 0, true, false, false, 5),
      ('coca-cola', 'Напитки', 'Coca-Cola', 120, 'Классический освежающий вкус.', 'Газированный напиток', '330 мл', 'охлажденная', 20, false, false, false, 6),
      ('pepsi', 'Напитки', 'Pepsi', 120, 'Освежающий вкус с легкой сладостью.', 'Газированный напиток', '330 мл', 'охлажденная', 20, false, false, false, 7),
      ('fanta', 'Напитки', 'Fanta', 120, 'Апельсиновый вкус и яркое настроение.', 'Газированный напиток', '330 мл', 'охлажденная', 15, false, false, false, 8),
      ('sprite', 'Напитки', 'Sprite', 120, 'Лимонно-лаймовый вкус и свежесть.', 'Газированный напиток', '330 мл', 'охлажденная', 18, false, false, false, 9),
      ('ayran', 'Напитки', 'Айран', 150, 'Освежающий кисломолочный напиток.', 'Кисломолочный напиток, соль, мята', '250 мл', 'охлажденный', 14, true, false, false, 10),
      ('chechen-tea', 'Чай', 'Чеченский чай', 200, 'Душистый зеленый чай с чабрецом и горными травами.', 'Зеленый чай, чабрец, травы', '450 мл', 'в чайнике', 30, true, false, false, 11),
      ('strawberry-lemonade', 'Лимонады в графине', 'Клубничный лимонад', 220, 'Освежающий лимонад с клубникой и мятой.', 'Клубника, лимон, мята, содовая', '450 мл', 'со льдом', 10, true, true, false, 12),
      ('blue-lagoon', 'Лимонады в графине', 'Синяя лагуна', 250, 'Яркий цитрусовый лимонад.', 'Лимон, содовая, сироп блю кюрасао', '450 мл', 'со льдом', 11, false, false, false, 13),
      ('tarhun', 'Лимонады в графине', 'Лимонад тархун', 150, 'Домашний лимонад с ароматом тархуна.', 'Тархун, лимон, мята, содовая', '350 мл', 'со льдом', 8, false, false, false, 14),
      ('signature-sauce', 'Соусы', 'Соус фирменный', 80, 'Пикантный соус по авторскому рецепту.', 'Томаты, специи, чеснок', '60 г', 'в соуснике', 30, false, false, false, 15),
      ('lipton-lemon', 'Напитки', 'Lipton Лимон', 150, 'Холодный чай с освежающим лимонным вкусом.', 'Чайный напиток, лимон', '500 мл', 'охлажденный', 20, false, true, false, 16),
      ('lipton-peach', 'Напитки', 'Lipton Персик', 150, 'Холодный чай с мягким персиковым вкусом.', 'Чайный напиток, персик', '500 мл', 'охлажденный', 20, false, true, false, 17),
      ('orange-juice', 'Напитки', 'Сок апельсиновый', 180, 'Натуральный апельсиновый сок.', 'Апельсиновый сок', '250 мл', 'охлажденный', 15, false, true, false, 18),
      ('apple-juice', 'Напитки', 'Сок яблочный', 180, 'Натуральный яблочный сок.', 'Яблочный сок', '250 мл', 'охлажденный', 15, false, true, false, 19),
      ('cherry-juice', 'Напитки', 'Сок вишнёвый', 180, 'Натуральный вишнёвый сок.', 'Вишнёвый сок', '250 мл', 'охлажденный', 15, false, true, false, 20),
      ('still-water', 'Напитки', 'Вода без газа', 100, 'Питьевая негазированная вода.', 'Питьевая вода', '500 мл', 'охлажденная', 24, false, false, false, 21),
      ('mineral-water', 'Напитки', 'Вода газированная', 100, 'Питьевая газированная вода.', 'Питьевая вода', '500 мл', 'охлажденная', 24, false, false, false, 22)
  )
  insert into public.products (
    catalog_id, category_id, slug, title, status, price, description, ingredients,
    weight, serving, stock_count, is_popular, is_new, is_promo, sort_order
  )
  select
    v_catalog_id, category.id, seed.slug, seed.title, 'active', seed.price,
    seed.description, seed.ingredients, seed.weight, seed.serving, seed.stock_count,
    seed.is_popular, seed.is_new, seed.is_promo, seed.sort_order
  from product_seed seed
  join public.categories category
    on category.catalog_id = v_catalog_id
   and category.name = seed.category_name
  on conflict (catalog_id, slug) do update set
    category_id = excluded.category_id,
    updated_at = now();

  with media(slug, url) as (
    values
      ('lamb-skewer', '/assets/mangal-demo/products/lamb-skewer.webp'),
      ('zhizhig-galnash', '/assets/mangal-demo/products/zhizhig-galnash.webp'),
      ('four-seasons', '/assets/mangal-demo/products/four-seasons.webp'),
      ('shawarma-combo', '/assets/mangal-demo/products/shawarma-combo.webp'),
      ('bone-steak', '/assets/mangal-demo/products/bone-steak.webp'),
      ('grilled-vegetables', '/assets/mangal-demo/products/grilled-vegetables.webp'),
      ('coca-cola', '/assets/mangal-demo/products/coca-cola.webp'),
      ('pepsi', '/assets/mangal-demo/products/pepsi.webp'),
      ('fanta', '/assets/mangal-demo/products/fanta.webp'),
      ('sprite', '/assets/mangal-demo/products/sprite.webp'),
      ('ayran', '/assets/mangal-demo/products/ayran.webp'),
      ('chechen-tea', '/assets/mangal-demo/products/chechen-tea.webp'),
      ('strawberry-lemonade', '/assets/mangal-demo/products/strawberry-lemonade.webp'),
      ('blue-lagoon', '/assets/mangal-demo/products/blue-lagoon.webp'),
      ('tarhun', '/assets/mangal-demo/products/tarhun.webp'),
      ('signature-sauce', '/assets/mangal-demo/products/signature-sauce.webp'),
      ('lipton-lemon', '/assets/mangal-demo/products/lipton-lemon.webp'),
      ('lipton-peach', '/assets/mangal-demo/products/lipton-peach.webp'),
      ('orange-juice', '/assets/mangal-demo/products/orange-juice.webp'),
      ('apple-juice', '/assets/mangal-demo/products/apple-juice.webp'),
      ('cherry-juice', '/assets/mangal-demo/products/cherry-juice.webp'),
      ('still-water', '/assets/mangal-demo/products/still-water.webp'),
      ('mineral-water', '/assets/mangal-demo/products/mineral-water.webp')
  )
  update public.product_images image
  set url = media.url,
      alt = product.title
  from public.products product, media
  where image.catalog_id = v_catalog_id
    and image.product_id = product.id
    and product.catalog_id = v_catalog_id
    and product.slug = media.slug;

  with media(slug, url) as (
    values
      ('lamb-skewer', '/assets/mangal-demo/products/lamb-skewer.webp'),
      ('zhizhig-galnash', '/assets/mangal-demo/products/zhizhig-galnash.webp'),
      ('four-seasons', '/assets/mangal-demo/products/four-seasons.webp'),
      ('shawarma-combo', '/assets/mangal-demo/products/shawarma-combo.webp'),
      ('bone-steak', '/assets/mangal-demo/products/bone-steak.webp'),
      ('grilled-vegetables', '/assets/mangal-demo/products/grilled-vegetables.webp'),
      ('coca-cola', '/assets/mangal-demo/products/coca-cola.webp'),
      ('pepsi', '/assets/mangal-demo/products/pepsi.webp'),
      ('fanta', '/assets/mangal-demo/products/fanta.webp'),
      ('sprite', '/assets/mangal-demo/products/sprite.webp'),
      ('ayran', '/assets/mangal-demo/products/ayran.webp'),
      ('chechen-tea', '/assets/mangal-demo/products/chechen-tea.webp'),
      ('strawberry-lemonade', '/assets/mangal-demo/products/strawberry-lemonade.webp'),
      ('blue-lagoon', '/assets/mangal-demo/products/blue-lagoon.webp'),
      ('tarhun', '/assets/mangal-demo/products/tarhun.webp'),
      ('signature-sauce', '/assets/mangal-demo/products/signature-sauce.webp'),
      ('lipton-lemon', '/assets/mangal-demo/products/lipton-lemon.webp'),
      ('lipton-peach', '/assets/mangal-demo/products/lipton-peach.webp'),
      ('orange-juice', '/assets/mangal-demo/products/orange-juice.webp'),
      ('apple-juice', '/assets/mangal-demo/products/apple-juice.webp'),
      ('cherry-juice', '/assets/mangal-demo/products/cherry-juice.webp'),
      ('still-water', '/assets/mangal-demo/products/still-water.webp'),
      ('mineral-water', '/assets/mangal-demo/products/mineral-water.webp')
  )
  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select v_catalog_id, product.id, media.url, product.title, 0
  from public.products product
  join media on media.slug = product.slug
  where product.catalog_id = v_catalog_id
    and not exists (
      select 1
      from public.product_images image
      where image.catalog_id = v_catalog_id
        and image.product_id = product.id
    );
end $$;
