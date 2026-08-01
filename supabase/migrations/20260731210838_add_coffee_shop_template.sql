-- Add a coffee-shop variant of the existing catalog without duplicating the app.
-- Existing clients and catalogs remain restaurant templates by default.

alter table public.clients
  add column if not exists template_type text not null default 'restaurant';

update public.clients
set template_type = case when business_type = 'coffee_shop' then 'coffee_shop' else 'restaurant' end
where template_type not in ('restaurant', 'coffee_shop') or template_type is null or business_type = 'coffee_shop';

alter table public.clients drop constraint if exists clients_template_type_check;
alter table public.clients add constraint clients_template_type_check
  check (template_type in ('restaurant', 'coffee_shop'));

alter table public.catalogs
  add column if not exists template_type text not null default 'restaurant';

update public.catalogs
set template_type = case when business_type = 'coffee_shop' then 'coffee_shop' else 'restaurant' end
where template_type not in ('restaurant', 'coffee_shop') or template_type is null or business_type = 'coffee_shop';

alter table public.catalogs drop constraint if exists catalogs_template_type_check;
alter table public.catalogs add constraint catalogs_template_type_check
  check (template_type in ('restaurant', 'coffee_shop'));

do $$
declare
  v_base_template_id uuid;
  v_template_id uuid;
