-- Seed the reusable grocery business template. Future stores created by the
-- superadmin receive this assortment structure and can replace products freely.
do $$
declare
  grocery_template_id uuid;
begin
  select catalog.id
  into grocery_template_id
  from public.catalogs catalog
  where catalog.is_template = true
    and catalog.business_type = 'grocery'
  order by catalog.created_at
  limit 1;

  if grocery_template_id is null then
    raise exception 'grocery_template_not_found';
  end if;

  update public.catalogs
  set description = 'Свежие продукты, финики, товары для дома и быстрая доставка',
      logo_url = '/assets/template-grocery/icon-512.png',
      banner_url = '/assets/template-grocery/hero.webp',
      address = 'Цоци-Юрт',
      whatsapp = '',
      order_settings = pg_catalog.jsonb_build_object(
        'substitutions_enabled', true,
        'order_chat_enabled', true,
        'weighted_products_enabled', true
      ),
      pwa = pg_catalog.jsonb_build_object(
        'name', 'Продуктовый магазин',
        'short_name', 'Продукты',
        'theme_color', '#5B224E',
        'background_color', '#FFF8F2',
        'icon_192_url', '/assets/template-grocery/icon-192.png',
        'icon_512_url', '/assets/template-grocery/icon-512.png'
      ),
      updated_at = pg_catalog.now()
  where id = grocery_template_id;

  insert into public.categories (
    catalog_id, name, slug, description, image_url, icon, is_hidden, sort_order
  ) values
    (grocery_template_id, 'Финики и орехи', 'dates-nuts', 'Финики, сухофрукты, орехи и полезные смеси', '/assets/template-grocery/categories/dates-nuts.webp', 'nut', false, 10),
    (grocery_template_id, 'Фрукты', 'fruits', 'Свежие фрукты на вес и поштучно', '/assets/template-grocery/categories/fruits.webp', 'apple', false, 20),
    (grocery_template_id, 'Овощи и зелень', 'vegetables', 'Овощи, картофель, лук и свежая зелень', '/assets/template-grocery/categories/vegetables.webp', 'carrot', false, 30),
    (grocery_template_id, 'Молочное и яйца', 'dairy', 'Молоко, кефир, сыр, масло и яйца', '/assets/template-grocery/categories/dairy.webp', 'milk', false, 40),
    (grocery_template_id, 'Хлеб и выпечка', 'bakery', 'Свежий хлеб, лаваш и выпечка', '/assets/template-grocery/categories/bakery.webp', 'croissant', false, 50),
    (grocery_template_id, 'Бакалея', 'pantry', 'Крупы, макароны, мука, сахар и масло', '/assets/template-grocery/categories/pantry.webp', 'wheat', false, 60),
    (grocery_template_id, 'Халяль мясо', 'halal-meat', 'Говядина, курица и полуфабрикаты халяль', '/assets/template-grocery/categories/halal.webp', 'beef', false, 70),
    (grocery_template_id, 'Напитки', 'drinks', 'Вода, соки, чай и кофе', '/assets/template-grocery/categories/drinks.webp', 'cup-soda', false, 80),
    (grocery_template_id, 'Сладости и снеки', 'snacks', 'Печенье, шоколад, конфеты и снеки', '/assets/template-grocery/categories/snacks.webp', 'candy', false, 90),
    (grocery_template_id, 'Заморозка', 'frozen', 'Замороженные овощи, пельмени и мороженое', '/assets/template-grocery/categories/frozen.webp', 'snowflake', false, 100),
    (grocery_template_id, 'Для дома', 'household', 'Уборка, посуда и расходные материалы', '/assets/template-grocery/categories/household.webp', 'spray-can', false, 110),
    (grocery_template_id, 'Личная гигиена', 'personal-care', 'Мыло, шампунь и ежедневный уход', '/assets/template-grocery/categories/personal-care.webp', 'heart-handshake', false, 120)
  on conflict (catalog_id, slug) do update set
    name = excluded.name,
    description = excluded.description,
    image_url = excluded.image_url,
    icon = excluded.icon,
    is_hidden = excluded.is_hidden,
    sort_order = excluded.sort_order,
    updated_at = pg_catalog.now();

  insert into public.products (
    catalog_id,
    category_id,
    title,
    slug,
    sku,
    barcode,
    status,
    price,
    old_price,
    description,
    weight,
    stock_count,
    is_unlimited,
    is_popular,
    is_new,
    is_promo,
    custom_fields,
    sort_order,
    sale_unit,
    quantity_unit,
    price_basis_quantity,
    minimum_quantity,
    quantity_step,
    stock_quantity,
    allow_substitution
  )
  select
    grocery_template_id,
    category.id,
    seed.title,
    seed.slug,
    seed.sku,
    seed.barcode,
    'active'::public.product_status,
    seed.price,
    seed.old_price,
    seed.description,
    seed.weight_label,
    case when seed.sale_unit = 'weight'
      then pg_catalog.ceil(seed.stock_quantity::numeric / 1000)::integer
      else seed.stock_quantity
    end,
    false,
    seed.is_popular,
    seed.is_new,
    seed.old_price is not null,
    pg_catalog.jsonb_build_object(
      'category_image_url', seed.image_url,
      'substitution_hint', case when seed.allow_substitution then 'Предложить похожий товар' else '' end
    ),
    seed.sort_order,
    seed.sale_unit,
    case when seed.sale_unit = 'weight' then 'gram' else 'piece' end,
    case when seed.sale_unit = 'weight' then 1000 else 1 end,
    seed.minimum_quantity,
    seed.quantity_step,
    seed.stock_quantity,
    seed.allow_substitution
  from (
    values
      ('dates-nuts','Финики королевские Меджул','medjool-dates','FIN-DATE-001','',1190,null::integer,'Крупные мягкие финики с карамельным вкусом. Цена за 1 кг.','весовой','weight',250,50,18000,true,true,false,10,'/assets/template-grocery/categories/dates-nuts.webp'),
      ('dates-nuts','Финики Тунис','tunis-dates','FIN-DATE-002','',470,530,'Сушёные финики с косточкой. Цена за 1 кг.','весовой','weight',250,50,24000,true,false,false,20,'/assets/template-grocery/categories/dates-nuts.webp'),
      ('dates-nuts','Финики в упаковке 200 г','dates-pack-200','FIN-DATE-003','4607001000001',150,200,'Удобная упаковка для перекуса и чая.','200 г','piece',1,1,32,true,false,true,30,'/assets/template-grocery/categories/dates-nuts.webp'),
      ('dates-nuts','Курага отборная','dried-apricots','FIN-DRY-001','',890,null,'Мягкая курага без сахара. Цена за 1 кг.','весовой','weight',200,50,12000,true,false,false,40,'/assets/template-grocery/categories/dates-nuts.webp'),
      ('dates-nuts','Миндаль сырой','raw-almonds','FIN-NUT-001','',1090,null,'Сырой миндаль на вес.','весовой','weight',200,50,10000,true,false,false,50,'/assets/template-grocery/categories/dates-nuts.webp'),
      ('dates-nuts','Грецкий орех очищенный','walnut-kernels','FIN-NUT-002','',1350,null,'Очищенные ядра грецкого ореха.','весовой','weight',200,50,8000,true,false,false,60,'/assets/template-grocery/categories/dates-nuts.webp'),

      ('fruits','Бананы','bananas','FIN-FRU-001','',170,null,'Спелые бананы. Итоговый вес уточняется при сборке.','весовой','weight',250,50,26000,true,false,false,70,'/assets/template-grocery/categories/fruits.webp'),
      ('fruits','Яблоки красные','red-apples','FIN-FRU-002','',190,null,'Сочные сладкие яблоки. Цена за 1 кг.','весовой','weight',300,100,30000,true,false,false,80,'/assets/template-grocery/categories/fruits.webp'),
      ('fruits','Апельсины','oranges','FIN-FRU-003','',230,null,'Сочные апельсины на вес.','весовой','weight',300,100,22000,true,false,false,90,'/assets/template-grocery/categories/fruits.webp'),
      ('fruits','Виноград зелёный','green-grapes','FIN-FRU-004','',390,null,'Сладкий виноград без повреждений.','весовой','weight',300,100,16000,true,false,false,100,'/assets/template-grocery/categories/fruits.webp'),
      ('fruits','Лимон','lemon-piece','FIN-FRU-005','4607001000002',55,null,'Свежий лимон, 1 штука.','1 шт','piece',1,1,40,true,false,false,110,'/assets/template-grocery/categories/fruits.webp'),

      ('vegetables','Помидоры розовые','pink-tomatoes','FIN-VEG-001','',280,null,'Спелые розовые помидоры.','весовой','weight',300,100,25000,true,false,false,120,'/assets/template-grocery/categories/vegetables.webp'),
      ('vegetables','Огурцы','cucumbers','FIN-VEG-002','',220,null,'Хрустящие свежие огурцы.','весовой','weight',300,100,20000,true,false,false,130,'/assets/template-grocery/categories/vegetables.webp'),
      ('vegetables','Картофель','potatoes','FIN-VEG-003','',75,null,'Картофель отборный.','весовой','weight',1000,500,50000,true,false,false,140,'/assets/template-grocery/categories/vegetables.webp'),
      ('vegetables','Лук репчатый','onions','FIN-VEG-004','',65,null,'Лук репчатый.','весовой','weight',500,250,35000,true,false,false,150,'/assets/template-grocery/categories/vegetables.webp'),
      ('vegetables','Зелень ассорти','fresh-herbs','FIN-VEG-005','4607001000003',95,null,'Петрушка, укроп и кинза, пучок.','1 пучок','piece',1,1,24,true,false,false,160,'/assets/template-grocery/categories/vegetables.webp'),

      ('dairy','Молоко 3,2% 1 л','milk-32-1l','FIN-MLK-001','4607001000004',110,null,'Пастеризованное молоко, 1 литр.','1 л','piece',1,1,36,true,false,false,170,'/assets/template-grocery/categories/dairy.webp'),
      ('dairy','Кефир 2,5% 1 л','kefir-25-1l','FIN-MLK-002','4607001000005',115,null,'Свежий кефир, 1 литр.','1 л','piece',1,1,24,true,false,false,180,'/assets/template-grocery/categories/dairy.webp'),
      ('dairy','Сметана 20% 300 г','sour-cream-300','FIN-MLK-003','4607001000006',135,null,'Сметана 20%, стакан 300 г.','300 г','piece',1,1,20,true,false,false,190,'/assets/template-grocery/categories/dairy.webp'),
      ('dairy','Масло сливочное 180 г','butter-180','FIN-MLK-004','4607001000007',225,245,'Сливочное масло 82,5%.','180 г','piece',1,1,18,true,false,true,200,'/assets/template-grocery/categories/dairy.webp'),
      ('dairy','Сыр полутвёрдый','semi-hard-cheese','FIN-MLK-005','',790,null,'Сыр нарезается при сборке. Цена за 1 кг.','весовой','weight',200,50,9000,true,false,false,210,'/assets/template-grocery/categories/dairy.webp'),
      ('dairy','Яйца С1, 10 шт','eggs-c1-10','FIN-EGG-001','4607001000008',130,null,'Куриные яйца первой категории.','10 шт','piece',1,1,30,false,false,false,220,'/assets/template-grocery/categories/dairy.webp'),

      ('bakery','Хлеб домашний','home-bread','FIN-BRD-001','4607001000009',65,null,'Свежий пшеничный хлеб.','1 шт','piece',1,1,24,true,false,false,230,'/assets/template-grocery/categories/bakery.webp'),
      ('bakery','Хлеб ржаной','rye-bread','FIN-BRD-002','4607001000010',75,null,'Ароматный ржано-пшеничный хлеб.','1 шт','piece',1,1,18,true,false,false,240,'/assets/template-grocery/categories/bakery.webp'),
      ('bakery','Лаваш тонкий','thin-lavash','FIN-BRD-003','4607001000011',55,null,'Тонкий свежий лаваш.','1 уп.','piece',1,1,28,true,false,false,250,'/assets/template-grocery/categories/bakery.webp'),
      ('bakery','Круассан классический','classic-croissant','FIN-BRD-004','4607001000012',85,null,'Слоёный круассан без начинки.','1 шт','piece',1,1,16,true,true,false,260,'/assets/template-grocery/categories/bakery.webp'),

      ('pantry','Рис длиннозёрный 900 г','long-rice-900','FIN-GRC-001','4607001000013',145,null,'Рис длиннозёрный, упаковка 900 г.','900 г','piece',1,1,30,true,false,false,270,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Гречка 900 г','buckwheat-900','FIN-GRC-002','4607001000014',135,null,'Крупа гречневая, 900 г.','900 г','piece',1,1,26,true,false,false,280,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Макароны перья 450 г','pasta-penne-450','FIN-GRC-003','4607001000015',95,null,'Макароны из твёрдых сортов пшеницы.','450 г','piece',1,1,32,true,false,false,290,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Мука пшеничная 2 кг','flour-2kg','FIN-GRC-004','4607001000016',125,null,'Мука пшеничная высший сорт.','2 кг','piece',1,1,22,true,false,false,300,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Сахар 1 кг','sugar-1kg','FIN-GRC-005','4607001000017',95,null,'Сахар-песок.','1 кг','piece',1,1,40,true,false,false,310,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Масло подсолнечное 1 л','sunflower-oil-1l','FIN-GRC-006','4607001000018',165,null,'Рафинированное подсолнечное масло.','1 л','piece',1,1,24,true,false,false,320,'/assets/template-grocery/categories/pantry.webp'),
      ('pantry','Соль 1 кг','salt-1kg','FIN-GRC-007','4607001000019',45,null,'Соль пищевая.','1 кг','piece',1,1,35,true,false,false,330,'/assets/template-grocery/categories/pantry.webp'),

      ('halal-meat','Филе куриное халяль','halal-chicken-fillet','FIN-MEA-001','',490,null,'Охлаждённое куриное филе халяль. Цена за 1 кг.','весовой','weight',500,100,18000,true,false,false,340,'/assets/template-grocery/categories/halal.webp'),
      ('halal-meat','Говядина мякоть халяль','halal-beef','FIN-MEA-002','',790,null,'Охлаждённая мякоть говядины халяль.','весовой','weight',500,100,14000,true,false,false,350,'/assets/template-grocery/categories/halal.webp'),
      ('halal-meat','Фарш говяжий халяль','halal-ground-beef','FIN-MEA-003','',650,null,'Свежий говяжий фарш халяль.','весовой','weight',500,100,12000,true,false,false,360,'/assets/template-grocery/categories/halal.webp'),

      ('drinks','Вода без газа 1,5 л','still-water-15','FIN-DRK-001','4607001000020',65,null,'Питьевая негазированная вода.','1,5 л','piece',1,1,48,true,false,false,370,'/assets/template-grocery/categories/drinks.webp'),
      ('drinks','Вода газированная 1,5 л','sparkling-water-15','FIN-DRK-002','4607001000021',70,null,'Питьевая газированная вода.','1,5 л','piece',1,1,40,true,false,false,380,'/assets/template-grocery/categories/drinks.webp'),
      ('drinks','Сок апельсиновый 1 л','orange-juice-1l','FIN-DRK-003','4607001000022',160,null,'Апельсиновый сок, 1 литр.','1 л','piece',1,1,22,true,false,false,390,'/assets/template-grocery/categories/drinks.webp'),
      ('drinks','Чай чёрный 100 г','black-tea-100','FIN-DRK-004','4607001000023',145,null,'Листовой чёрный чай.','100 г','piece',1,1,18,true,false,false,400,'/assets/template-grocery/categories/drinks.webp'),
      ('drinks','Кофе молотый 250 г','ground-coffee-250','FIN-DRK-005','4607001000024',330,null,'Молотый кофе средней обжарки.','250 г','piece',1,1,16,true,false,false,410,'/assets/template-grocery/categories/drinks.webp'),

      ('snacks','Печенье овсяное 300 г','oat-cookies-300','FIN-SNK-001','4607001000025',120,null,'Овсяное печенье к чаю.','300 г','piece',1,1,24,true,false,false,420,'/assets/template-grocery/categories/snacks.webp'),
      ('snacks','Шоколад молочный 90 г','milk-chocolate-90','FIN-SNK-002','4607001000026',110,null,'Плитка молочного шоколада.','90 г','piece',1,1,30,true,false,false,430,'/assets/template-grocery/categories/snacks.webp'),
      ('snacks','Конфеты ассорти','assorted-candy','FIN-SNK-003','',690,null,'Шоколадные конфеты ассорти. Цена за 1 кг.','весовой','weight',200,50,10000,true,false,false,440,'/assets/template-grocery/categories/snacks.webp'),
      ('snacks','Чипсы картофельные 140 г','potato-chips-140','FIN-SNK-004','4607001000027',150,null,'Хрустящие картофельные чипсы.','140 г','piece',1,1,20,true,false,false,450,'/assets/template-grocery/categories/snacks.webp'),

      ('frozen','Пельмени халяль 800 г','halal-dumplings-800','FIN-FRZ-001','4607001000028',390,null,'Пельмени с говядиной халяль.','800 г','piece',1,1,18,true,false,false,460,'/assets/template-grocery/categories/frozen.webp'),
      ('frozen','Овощная смесь 400 г','frozen-vegetables-400','FIN-FRZ-002','4607001000029',175,null,'Замороженная овощная смесь.','400 г','piece',1,1,20,true,false,false,470,'/assets/template-grocery/categories/frozen.webp'),
      ('frozen','Мороженое пломбир 400 г','ice-cream-400','FIN-FRZ-003','4607001000030',240,null,'Классический сливочный пломбир.','400 г','piece',1,1,14,true,false,false,480,'/assets/template-grocery/categories/frozen.webp'),

      ('household','Средство для посуды 500 мл','dish-soap-500','FIN-HOM-001','4607001000031',135,null,'Гель для мытья посуды.','500 мл','piece',1,1,18,true,false,false,490,'/assets/template-grocery/categories/household.webp'),
      ('household','Порошок стиральный 3 кг','laundry-powder-3kg','FIN-HOM-002','4607001000032',520,null,'Стиральный порошок для автоматической стирки.','3 кг','piece',1,1,12,true,false,false,500,'/assets/template-grocery/categories/household.webp'),
      ('household','Полотенца бумажные, 2 рулона','paper-towels-2','FIN-HOM-003','4607001000033',160,null,'Двухслойные бумажные полотенца.','2 рул.','piece',1,1,20,true,false,false,510,'/assets/template-grocery/categories/household.webp'),
      ('household','Пакеты для мусора 60 л','trash-bags-60l','FIN-HOM-004','4607001000034',145,null,'Прочные пакеты для мусора, 20 штук.','20 шт','piece',1,1,16,true,false,false,520,'/assets/template-grocery/categories/household.webp'),

      ('personal-care','Мыло жидкое 500 мл','liquid-soap-500','FIN-CAR-001','4607001000035',140,null,'Жидкое мыло для рук.','500 мл','piece',1,1,18,true,false,false,530,'/assets/template-grocery/categories/personal-care.webp'),
      ('personal-care','Шампунь 400 мл','shampoo-400','FIN-CAR-002','4607001000036',260,null,'Шампунь для ежедневного ухода.','400 мл','piece',1,1,16,true,false,false,540,'/assets/template-grocery/categories/personal-care.webp'),
      ('personal-care','Зубная паста 100 мл','toothpaste-100','FIN-CAR-003','4607001000037',165,null,'Зубная паста для ежедневной защиты.','100 мл','piece',1,1,22,true,false,false,550,'/assets/template-grocery/categories/personal-care.webp')
  ) as seed(
    category_slug, title, slug, sku, barcode, price, old_price, description,
    weight_label, sale_unit, minimum_quantity, quantity_step, stock_quantity,
    allow_substitution, is_popular, is_new, sort_order, image_url
  )
  join public.categories category
    on category.catalog_id = grocery_template_id
   and category.slug = seed.category_slug
  on conflict (catalog_id, slug) do update set
    category_id = excluded.category_id,
    title = excluded.title,
    sku = excluded.sku,
    barcode = excluded.barcode,
    status = excluded.status,
    price = excluded.price,
    old_price = excluded.old_price,
    description = excluded.description,
    weight = excluded.weight,
    stock_count = excluded.stock_count,
    is_unlimited = excluded.is_unlimited,
    is_popular = excluded.is_popular,
    is_new = excluded.is_new,
    is_promo = excluded.is_promo,
    custom_fields = excluded.custom_fields,
    sort_order = excluded.sort_order,
    sale_unit = excluded.sale_unit,
    quantity_unit = excluded.quantity_unit,
    price_basis_quantity = excluded.price_basis_quantity,
    minimum_quantity = excluded.minimum_quantity,
    quantity_step = excluded.quantity_step,
    stock_quantity = excluded.stock_quantity,
    allow_substitution = excluded.allow_substitution,
    updated_at = pg_catalog.now();

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select
    grocery_template_id,
    product.id,
    product.custom_fields ->> 'category_image_url',
    product.title,
    0
  from public.products product
  where product.catalog_id = grocery_template_id
    and nullif(product.custom_fields ->> 'category_image_url', '') is not null
    and not exists (
      select 1 from public.product_images image
      where image.catalog_id = grocery_template_id
        and image.product_id = product.id
        and image.sort_order = 0
    );

  insert into public.catalog_theme_settings (catalog_id, settings)
  values (
    grocery_template_id,
    pg_catalog.jsonb_build_object(
      'accent_color', '#5B224E',
      'background_color', '#FFF8F2',
      'button_color', '#5B224E',
      'button_text_color', '#FFFFFF',
      'card_color', '#FFFFFF',
      'text_color', '#25151F',
      'muted_text_color', '#796772'
    )
  )
  on conflict (catalog_id) do update set
    settings = excluded.settings,
    updated_at = pg_catalog.now();

  insert into public.restaurant_delivery_settings (
    catalog_id,
    enable_orders,
    enable_delivery,
    enable_pickup,
    enable_hall_orders,
    use_own_courier,
    use_platform_drivers,
    fallback_to_platform_drivers,
    minimum_order_amount,
    free_delivery_from,
    default_preparation_minutes,
    delivery_area_mode,
    primary_city,
    service_settlements
  ) values (
    grocery_template_id,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    500,
    2000,
    35,
    'settlements',
    'Цоци-Юрт',
    array['Цоци-Юрт']::text[]
  )
  on conflict (catalog_id) do update set
    enable_orders = excluded.enable_orders,
    enable_delivery = excluded.enable_delivery,
    enable_pickup = excluded.enable_pickup,
    enable_hall_orders = excluded.enable_hall_orders,
    use_own_courier = excluded.use_own_courier,
    use_platform_drivers = excluded.use_platform_drivers,
    fallback_to_platform_drivers = excluded.fallback_to_platform_drivers,
    minimum_order_amount = excluded.minimum_order_amount,
    free_delivery_from = excluded.free_delivery_from,
    default_preparation_minutes = excluded.default_preparation_minutes,
    delivery_area_mode = excluded.delivery_area_mode,
    primary_city = excluded.primary_city,
    service_settlements = excluded.service_settlements,
    updated_at = pg_catalog.now();
end;
$$;
