-- Turn the empty restaurant template into a reusable fast-food starter catalog.
-- Generated photos are versioned with the application under public/assets/template-fast-food.

do $$
declare
  v_catalog_id uuid;
begin
  select id
    into v_catalog_id
    from public.catalogs
    where slug = 'restaurant'
      and is_template = true
    limit 1;

  if v_catalog_id is null then
    raise notice 'Restaurant template was not found; fast-food starter seed was skipped.';
    return;
  end if;

  update public.catalogs
  set name = 'Городской фастфуд',
      description = 'Бургеры, шаурма, закуски и напитки',
      banner_url = '/catalogg/assets/template-fast-food/hero.jpg',
      template_name = 'fast-food-starter',
      seo = jsonb_build_object(
        'title', 'Городской фастфуд — готовое меню',
        'description', 'Базовый шаблон меню с бургерами, шаурмой, закусками и напитками.'
      ),
      updated_at = now()
  where id = v_catalog_id;

  insert into public.categories (
    catalog_id, name, slug, description, image_url, icon, is_hidden, sort_order
  )
  values
    (v_catalog_id, 'Бургеры', 'burgers', '{"kind":"food","showOnHome":true,"showInOrderFlow":true}', '/catalogg/assets/template-fast-food/classic-cheeseburger.jpg', 'burger', false, 10),
    (v_catalog_id, 'Шаурма', 'shawarma', '{"kind":"food","showOnHome":true,"showInOrderFlow":true}', '/catalogg/assets/template-fast-food/chicken-shawarma.jpg', 'shawarma', false, 20),
    (v_catalog_id, 'Закуски', 'snacks', '{"kind":"food","showOnHome":true,"showInOrderFlow":true}', '/catalogg/assets/template-fast-food/french-fries.jpg', 'chicken', false, 30),
    (v_catalog_id, 'Напитки', 'drinks', '{"kind":"drink","showOnHome":true,"showInOrderFlow":true}', '/catalogg/assets/template-fast-food/berry-lemonade.jpg', 'soda', false, 40)
  on conflict (catalog_id, slug) do update set
    name = excluded.name,
    description = excluded.description,
    image_url = excluded.image_url,
    icon = excluded.icon,
    is_hidden = excluded.is_hidden,
    sort_order = excluded.sort_order,
    updated_at = now();

  insert into public.products (
    catalog_id, category_id, title, slug, status, price, description, ingredients,
    weight, serving, stock_count, is_unlimited, is_popular, is_new, is_promo, sort_order
  )
  select
    v_catalog_id,
    category.id,
    seed.title,
    seed.slug,
    'active'::public.product_status,
    seed.price,
    seed.description,
    seed.ingredients,
    seed.weight,
    seed.serving,
    0,
    true,
    seed.is_popular,
    seed.is_new,
    seed.is_promo,
    seed.sort_order
  from (
    values
      ('burgers', 'classic-cheeseburger', 'Классический чизбургер', 390, 'Сочная говяжья котлета, сыр чеддер и свежие овощи в мягкой булочке.', 'Булочка, говядина, сыр чеддер, салат, томат, маринованный огурец, фирменный соус', '310 г', 'Подаётся горячим. Выберите средний или большой размер.', true, false, false, 10),
      ('burgers', 'spicy-chicken-burger', 'Чикен-бургер', 420, 'Куриное филе на гриле, свежие овощи и соус на выбор — мягкий или острый.', 'Булочка, куриное филе, салат, томат, маринованный огурец, соус', '300 г', 'Можно заказать острым или неострым, в среднем или большом размере.', true, true, false, 20),
      ('shawarma', 'chicken-shawarma', 'Шаурма с курицей', 360, 'Курица с гриля, хрустящие овощи и чесночный соус в тонком лаваше.', 'Лаваш, курица, капуста, томат, огурец, чесночный соус', '360 г', 'Выберите размер и остроту при заказе.', true, false, false, 30),
      ('snacks', 'classic-hot-dog', 'Классический хот-дог', 260, 'Обжаренная сосиска в мягкой булочке с огурцом, горчицей и томатным соусом.', 'Булочка, говяжья сосиска, маринованный огурец, горчица, томатный соус', '220 г', 'Соус можно выбрать острый или неострый.', false, false, false, 40),
      ('snacks', 'french-fries', 'Картофель фри', 170, 'Золотистый картофель с хрустящей корочкой и щепоткой соли.', 'Картофель, растительное масло, соль', '150 г', 'Средняя или большая порция.', true, false, false, 50),
      ('snacks', 'chicken-nuggets', 'Куриные наггетсы', 240, 'Куриное филе в хрустящей панировке, обжаренное до золотистой корочки.', 'Куриное филе, панировка, растительное масло, специи', '180 г', 'Выберите 6, 9 или 12 штук. Соус подаётся отдельно.', false, true, false, 60),
      ('drinks', 'cola', 'Кола со льдом', 120, 'Классический охлаждённый газированный напиток со льдом.', 'Газированный напиток, лёд', '300 мл', 'Выберите объём 0,3 или 0,5 литра.', false, false, false, 70),
      ('drinks', 'berry-lemonade', 'Ягодный лимонад', 180, 'Домашний лимонад с ягодами, лимоном, мятой и льдом.', 'Ягодный морс, лимон, мята, содовая, лёд', '300 мл', 'Выберите объём 0,3 или 0,5 литра.', true, true, false, 80)
  ) as seed(category_slug, slug, title, price, description, ingredients, weight, serving, is_popular, is_new, is_promo, sort_order)
  join public.categories category
    on category.catalog_id = v_catalog_id
   and category.slug = seed.category_slug
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
    is_unlimited = excluded.is_unlimited,
    is_popular = excluded.is_popular,
    is_new = excluded.is_new,
    is_promo = excluded.is_promo,
    sort_order = excluded.sort_order,
    updated_at = now();

  delete from public.product_images image
  using public.products product
  where image.product_id = product.id
    and product.catalog_id = v_catalog_id
    and product.slug in (
      'classic-cheeseburger', 'spicy-chicken-burger', 'chicken-shawarma', 'classic-hot-dog',
      'french-fries', 'chicken-nuggets', 'cola', 'berry-lemonade'
    );

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select
    v_catalog_id,
    product.id,
    '/catalogg/assets/template-fast-food/' || seed.file_name,
    product.title || ' на белой тарелке',
    0
  from (
    values
      ('classic-cheeseburger', 'classic-cheeseburger.jpg'),
      ('spicy-chicken-burger', 'spicy-chicken-burger.jpg'),
      ('chicken-shawarma', 'chicken-shawarma.jpg'),
      ('classic-hot-dog', 'classic-hot-dog.jpg'),
      ('french-fries', 'french-fries.jpg'),
      ('chicken-nuggets', 'chicken-nuggets.jpg'),
      ('cola', 'cola.jpg'),
      ('berry-lemonade', 'berry-lemonade.jpg')
  ) as seed(product_slug, file_name)
  join public.products product
    on product.catalog_id = v_catalog_id
   and product.slug = seed.product_slug;

  insert into public.catalog_theme_settings (catalog_id, settings, updated_at)
  values (
    v_catalog_id,
    jsonb_build_object(
      'background_type', 'color',
      'background_color', '#fffaf4',
      'background_gradient_from', '#fffaf4',
      'background_gradient_to', '#ffffff',
      'background_image_url', '',
      'card_color', '#ffffff',
      'product_card_color', '#ffffff',
      'product_card_text_color', '#1d1b18',
      'settings_card_color', '#ffffff',
      'settings_card_text_color', '#1d1b18',
      'cart_panel_color', '#ffffff',
      'cart_panel_text_color', '#1d1b18',
      'card_radius', 18,
      'card_shadow', '0 14px 34px rgba(63, 43, 25, 0.10)',
      'text_primary', '#1d1b18',
      'text_secondary', '#746b63',
      'product_title_color', '#1d1b18',
      'category_title_color', '#1d1b18',
      'accent_color', '#e56b1f',
      'accent_secondary', '#ffb45f',
      'button_style', 'filled',
      'button_radius', 14,
      'header_style', 'compact'
    ),
    now()
  )
  on conflict (catalog_id) do update set
    settings = excluded.settings,
    updated_at = excluded.updated_at;

  insert into public.catalog_sections (catalog_id, key, title, enabled, sort_order, settings)
  select
    v_catalog_id,
    'product-choices',
    'Варианты блюд',
    true,
    110,
    jsonb_object_agg(
      product.id::text,
      case product.slug
        when 'classic-cheeseburger' then jsonb_build_array(
          jsonb_build_object('name', 'Средний', 'price', 390),
          jsonb_build_object('name', 'Большой', 'price', 490)
        )
        when 'spicy-chicken-burger' then jsonb_build_array(
          jsonb_build_object('name', 'Средний, не острый', 'price', 420),
          jsonb_build_object('name', 'Средний, острый', 'price', 420),
          jsonb_build_object('name', 'Большой, не острый', 'price', 520),
          jsonb_build_object('name', 'Большой, острый', 'price', 520)
        )
        when 'chicken-shawarma' then jsonb_build_array(
          jsonb_build_object('name', 'Средняя, не острая', 'price', 360),
          jsonb_build_object('name', 'Средняя, острая', 'price', 360),
          jsonb_build_object('name', 'Большая, не острая', 'price', 450),
          jsonb_build_object('name', 'Большая, острая', 'price', 450)
        )
        when 'classic-hot-dog' then jsonb_build_array(
          jsonb_build_object('name', 'Не острый', 'price', 260),
          jsonb_build_object('name', 'Острый', 'price', 260)
        )
        when 'french-fries' then jsonb_build_array(
          jsonb_build_object('name', 'Средняя', 'price', 170),
          jsonb_build_object('name', 'Большая', 'price', 240)
        )
        when 'chicken-nuggets' then jsonb_build_array(
          jsonb_build_object('name', '6 шт.', 'price', 240),
          jsonb_build_object('name', '9 шт.', 'price', 330),
          jsonb_build_object('name', '12 шт.', 'price', 410)
        )
        when 'cola' then jsonb_build_array(
          jsonb_build_object('name', '0,3 л', 'price', 120),
          jsonb_build_object('name', '0,5 л', 'price', 160)
        )
        when 'berry-lemonade' then jsonb_build_array(
          jsonb_build_object('name', '0,3 л', 'price', 180),
          jsonb_build_object('name', '0,5 л', 'price', 230)
        )
      end
    )
  from public.products product
  where product.catalog_id = v_catalog_id
    and product.slug in (
      'classic-cheeseburger', 'spicy-chicken-burger', 'chicken-shawarma', 'classic-hot-dog',
      'french-fries', 'chicken-nuggets', 'cola', 'berry-lemonade'
    )
  on conflict (catalog_id, key) do update set
    title = excluded.title,
    enabled = excluded.enabled,
    sort_order = excluded.sort_order,
    settings = excluded.settings;
end;
$$;