begin
  select id into v_template_id
  from public.catalogs
  where slug = 'coffee-shop' and is_template = true
  limit 1;

  if v_template_id is null then
    select id into v_base_template_id
    from public.catalogs
    where is_template = true and slug = 'restaurant'
    limit 1;

    if v_base_template_id is null then
      raise notice 'Base restaurant template not found; coffee-shop template seed skipped.';
      return;
    end if;

    v_template_id := public.create_restaurant_from_template(
      v_base_template_id,
      'Кофейня WayYaam',
      'coffee-shop',
      null,
      null
    );
  end if;

  update public.catalogs
  set name = 'Кофейня WayYaam',
      description = 'Кофе, чай, десерты, выпечка и завтраки',
      slug = 'coffee-shop',
      banner_url = '/catalogg/assets/template-coffee-shop/hero.webp',
      is_template = true,
      template_name = 'coffee-shop',
      business_type = 'coffee_shop',
      template_type = 'coffee_shop',
      seo = jsonb_build_object(
        'title', 'Кофейня WayYaam — готовый шаблон',
        'description', 'Редактируемое демонстрационное меню кофейни с универсальными модификаторами напитков.'
      ),
      updated_at = now()
  where id = v_template_id;

  -- Only the dedicated template catalog is refreshed; client catalogs are never touched.
  delete from public.products where catalog_id = v_template_id;
  delete from public.categories where catalog_id = v_template_id;

  insert into public.categories (catalog_id, name, slug, description, image_url, icon, is_hidden, sort_order)
  values
    (v_template_id, 'Популярное', 'popular', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/classic-coffee.webp', 'star', false, 10),
    (v_template_id, 'Классический кофе', 'classic-coffee', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/classic-coffee.webp', 'coffee', false, 20),
    (v_template_id, 'Авторский кофе', 'signature-coffee', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/signature-coffee.webp', 'coffee', false, 30),
    (v_template_id, 'Холодный кофе', 'cold-coffee', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/cold-coffee.webp', 'cup-soda', false, 40),
    (v_template_id, 'Чай и матча', 'tea-matcha', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/tea-matcha.webp', 'leaf', false, 50),
    (v_template_id, 'Какао и шоколад', 'cocoa-chocolate', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/cocoa.webp', 'cup-soda', false, 60),
    (v_template_id, 'Урбеч', 'urbech', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/urbech.webp', 'nut', false, 70),
    (v_template_id, 'Десерты', 'desserts', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/desserts.webp', 'cake', false, 80),
    (v_template_id, 'Пончики', 'donuts', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/donuts.webp', 'donut', false, 90),
    (v_template_id, 'Выпечка', 'bakery', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/bakery.webp', 'croissant', false, 100),
    (v_template_id, 'Завтраки и перекусы', 'breakfast-snacks', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/breakfast.webp', 'sandwich', false, 110),
    (v_template_id, 'Баночные напитки', 'canned-drinks', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/canned-drinks.webp', 'can', false, 120),
    (v_template_id, 'Вода и соки', 'water-juices', '{"kind":"drink","showOnHome":true}', '/catalogg/assets/template-coffee-shop/water-juice.webp', 'glass-water', false, 130),
    (v_template_id, 'Добавки', 'additions', '{"kind":"food","showOnHome":true}', '/catalogg/assets/template-coffee-shop/additions.webp', 'plus', false, 140);

  insert into public.products (
    catalog_id, category_id, title, slug, status, price, description, ingredients,
    weight, serving, stock_count, is_unlimited, is_popular, is_new, is_promo, sort_order
  )
  select v_template_id, category.id, seed.title, seed.slug, 'active'::public.product_status,
    seed.price, seed.description, seed.ingredients, seed.weight, seed.serving,
    0, true, seed.is_popular, seed.is_new, false, seed.sort_order
  from (values
    ('classic-coffee','espresso','Эспрессо',170,'Насыщенный кофе с плотной крема.','Эспрессо','40 мл','Подаётся сразу после приготовления.',true,false,10),
    ('classic-coffee','double-espresso','Двойной эспрессо',220,'Двойная порция насыщенного эспрессо.','Эспрессо','80 мл','Для выраженного кофейного вкуса.',false,false,20),
    ('classic-coffee','americano','Американо',190,'Эспрессо с горячей водой, мягкий и ароматный.','Эспрессо, вода','200 мл','Выберите объём и температуру.',true,false,30),
    ('classic-coffee','cappuccino','Капучино',250,'Эспрессо, молоко и шелковистая молочная пена.','Эспрессо, молоко','200 мл','Можно выбрать молоко, сироп и объём.',true,false,40),
    ('classic-coffee','latte','Латте',280,'Мягкий слоистый кофе с большим количеством молока.','Эспрессо, молоко','300 мл','Можно выбрать молоко, сироп и объём.',true,false,50),
    ('classic-coffee','flat-white','Флэт уайт',270,'Двойной эспрессо с тонким слоем молочной пены.','Эспрессо, молоко','200 мл','Насыщеннее классического капучино.',false,false,60),
    ('classic-coffee','raf','Раф',310,'Сливочный кофе с ванильной нотой.','Эспрессо, сливки, ванильный сахар','300 мл','Взбит до однородной кремовой текстуры.',true,false,70),
    ('classic-coffee','mochaccino','Моккачино',320,'Кофе с молоком и натуральным шоколадом.','Эспрессо, молоко, шоколад','300 мл','Можно добавить сироп или сливки.',false,false,80),
    ('classic-coffee','latte-macchiato','Латте макиато',300,'Слоистый молочный напиток с порцией эспрессо.','Эспрессо, молоко','300 мл','Подаётся в высоком стакане.',false,true,90),
    ('signature-coffee','banana-raf','Банановый раф',350,'Кремовый раф с натуральной банановой нотой.','Эспрессо, сливки, банан','300 мл','Нежный сладкий вкус.',true,true,100),
    ('signature-coffee','pistachio-raf','Фисташковый раф',370,'Раф с мягким фисташковым вкусом.','Эспрессо, сливки, фисташка','300 мл','Можно выбрать объём.',true,false,110),
    ('signature-coffee','vanilla-raf','Ванильный раф',340,'Сливочный кофе с натуральной ванилью.','Эспрессо, сливки, ваниль','300 мл','Мягкий десертный напиток.',false,false,120),
    ('signature-coffee','caramel-latte','Карамельный латте',330,'Латте с карамельным сиропом.','Эспрессо, молоко, карамель','300 мл','Сироп можно заменить.',true,false,130),
    ('signature-coffee','salted-caramel-latte','Латте «Солёная карамель»',350,'Молочный кофе с балансом карамели и морской соли.','Эспрессо, молоко, солёная карамель','300 мл','Авторский сладко-солёный вкус.',true,true,140),
    ('signature-coffee','coconut-latte','Кокосовый латте',350,'Латте с мягкой кокосовой нотой.','Эспрессо, молоко, кокос','300 мл','Можно выбрать растительное молоко.',false,false,150),
    ('signature-coffee','hazelnut-latte','Ореховый латте',350,'Мягкий латте с ароматом фундука.','Эспрессо, молоко, фундук','300 мл','Можно выбрать сироп.',false,false,160),
    ('signature-coffee','chocolate-hazelnut-mocha','Мокка «Шоколадный орех»',380,'Насыщенный мокка с шоколадом и фундуком.','Эспрессо, молоко, шоколад, фундук','300 мл','Десертный кофейный напиток.',true,false,170),
    ('cold-coffee','iced-latte','Айс-латте',310,'Охлаждённый слоистый кофе с молоком и льдом.','Эспрессо, молоко, лёд','400 мл','Подаётся холодным.',true,false,180),
    ('cold-coffee','iced-americano','Айс-американо',240,'Эспрессо, холодная вода и лёд.','Эспрессо, вода, лёд','300 мл','Освежающий крепкий кофе.',false,false,190),
    ('cold-coffee','iced-cappuccino','Айс-капучино',310,'Холодный капучино с воздушной пеной.','Эспрессо, молоко, лёд','400 мл','Можно выбрать молоко.',false,true,200),
    ('cold-coffee','cold-brew','Колд брю',290,'Кофе холодного настаивания с мягким вкусом.','Кофе, вода','300 мл','Настаивается не менее 12 часов.',true,false,210),
    ('cold-coffee','frappe','Фраппе',330,'Взбитый холодный кофе со льдом.','Кофе, молоко, лёд','400 мл','Густая прохладная текстура.',false,false,220),
    ('cold-coffee','caramel-frappe','Карамельный фраппе',360,'Холодный взбитый кофе с карамелью.','Кофе, молоко, лёд, карамель','400 мл','Сладкий освежающий напиток.',true,false,230),
    ('cold-coffee','chocolate-frappe','Шоколадный фраппе',370,'Холодный кофе с шоколадом и льдом.','Кофе, молоко, лёд, шоколад','400 мл','Можно добавить сливки.',false,false,240),
    ('tea-matcha','matcha-latte','Матча-латте',320,'Японская матча с тёплым молоком.','Матча, молоко','300 мл','Можно выбрать растительное молоко.',true,false,250),
    ('tea-matcha','iced-matcha','Айс-матча',340,'Матча с холодным молоком и льдом.','Матча, молоко, лёд','400 мл','Свежий травянистый вкус.',true,true,260),
    ('tea-matcha','black-tea','Чёрный чай',180,'Листовой чёрный чай.','Чёрный чай, вода','400 мл','Сахар и лимон по желанию.',false,false,270),
    ('tea-matcha','green-tea','Зелёный чай',180,'Мягкий листовой зелёный чай.','Зелёный чай, вода','400 мл','Не содержит добавок.',false,false,280),
    ('tea-matcha','sea-buckthorn-tea','Облепиховый чай',290,'Согревающий чай с облепихой и мёдом.','Облепиха, чай, мёд','500 мл','Яркий ягодный вкус.',true,false,290),
    ('tea-matcha','raspberry-tea','Малиновый чай',290,'Ароматный чай с малиной.','Малина, чай, мёд','500 мл','Подаётся горячим.',false,false,300),
    ('tea-matcha','moroccan-tea','Марокканский чай',300,'Зелёный чай с мятой, цитрусом и специями.','Зелёный чай, мята, цитрус, специи','500 мл','Освежающий пряный аромат.',true,false,310),
    ('cocoa-chocolate','cocoa','Какао',260,'Натуральный какао с молоком.','Какао, молоко','300 мл','Можно выбрать молоко и сахар.',true,false,320),
    ('cocoa-chocolate','hot-chocolate','Горячий шоколад',310,'Густой напиток из натурального шоколада.','Шоколад, молоко','250 мл','Подаётся горячим.',true,false,330),
    ('cocoa-chocolate','marshmallow-cocoa','Какао с маршмеллоу',300,'Молочный какао с воздушным маршмеллоу.','Какао, молоко, маршмеллоу','300 мл','Десертный напиток.',false,true,340),
    ('urbech','almond-urbech','Урбеч из миндаля',260,'Натуральная паста из перетёртого миндаля.','Миндаль','90 г','Без сахара и добавок.',false,false,350),
    ('urbech','hazelnut-urbech','Урбеч из фундука',270,'Паста из обжаренного фундука.','Фундук','90 г','Насыщенный ореховый вкус.',false,false,360),
    ('urbech','peanut-urbech','Урбеч из арахиса',210,'Натуральная арахисовая паста.','Арахис','90 г','Подходит к завтраку.',true,false,370),
    ('urbech','flax-urbech','Урбеч из семян льна',220,'Паста из семян льна холодного помола.','Семена льна','90 г','Источник натуральных масел.',false,false,380),
    ('urbech','honey-urbech','Урбеч с мёдом',250,'Ореховый урбеч с натуральным мёдом.','Орехи, мёд','90 г','Мягкий сладкий вкус.',true,false,390),
    ('urbech','urbech-selection','Ассорти урбеча',490,'Три вида урбеча для дегустации.','Миндаль, фундук, арахис','180 г','Подаётся с хлебцами.',false,true,400),
    ('desserts','meringue-roll','Меренговый рулет',330,'Воздушная меренга со сливочным кремом и ягодами.','Яичный белок, сливки, ягоды','140 г','Одна порция.',true,false,410),
    ('desserts','red-velvet','Красный бархат',350,'Бисквитный торт с нежным сливочным кремом.','Бисквит, какао, сливочный крем','150 г','Один аккуратный кусок.',true,false,420),
    ('desserts','medovik','Медовик',320,'Тонкие медовые коржи со сметанным кремом.','Мёд, мука, сметанный крем','150 г','Классический домашний вкус.',true,false,430),
    ('desserts','classic-cheesecake','Чизкейк классический',360,'Нежный сливочный чизкейк на песочной основе.','Сливочный сыр, сливки, печенье','150 г','Подаётся охлаждённым.',true,false,440),
    ('desserts','san-sebastian-cheesecake','Чизкейк «Сан-Себастьян»',390,'Запечённый чизкейк с карамельной корочкой.','Сливочный сыр, сливки, яйцо','160 г','Кремовая середина.',true,true,450),
    ('desserts','carrot-cake','Морковный торт',340,'Пряный морковный бисквит со сливочным кремом.','Морковь, орехи, корица, крем','150 г','Натуральная влажная текстура.',false,false,460),
    ('desserts','tiramisu','Тирамису',370,'Итальянский десерт с кофе и маскарпоне.','Савоярди, кофе, маскарпоне, какао','150 г','Подаётся охлаждённым.',true,false,470),
    ('desserts','chocolate-brownie','Шоколадный брауни',290,'Плотный шоколадный десерт с влажной серединой.','Шоколад, какао, мука, яйцо','120 г','Можно подогреть.',true,false,480),
    ('desserts','trifle','Трайфл',330,'Порционный десерт с бисквитом, кремом и ягодами.','Бисквит, сливочный крем, ягоды','180 г','В прозрачном стакане.',false,true,490),
    ('desserts','macaron','Макарон',140,'Миндальное пирожное с нежной начинкой.','Миндальная мука, белок, крем','35 г','Один вкус на выбор.',false,false,500),
    ('donuts','chocolate-donut','Пончик с шоколадом',210,'Мягкий пончик с шоколадной глазурью.','Мука, молоко, шоколад','90 г','Свежая выпечка.',true,false,510),
    ('donuts','caramel-donut','Пончик с карамелью',210,'Пончик с карамельной начинкой.','Мука, молоко, карамель','90 г','Мягкий и воздушный.',false,false,520),
    ('donuts','strawberry-donut','Пончик с клубникой',220,'Пончик с клубничной начинкой и глазурью.','Мука, молоко, клубника','90 г','Ягодный вкус.',true,true,530),
    ('donuts','vanilla-cream-donut','Пончик с ванильным кремом',220,'Пончик с нежным ванильным кремом.','Мука, молоко, ванильный крем','95 г','Одна порция.',false,false,540),
    ('donuts','donut-selection','Ассорти пончиков',790,'Набор из четырёх пончиков с разными вкусами.','Пончики с начинками','380 г','Удобно для компании.',true,false,550),
    ('bakery','classic-croissant','Круассан классический',190,'Слоёный круассан на сливочном масле.','Мука, сливочное масло, молоко','80 г','Хрустящая корочка.',true,false,560),
    ('bakery','chocolate-croissant','Круассан с шоколадом',240,'Слоёный круассан с шоколадной начинкой.','Мука, сливочное масло, шоколад','95 г','Можно подогреть.',true,false,570),
    ('bakery','almond-croissant','Круассан с миндалём',270,'Круассан с миндальным кремом и лепестками.','Мука, масло, миндаль','105 г','Насыщенный ореховый вкус.',false,true,580),
    ('bakery','cinnabon','Синнабон',260,'Мягкая булочка с корицей и сливочной глазурью.','Мука, корица, сливочный крем','130 г','Подаётся тёплым.',true,false,590),
    ('bakery','chocolate-muffin','Маффин шоколадный',210,'Воздушный маффин с кусочками шоколада.','Мука, какао, шоколад','100 г','Одна порция.',false,false,600),
    ('bakery','vanilla-muffin','Маффин ванильный',200,'Нежный ванильный маффин.','Мука, ваниль, молоко','100 г','Свежая выпечка.',false,false,610),
    ('bakery','chocolate-cookie','Печенье с шоколадом',150,'Мягкое печенье с кусочками шоколада.','Мука, масло, шоколад','70 г','Одна штука.',true,false,620),
    ('breakfast-snacks','syrniki','Сырники',390,'Творожные сырники со сметаной и ягодами.','Творог, яйцо, мука, ягоды','240 г','Подаются тёплыми.',true,false,630),
    ('breakfast-snacks','oatmeal','Овсяная каша',280,'Кремовая овсяная каша с ягодами.','Овсяные хлопья, молоко, ягоды','300 г','Можно выбрать молоко.',false,false,640),
    ('breakfast-snacks','granola-yogurt','Гранола с йогуртом',330,'Хрустящая гранола, йогурт и свежие ягоды.','Гранола, йогурт, ягоды','250 г','Лёгкий завтрак.',true,true,650),
    ('breakfast-snacks','croissant-sandwich','Круассан-сэндвич',390,'Круассан с сыром, яйцом и свежими овощами.','Круассан, яйцо, сыр, овощи','220 г','Подаётся тёплым.',true,false,660),
    ('breakfast-snacks','chicken-sandwich','Сэндвич с курицей',370,'Сэндвич с курицей, салатом и мягким соусом.','Хлеб, курица, салат, соус','230 г','Удобный перекус.',false,false,670),
    ('breakfast-snacks','turkey-sandwich','Сэндвич с индейкой',390,'Сэндвич с индейкой, сыром и овощами.','Хлеб, индейка, сыр, овощи','230 г','Подаётся охлаждённым или тёплым.',false,false,680),
    ('canned-drinks','cola-can','Кола',160,'Охлаждённый газированный напиток без бренда.','Вода, сахар, натуральный ароматизатор','330 мл','Нейтральная упаковка.',false,false,690),
    ('canned-drinks','orange-soda','Апельсиновый газированный напиток',160,'Освежающий напиток с апельсиновым вкусом.','Вода, сахар, апельсиновый ароматизатор','330 мл','Нейтральная упаковка.',false,false,700),
    ('canned-drinks','lemon-lime-soda','Лимонно-лаймовый напиток',160,'Газированный напиток с лимоном и лаймом.','Вода, сахар, цитрусовый ароматизатор','330 мл','Без логотипов.',false,false,710),
    ('canned-drinks','lemon-iced-tea','Холодный чай с лимоном',170,'Чёрный чай с лимоном, охлаждённый.','Чай, вода, лимон','330 мл','Нейтральная банка.',false,false,720),
    ('canned-drinks','peach-iced-tea','Холодный чай с персиком',170,'Холодный чай с мягким вкусом персика.','Чай, вода, персик','330 мл','Нейтральная банка.',false,false,730),
    ('canned-drinks','energy-drink','Энергетический напиток',220,'Охлаждённый тонизирующий напиток.','Газированный напиток, кофеин','330 мл','Без фирменной упаковки.',false,false,740),
    ('water-juices','mineral-water','Минеральная вода',130,'Натуральная минеральная вода.','Минеральная вода','500 мл','Охлаждённая.',false,false,750),
    ('water-juices','still-water','Вода без газа',110,'Чистая питьевая вода без газа.','Вода','500 мл','Охлаждённая.',false,false,760),
    ('water-juices','orange-juice','Апельсиновый сок',190,'Сок с натуральным апельсиновым вкусом.','Апельсиновый сок','250 мл','Подаётся охлаждённым.',false,false,770),
    ('water-juices','apple-juice','Яблочный сок',180,'Светлый яблочный сок.','Яблочный сок','250 мл','Подаётся охлаждённым.',false,false,780),
    ('additions','extra-espresso-shot','Дополнительный шот эспрессо',90,'Дополнительная порция эспрессо.','Эспрессо','40 мл','Добавка к напитку.',false,false,790),
    ('additions','plant-milk','Растительное молоко',70,'Порция растительного молока на выбор.','Растительное молоко','100 мл','Добавка к напитку.',false,false,800),
    ('additions','coffee-syrup','Сироп для напитка',50,'Порция сиропа на выбор.','Сироп','20 мл','Добавка к напитку.',false,false,810)
  ) as seed(category_slug, slug, title, price, description, ingredients, weight, serving, is_popular, is_new, sort_order)
  join public.categories category on category.catalog_id = v_template_id and category.slug = seed.category_slug;

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select v_template_id, product.id,
    '/catalogg/assets/template-coffee-shop/products/' || category.slug || '/' || product.slug || '.webp',
    product.title || ' — демонстрационное изображение', 0
  from public.products product
  join public.categories category on category.id = product.category_id
  where product.catalog_id = v_template_id;

  insert into public.product_option_groups (
    catalog_id, product_id, name, required, min_selected, max_selected, sort_order
  )
  select v_template_id, product.id, group_seed.name, group_seed.required,
    group_seed.min_selected, group_seed.max_selected, group_seed.sort_order
  from public.products product
  join public.categories category on category.id = product.category_id
  cross join (values
    ('Объём', true, 1, 1, 10),
    ('Температура', false, 0, 1, 20),
    ('Молоко', false, 0, 1, 30),
    ('Сироп', false, 0, 1, 40),
    ('Дополнительно', false, 0, 6, 50),
    ('Сахар', false, 0, 1, 60)
  ) as group_seed(name, required, min_selected, max_selected, sort_order)
  where product.catalog_id = v_template_id
    and category.slug in ('classic-coffee','signature-coffee','cold-coffee','tea-matcha','cocoa-chocolate');

  insert into public.product_options (catalog_id, group_id, name, price_delta, is_default, sort_order)
  select v_template_id, option_group.id, option_seed.name, option_seed.price_delta,
    option_seed.is_default, option_seed.sort_order
  from public.product_option_groups option_group
  cross join lateral (
    select * from (values
      ('Объём','200 мл',0,true,10), ('Объём','300 мл',50,false,20), ('Объём','400 мл',100,false,30),
      ('Температура','Горячий',0,true,10), ('Температура','Тёплый',0,false,20), ('Температура','Холодный',0,false,30),
      ('Молоко','Обычное',0,true,10), ('Молоко','Безлактозное',50,false,20), ('Молоко','Кокосовое',70,false,30), ('Молоко','Миндальное',70,false,40), ('Молоко','Овсяное',70,false,50),
      ('Сироп','Без сиропа',0,true,10), ('Сироп','Карамель',50,false,20), ('Сироп','Ваниль',50,false,30), ('Сироп','Фундук',50,false,40), ('Сироп','Кокос',50,false,50), ('Сироп','Шоколад',50,false,60), ('Сироп','Банан',50,false,70), ('Сироп','Фисташка',60,false,80),
      ('Дополнительно','Дополнительный шот эспрессо',90,false,10), ('Дополнительно','Взбитые сливки',60,false,20), ('Дополнительно','Маршмеллоу',50,false,30), ('Дополнительно','Корица',0,false,40), ('Дополнительно','Какао',0,false,50), ('Дополнительно','Лёд',0,false,60),
      ('Сахар','Без сахара',0,true,10), ('Сахар','1 порция',0,false,20), ('Сахар','2 порции',0,false,30), ('Сахар','3 порции',0,false,40)
    ) as values_list(group_name, name, price_delta, is_default, sort_order)
    where values_list.group_name = option_group.name
  ) option_seed
  where option_group.catalog_id = v_template_id;

  insert into public.catalog_theme_settings (catalog_id, settings, updated_at)
  values (v_template_id, jsonb_build_object(
    'background_type','color','background_color','#fffaf3','background_gradient_from','#fffaf3',
    'background_gradient_to','#f5eadc','background_image_url','','card_color','#fffdf9',
    'product_card_color','#fffdf9','product_card_text_color','#2d2118','settings_card_color','#fffdf9',
    'settings_card_text_color','#2d2118','cart_panel_color','#fffdf9','cart_panel_text_color','#2d2118',
    'card_radius',18,'card_shadow','0 14px 34px rgba(71, 45, 27, 0.10)','text_primary','#2d2118',
    'text_secondary','#796a5f','product_title_color','#2d2118','category_title_color','#2d2118',
    'accent_color','#e56b1f','accent_secondary','#f4ad63','button_style','filled','button_radius',14,'header_style','compact'
  ), now())
  on conflict (catalog_id) do update set settings = excluded.settings, updated_at = now();
end;
$$;

-- Resolve both legacy single-choice prices and coffee modifier surcharges on the server.
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
begin
  if new.product_id is not null then
    settings_product_id := new.product_id::text;
  else
    settings_product_id := nullif(trim(new.options #>> '{0,product_id}'), '');
  end if;

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

  new.unit_price := coalesce(resolved_variant_price, new.unit_price) + modifier_delta;
  new.line_total := new.unit_price * new.quantity;
  return new;
end;
$$;

revoke execute on function public.apply_catalog_variant_price_to_order_item() from public, anon, authenticated;
