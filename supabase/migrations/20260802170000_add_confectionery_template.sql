-- Register a confectionery catalog through the existing template/catalog system.
-- Product-specific behavior stays in catalog_sections JSON; no confectionery table or enum is introduced.

alter table public.clients drop constraint if exists clients_business_type_check;
alter table public.clients add constraint clients_business_type_check
  check (business_type in ('restaurant', 'coffee_shop', 'confectionery'));

alter table public.catalogs drop constraint if exists catalogs_business_type_check;
alter table public.catalogs add constraint catalogs_business_type_check
  check (business_type in ('restaurant', 'coffee_shop', 'confectionery'));

alter table public.clients drop constraint if exists clients_template_type_check;
alter table public.clients add constraint clients_template_type_check
  check (template_type in ('restaurant', 'coffee_shop', 'confectionery'));

alter table public.catalogs drop constraint if exists catalogs_template_type_check;
alter table public.catalogs add constraint catalogs_template_type_check
  check (template_type in ('restaurant', 'coffee_shop', 'confectionery'));

do $$
declare
  v_base_template_id uuid;
  v_template_id uuid;
begin
  select id into v_template_id
  from public.catalogs
  where slug = 'confectionery' and is_template = true
  limit 1;

  if v_template_id is null then
    select id into v_base_template_id
    from public.catalogs
    where is_template = true and business_type = 'restaurant'
    order by created_at
    limit 1;

    if v_base_template_id is null then
      raise notice 'Base restaurant template not found; confectionery template seed skipped.';
      return;
    end if;

    v_template_id := public.create_restaurant_from_template(
      v_base_template_id,
      'Dolce House',
      'confectionery',
      null,
      null
    );
  end if;

  update public.catalogs
  set name = 'Dolce House',
      description = 'Торты, десерты и сладкие подарки',
      slug = 'confectionery',
      logo_url = '/catalogg/assets/templates/confectionery/logo.svg',
      banner_url = '/catalogg/assets/templates/confectionery/hero.webp',
      address = 'ул. Цветочная, 18',
      whatsapp = '79990000000',
      is_template = true,
      template_name = 'confectionery',
      business_type = 'confectionery',
      template_type = 'confectionery',
      seo = jsonb_build_object(
        'title', 'Dolce House — торты, десерты и сладкие подарки',
        'description', 'Редактируемый демонстрационный каталог современной кондитерской.'
      ),
      updated_at = now()
  where id = v_template_id;

  delete from public.products where catalog_id = v_template_id;
  delete from public.categories where catalog_id = v_template_id;

  insert into public.categories (catalog_id, name, slug, description, image_url, icon, is_hidden, sort_order)
  values
    (v_template_id, 'Популярное', 'popular', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/red-velvet-cake.webp', 'star', false, 10),
    (v_template_id, 'Торты', 'cakes', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/medovik-cake.webp', 'cake', false, 20),
    (v_template_id, 'Торты на заказ', 'custom-cakes', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/birthday-custom-cake.webp', 'cake', false, 30),
    (v_template_id, 'Пироги', 'pies', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/apple-pie.webp', 'pie', false, 40),
    (v_template_id, 'Порционные десерты', 'portion-desserts', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/new-york-cheesecake.webp', 'dessert', false, 50),
    (v_template_id, 'Капкейки и эклеры', 'cupcakes-eclairs', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/cupcake-set.webp', 'cupcake', false, 60),
    (v_template_id, 'Фрукты в шоколаде', 'chocolate-fruit', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/strawberry-chocolate-12.webp', 'strawberry', false, 70),
    (v_template_id, 'Выпечка и печенье', 'bakery-cookies', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/homemade-cookie-box.webp', 'cookie', false, 80),
    (v_template_id, 'Подарочные наборы', 'gift-sets', '{"kind":"food","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/gift-set-for-her.webp', 'gift', false, 90),
    (v_template_id, 'Напитки', 'drinks', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/templates/confectionery/products/cocoa.webp', 'cup-soda', false, 100);

  insert into public.products (
    catalog_id, category_id, title, slug, status, price, description, ingredients,
    weight, serving, stock_count, is_unlimited, is_popular, is_new, is_promo, sort_order
  )
  select v_template_id, category.id, seed.title, seed.slug, 'active'::public.product_status,
    seed.price, seed.description, seed.ingredients, seed.weight, seed.serving,
    0, true, seed.is_popular, seed.is_new, seed.is_popular, seed.sort_order
  from (values
    ('cakes','medovik-classic','Медовик классический',1600,'Тонкие медовые коржи и нежный сметанный крем.','Мёд, мука, яйца, сметанный крем','от 1,5 кг','Приготовление: 24–48 часов',true,false,10),
    ('cakes','red-velvet-cake','Красный бархат',1900,'Бархатный бисквит с какао и сливочно-сырным кремом.','Бисквит, какао, сливочный сыр, сливки','от 1,5 кг','Приготовление: 24–48 часов',true,false,20),
    ('cakes','snickers-cake','Шоколадный «Сникерс»',2200,'Шоколадные коржи, карамель и жареный арахис.','Шоколад, карамель, арахис, сливочный крем','от 1,5 кг','Приготовление: 24–48 часов',false,false,30),
    ('cakes','pistachio-raspberry-cake','Фисташка-малина',2600,'Фисташковый бисквит, малиновое конфи и воздушный крем.','Фисташка, малина, сливочный сыр, яйца','от 1,5 кг','Приготовление: 24–48 часов',true,false,40),
    ('cakes','carrot-cake','Морковный торт',1750,'Пряный морковный бисквит с орехами и крем-чизом.','Морковь, грецкий орех, корица, сливочный сыр','от 1,5 кг','Приготовление: 24–48 часов',false,false,50),
    ('cakes','classic-cheesecake','Чизкейк классический',1800,'Нежный запечённый чизкейк на песочной основе.','Сливочный сыр, сливки, яйца, печенье','1,2 кг','',true,false,60),
    ('cakes','bento-cake','Бенто-торт',950,'Мини-торт на двоих с лаконичным оформлением.','Бисквит, сливочный сыр, ягодная начинка','450–500 г','',false,true,70),
    ('custom-cakes','childrens-custom-cake','Детский торт на заказ',2800,'Торт с безопасным тематическим декором и выбранной начинкой.','Состав зависит от выбранной начинки','от 1,5 кг','Минимум за 24 часа',false,false,80),
    ('custom-cakes','birthday-custom-cake','Торт на день рождения',2500,'Праздничный торт с персональной надписью и декором.','Состав зависит от выбранной начинки','от 1,5 кг','Минимум за 24 часа',true,false,90),
    ('custom-cakes','wedding-custom-cake','Свадебный торт',3500,'Элегантный многоярусный торт для особенного дня.','Состав зависит от выбранной начинки','от 3 кг','Минимум за 24 часа',false,false,100),
    ('custom-cakes','minimal-custom-cake','Минималистичный торт',2300,'Чистые линии, сдержанная палитра и аккуратная надпись.','Состав зависит от выбранной начинки','от 1,5 кг','Минимум за 24 часа',false,false,110),
    ('pies','apple-pie','Яблочный пирог',850,'Домашний пирог с яблоками, корицей и хрустящей корочкой.','Яблоки, мука, сливочное масло, корица','900 г','',true,false,120),
    ('pies','cherry-pie','Вишнёвый пирог',950,'Рассыпчатое тесто и сочная вишнёвая начинка.','Вишня, мука, сливочное масло, сахар','900 г','',false,false,130),
    ('pies','cottage-cheese-pie','Пирог с творогом',900,'Мягкий пирог с нежной творожной начинкой.','Творог, яйца, мука, сливочное масло','900 г','',false,false,140),
    ('pies','chocolate-tart','Шоколадный тарт',1250,'Тонкая песочная основа и насыщенный шоколадный ганаш.','Шоколад, сливки, мука, сливочное масло','750 г','',false,true,150),
    ('portion-desserts','medovik-slice','Медовик, кусочек',220,'Классический медовик в порционной подаче.','Мёд, мука, сметанный крем','130 г','',true,false,160),
    ('portion-desserts','napoleon-slice','Наполеон, кусочек',240,'Слоёные коржи с нежным заварным кремом.','Слоёное тесто, молоко, яйца, ваниль','140 г','',false,false,170),
    ('portion-desserts','red-velvet-slice','Красный бархат, кусочек',280,'Влажный бисквит с лёгким крем-чизом.','Бисквит, какао, сливочный сыр','140 г','',false,false,180),
    ('portion-desserts','new-york-cheesecake','Чизкейк «Нью-Йорк»',330,'Плотный сливочный чизкейк с ванильной нотой.','Сливочный сыр, сливки, яйца, печенье','150 г','',true,false,190),
    ('portion-desserts','tiramisu-cup','Тирамису в стаканчике',320,'Маскарпоне, кофе и какао в удобной порционной подаче.','Маскарпоне, савоярди, кофе, какао','180 г','',false,false,200),
    ('portion-desserts','oreo-trifle','Трайфл Oreo',300,'Шоколадный бисквит, сливочный крем и крошка печенья.','Бисквит, сливочный крем, шоколадное печенье','180 г','',false,false,210),
    ('cupcakes-eclairs','vanilla-cupcake','Капкейк ванильный',180,'Ванильный бисквит с шапочкой сливочного крема.','Мука, яйца, ваниль, сливочный сыр','90 г','',false,false,220),
    ('cupcakes-eclairs','chocolate-cupcake','Капкейк шоколадный',200,'Шоколадный бисквит и насыщенный крем.','Шоколад, какао, мука, сливочный сыр','90 г','',false,false,230),
    ('cupcakes-eclairs','vanilla-eclair','Эклер ванильный',150,'Заварное тесто и лёгкий ванильный крем.','Мука, яйца, молоко, ваниль','75 г','',false,false,240),
    ('cupcakes-eclairs','pistachio-eclair','Эклер фисташковый',220,'Эклер с фисташковым кремом и тонкой глазурью.','Фисташка, молоко, яйца, мука','80 г','',true,false,250),
    ('cupcakes-eclairs','cupcake-set','Набор капкейков',760,'Ассорти ванильных и шоколадных капкейков.','Бисквит, сливочный крем, шоколад, ваниль','4, 6 или 9 штук','',true,false,260),
    ('chocolate-fruit','milk-chocolate-banana','Банан в молочном шоколаде',180,'Спелый банан в тонком слое молочного шоколада.','Банан, молочный шоколад','','',true,false,270),
    ('chocolate-fruit','pistachio-chocolate-banana','Банан в шоколаде с фисташкой',260,'Банан в шоколаде с хрустящей фисташковой крошкой.','Банан, шоколад, фисташка','','',false,false,280),
    ('chocolate-fruit','chocolate-banana-set','Набор бананов в шоколаде',690,'Набор бананов с разным шоколадом и посыпками.','Бананы, шоколад, орехи','','',false,false,290),
    ('chocolate-fruit','strawberry-chocolate-6','Клубника в шоколаде, 6 штук',790,'Свежая клубника в молочном и белом шоколаде.','Клубника, шоколад','6 штук','',false,false,300),
    ('chocolate-fruit','strawberry-chocolate-12','Клубника в шоколаде, 12 штук',1500,'Большая подарочная коробка свежей клубники в шоколаде.','Клубника, шоколад, фисташка','12 штук','',true,false,310),
    ('bakery-cookies','chocolate-cookie','Шоколадное печенье',120,'Мягкое печенье с кусочками тёмного шоколада.','Мука, сливочное масло, шоколад','70 г','',false,false,320),
    ('bakery-cookies','homemade-cookie-box','Коробка домашнего печенья',450,'Ассорти свежего печенья в аккуратной коробке.','Песочное и шоколадное печенье','350 г','',false,false,330),
    ('bakery-cookies','brownie','Брауни',230,'Плотный шоколадный брауни с влажной серединой.','Шоколад, сливочное масло, яйца, какао','110 г','',true,false,340),
    ('bakery-cookies','macarons-6','Макаронс, 6 штук',780,'Шесть миндальных пирожных с разными начинками.','Миндальная мука, белок, сливочный крем','6 штук','',false,false,350),
    ('gift-sets','mini-sweets-set','Мини-набор сладостей',1200,'Небольшой подарок с десертами и печеньем.','Состав набора уточняется при заказе','','',false,false,360),
    ('gift-sets','gift-set-for-her','Набор «Для неё»',1850,'Клубника в шоколаде, макаронс и мини-десерты.','Клубника, шоколад, макаронс, десерты','','',true,false,370),
    ('gift-sets','large-gift-box','Большой подарочный бокс',2900,'Премиальный сладкий бокс для важного события.','Десерты, шоколад, ягоды, печенье','','',false,false,380),
    ('gift-sets','assorted-box','Коробка ассорти',1450,'Сбалансированное ассорти популярных сладостей.','Капкейки, эклеры, печенье, макаронс','','',false,false,390),
    ('drinks','cocoa','Какао',180,'Тёплый молочный какао с насыщенным вкусом.','Молоко, какао, сахар','300 мл','',true,false,400),
    ('drinks','milkshake','Молочный коктейль',250,'Густой ванильный коктейль из мороженого и молока.','Молоко, мороженое, ваниль','350 мл','',false,false,410),
    ('drinks','berry-lemonade','Ягодный лимонад',220,'Освежающий лимонад с ягодами и мятой.','Ягоды, лимон, мята, содовая','400 мл','',false,false,420)
  ) as seed(category_slug, slug, title, price, description, ingredients, weight, serving, is_popular, is_new, sort_order)
  join public.categories category on category.catalog_id = v_template_id and category.slug = seed.category_slug;

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select v_template_id, product.id,
    '/catalogg/assets/templates/confectionery/products/' ||
      case when product.slug = 'medovik-classic' then 'medovik-cake' else product.slug end || '.webp',
    product.title || ' — фото товара', 0
  from public.products product
  where product.catalog_id = v_template_id
    and product.slug not in (
      'carrot-cake','minimal-custom-cake','cottage-cheese-pie','oreo-trifle',
      'chocolate-cookie','assorted-box','berry-lemonade'
    );

  insert into public.catalog_sections (catalog_id, key, title, enabled, sort_order, settings)
  select v_template_id, 'product-config', 'Параметры товаров', true, 112,
    jsonb_object_agg(product.id::text, jsonb_strip_nulls(jsonb_build_object(
      'pricing_type', case
        when product.slug in ('medovik-classic','red-velvet-cake','snickers-cake','pistachio-raspberry-cake','carrot-cake','childrens-custom-cake','birthday-custom-cake','wedding-custom-cake','minimal-custom-cake') then 'per_kg'
        when product.slug in ('bento-cake','mini-sweets-set','large-gift-box') then 'from'
        when product.slug in ('cupcake-set','chocolate-banana-set') then 'variant'
        else 'fixed' end,
      'price_prefix', case when product.slug in ('childrens-custom-cake','birthday-custom-cake','wedding-custom-cake','minimal-custom-cake') then 'от' else null end,
      'price_tier', case
        when product.slug in ('bento-cake','apple-pie','medovik-slice','napoleon-slice','red-velvet-slice','vanilla-cupcake','chocolate-cupcake','vanilla-eclair','milk-chocolate-banana','chocolate-cookie','homemade-cookie-box','brownie','cocoa','milkshake','berry-lemonade') then 'budget'
        when product.slug in ('snickers-cake','pistachio-raspberry-cake','childrens-custom-cake','birthday-custom-cake','wedding-custom-cake','minimal-custom-cake','chocolate-tart','strawberry-chocolate-12','gift-set-for-her','large-gift-box') then 'premium'
        else 'standard' end,
      'unit', case when product.slug in ('medovik-classic','red-velvet-cake','snickers-cake','pistachio-raspberry-cake','carrot-cake','childrens-custom-cake','birthday-custom-cake','wedding-custom-cake','minimal-custom-cake') then 'кг' else 'шт' end,
      'minimum_weight', case when product.slug = 'wedding-custom-cake' then 3.0 when product.slug in ('medovik-classic','red-velvet-cake','snickers-cake','pistachio-raspberry-cake','carrot-cake','childrens-custom-cake','birthday-custom-cake','minimal-custom-cake') then 1.5 else null end,
      'weight_step', case when product.slug in ('medovik-classic','red-velvet-cake','snickers-cake','pistachio-raspberry-cake','carrot-cake','childrens-custom-cake','birthday-custom-cake','wedding-custom-cake','minimal-custom-cake') then 0.5 else null end,
      'advance_order_hours', case when category.slug = 'custom-cakes' then 24 else null end,
      'preparation_time', case when category.slug in ('cakes','custom-cakes') then '24–48 часов' else null end,
      'allergens', jsonb_build_array('глютен','яйца','молочные продукты'),
      'allow_inscription', case when category.slug = 'custom-cakes' then true else null end,
      'allow_decoration_comment', case when category.slug = 'custom-cakes' then true else null end,
      'allow_production_schedule', case when category.slug = 'custom-cakes' then true else null end,
      'placeholder_kind', case when product.slug in ('carrot-cake','minimal-custom-cake','cottage-cheese-pie','oreo-trifle','chocolate-cookie','assorted-box','berry-lemonade') then 'dessert' else null end,
      'old_price', case when product.slug = 'new-york-cheesecake' then 360 else null end
    )))
  from public.products product
  join public.categories category on category.id = product.category_id
  where product.catalog_id = v_template_id
  on conflict (catalog_id, key) do update set settings = excluded.settings, enabled = true;

  insert into public.catalog_sections (catalog_id, key, title, enabled, sort_order, settings)
  values (
    v_template_id, 'product-choices', 'Варианты товаров', true, 110,
    jsonb_build_object(
      (select id::text from public.products where catalog_id = v_template_id and slug = 'cupcake-set'),
      jsonb_build_array(jsonb_build_object('name','4 штуки','price',760), jsonb_build_object('name','6 штук','price',1080), jsonb_build_object('name','9 штук','price',1530)),
      (select id::text from public.products where catalog_id = v_template_id and slug = 'chocolate-banana-set'),
      jsonb_build_array(jsonb_build_object('name','3 штуки','price',690), jsonb_build_object('name','5 штук','price',1090), jsonb_build_object('name','8 штук','price',1680))
    )
  ) on conflict (catalog_id, key) do update set settings = excluded.settings, enabled = true;

  update public.products product
  set custom_fields = coalesce(config.settings -> product.id::text, '{}'::jsonb)
    || jsonb_build_object('choice_options', coalesce(choices.settings -> product.id::text, '[]'::jsonb))
  from public.catalog_sections config
  join public.catalog_sections choices
    on choices.catalog_id = config.catalog_id and choices.key = 'product-choices'
  where product.catalog_id = v_template_id
    and config.catalog_id = v_template_id
    and config.key = 'product-config';

  insert into public.product_option_groups (catalog_id, product_id, name, required, min_selected, max_selected, sort_order)
  select v_template_id, product.id, group_seed.name, true, 1, 1, group_seed.sort_order
  from public.products product
  join public.categories category on category.id = product.category_id
  cross join (values ('Начинка',10),('Декор',20)) as group_seed(name, sort_order)
  where product.catalog_id = v_template_id and category.slug = 'custom-cakes';

  insert into public.product_options (catalog_id, group_id, name, price_delta, is_default, sort_order)
  select v_template_id, group_row.id, option_seed.name, option_seed.price_delta, option_seed.is_default, option_seed.sort_order
  from public.product_option_groups group_row
  cross join lateral (
    select * from (values
      ('Начинка','Медовик',0,true,10),('Начинка','Красный бархат',0,false,20),('Начинка','Шоколад-вишня',100,false,30),('Начинка','Фисташка-малина',250,false,40),('Начинка','Сникерс',150,false,50),('Начинка','Ваниль-клубника',100,false,60),
      ('Декор','Без дополнительного декора',0,true,10),('Декор','Ягоды',350,false,20),('Декор','Шоколадный декор',300,false,30),('Декор','Минималистичный декор',200,false,40),('Декор','Тематический декор',600,false,50)
    ) as options(group_name, name, price_delta, is_default, sort_order)
    where options.group_name = group_row.name
  ) option_seed
  where group_row.catalog_id = v_template_id;

  insert into public.catalog_theme_settings (catalog_id, settings, updated_at)
  values (v_template_id, jsonb_build_object(
    'background_type','color','background_color','#fff8f2','background_gradient_from','#fff8f2','background_gradient_to','#f6e9df',
    'background_image_url','','card_color','#ffffff','product_card_color','#ffffff','product_card_text_color','#382620',
    'settings_card_color','#ffffff','settings_card_text_color','#382620','cart_panel_color','#ffffff','cart_panel_text_color','#382620',
    'card_radius',18,'card_shadow','0 14px 36px rgba(91, 55, 45, 0.10)','text_primary','#382620','text_secondary','#806d66',
    'product_title_color','#382620','category_title_color','#ffffff','accent_color','#b85f6b','accent_secondary','#d9a66c',
    'button_style','filled','button_radius',16,'header_style','compact'
  ), now()) on conflict (catalog_id) do update set settings = excluded.settings, updated_at = now();

  insert into public.catalog_sections (catalog_id, key, title, enabled, sort_order, settings)
  values
    (v_template_id, 'catalog-info', 'Информация каталога', true, 6, jsonb_build_object(
      'catalog_notice','Торты на заказ — оформление минимум за 24 часа',
      'working_hours','Ежедневно, 09:00–21:00',
      'minimum_order',700
    )),
    (v_template_id, 'restaurant-gallery', 'Обложки ресторана', true, 5, jsonb_build_object('images', jsonb_build_array('/catalogg/assets/templates/confectionery/hero.webp')))
  on conflict (catalog_id, key) do update set settings = excluded.settings, enabled = true;
end;
$$;

-- Resolve variants, modifier surcharges and validated weight prices on the server.
create or replace function public.apply_catalog_variant_price_to_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_product_id text;
  resolved_variant_price integer;
  modifier_delta integer := 0;
  product_config jsonb := '{}'::jsonb;
  selected_weight numeric;
  minimum_weight numeric;
  weight_step numeric;
begin
  settings_product_id := coalesce(new.product_id::text, nullif(trim(new.options #>> '{0,product_id}'), ''));

  if new.product_id is not null then
    select coalesce(product.custom_fields, '{}'::jsonb)
      into product_config
      from public.products product
      where product.id = new.product_id and product.catalog_id = new.catalog_id;
  end if;

  select (choice.value ->> 'price')::integer
    into resolved_variant_price
    from jsonb_array_elements(
      case when jsonb_typeof(product_config -> 'choice_options') = 'array'
        then product_config -> 'choice_options' else '[]'::jsonb end
    ) as choice(value)
    where coalesce(choice.value ->> 'price', '') ~ '^[0-9]+$'
      and exists (
        select 1 from jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
        where trim(selected.value ->> 'name') = trim(choice.value ->> 'name')
      )
    limit 1;

  if resolved_variant_price is null then
    select (choice.value ->> 'price')::integer
      into resolved_variant_price
    from public.catalog_sections section
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(section.settings -> settings_product_id) = 'array'
        then section.settings -> settings_product_id else '[]'::jsonb end
    ) as choice(value)
    where section.catalog_id = new.catalog_id
      and section.key = 'product-choices'
      and coalesce(choice.value ->> 'price', '') ~ '^[0-9]+$'
      and exists (
        select 1 from jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
        where trim(selected.value ->> 'name') = trim(choice.value ->> 'name')
    )
    limit 1;
  end if;

  if new.product_id is not null then
    select coalesce(sum(option_row.price_delta), 0)::integer
      into modifier_delta
      from jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
      join public.product_option_groups group_row
        on group_row.catalog_id = new.catalog_id
       and group_row.product_id = new.product_id
       and group_row.id::text = selected.value ->> 'group_id'
      join public.product_options option_row
        on option_row.catalog_id = new.catalog_id
       and option_row.group_id = group_row.id
       and option_row.id::text = selected.value ->> 'option_id';
  end if;

  if product_config = '{}'::jsonb then
    select coalesce(section.settings -> settings_product_id, '{}'::jsonb)
      into product_config
      from public.catalog_sections section
      where section.catalog_id = new.catalog_id and section.key = 'product-config'
      limit 1;
  end if;

  if product_config ->> 'pricing_type' = 'per_kg' then
    select (selected.value ->> 'value')::numeric
      into selected_weight
      from jsonb_array_elements(coalesce(new.options, '[]'::jsonb)) selected(value)
      where selected.value ->> 'key' = 'weight'
        and coalesce(selected.value ->> 'value', '') ~ '^[0-9]+([.][0-9]+)?$'
      limit 1;
    minimum_weight := greatest(0.1, coalesce((product_config ->> 'minimum_weight')::numeric, 1));
    weight_step := greatest(0.1, coalesce((product_config ->> 'weight_step')::numeric, 0.5));
    if selected_weight is null or selected_weight < minimum_weight
      or abs(((selected_weight - minimum_weight) / weight_step) - round((selected_weight - minimum_weight) / weight_step)) > 0.0001 then
      raise exception 'Unsupported product weight';
    end if;
    new.unit_price := round(new.unit_price * selected_weight)::integer + modifier_delta;
  else
    new.unit_price := coalesce(resolved_variant_price, new.unit_price) + modifier_delta;
  end if;
  new.line_total := new.unit_price * new.quantity;
  return new;
end;
$$;

revoke execute on function public.apply_catalog_variant_price_to_order_item() from public, anon, authenticated;
