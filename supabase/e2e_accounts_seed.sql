-- Idempotent non-secret data seed. Auth users must be provisioned first through
-- the Supabase Admin API. Passwords intentionally never appear in this file.
do $$
declare
  client_auth_id uuid;
  restaurant_auth_id uuid;
  driver_auth_id uuid;
  client_user_id uuid;
  driver_user_id uuid;
  catalog_id_value uuid;
  restaurant_id_value uuid;
  restaurant_client_id uuid;
  driver_id_value uuid;
  template_version_id_value uuid;
  burgers_id uuid;
  pizza_id uuid;
  drinks_id uuid;
  extras_id uuid;
begin
  select id into client_auth_id from auth.users where lower(email) = 'e2e.client@wayyaam.ru';
  select id into restaurant_auth_id from auth.users where lower(email) = 'e2e.restaurant@wayyaam.ru';
  select id into driver_auth_id from auth.users where lower(email) = 'e2e.driver@wayyaam.ru';
  if client_auth_id is null or restaurant_auth_id is null or driver_auth_id is null then
    raise exception 'e2e_auth_users_missing';
  end if;

  insert into public.profiles(id, email, full_name, is_test)
  values
    (client_auth_id, 'e2e.client@wayyaam.ru', 'WayYaam Test Client', true),
    (restaurant_auth_id, 'e2e.restaurant@wayyaam.ru', 'WayYaam Test Restaurant', true),
    (driver_auth_id, 'e2e.driver@wayyaam.ru', 'WayYaam Test Driver', true)
  on conflict (id) do update set
    email = excluded.email, full_name = excluded.full_name, is_test = true, updated_at = now();

  select id into client_user_id from public.users where auth_user_id = client_auth_id order by created_at limit 1;
  if client_user_id is null then
    insert into public.users(auth_user_id, name, phone, role, email, is_test)
    values(client_auth_id, 'WayYaam Test Client', '+7 900 000-00-01', 'client', 'e2e.client@wayyaam.ru', true)
    returning id into client_user_id;
  else
    update public.users set name = 'WayYaam Test Client', phone = '+7 900 000-00-01', role = 'client',
      email = 'e2e.client@wayyaam.ru', is_test = true where id = client_user_id;
  end if;

  insert into public.client_accounts(name, phone, phone_normalized, password_hash, auth_user_id, is_test)
  values(
    'WayYaam Test Client', '+79000000001', '79000000001',
    extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
    client_auth_id, true
  )
  on conflict (phone_normalized) do update set
    name = excluded.name, phone = excluded.phone, auth_user_id = excluded.auth_user_id, is_test = true,
    updated_at = now();

  insert into public.client_profiles(user_id)
  values(client_user_id) on conflict (user_id) do nothing;

  if exists (
    select 1 from public.client_addresses
    where user_id = client_user_id and title = 'Тестовый адрес'
  ) then
    update public.client_addresses set address_line = 'Тестовая доставка WayYaam',
      lat = 43.3200000, lng = 45.7000000, is_default = true, is_test = true, updated_at = now()
    where user_id = client_user_id and title = 'Тестовый адрес';
  else
    insert into public.client_addresses(user_id, title, address_line, lat, lng, is_default, is_test)
    values(client_user_id, 'Тестовый адрес', 'Тестовая доставка WayYaam', 43.3200000, 45.7000000, true, true);
  end if;

  select catalog.template_version_id into template_version_id_value
  from public.catalogs catalog
  where catalog.business_type = 'restaurant'
  order by catalog.is_template desc, catalog.created_at
  limit 1;
  if template_version_id_value is null then raise exception 'restaurant_template_version_missing'; end if;

  insert into public.catalogs(
    template_version_id, slug, name, description, status, address, created_by,
    business_type, template_type, is_template, is_test
  ) values (
    template_version_id_value, 'wayyaam-test-restaurant', 'WayYaam Test Restaurant',
    'Служебный ресторан WayYaam для автоматического тестирования заказов.',
    'published', 'Тестовая зона WayYaam', restaurant_auth_id,
    'restaurant', 'restaurant', false, true
  )
  on conflict (slug) do update set
    name = excluded.name, description = excluded.description, status = 'published',
    address = excluded.address, created_by = restaurant_auth_id, is_template = false, is_test = true,
    updated_at = now()
  returning id into catalog_id_value;

  insert into public.catalog_members(catalog_id, user_id, role, can_accept_legal_documents)
  values(catalog_id_value, restaurant_auth_id, 'owner', true)
  on conflict (catalog_id, user_id) do update set role = 'owner', can_accept_legal_documents = true;

  insert into public.clients(
    owner_user_id, catalog_id, company_name, owner_name, email, phone, status,
    plan_code, subscription_status, first_login, consent_given, admin_consent_confirmed,
    primary_city, service_settlements, business_type, template_type,
    legal_activation_status, activated_at, demo_mode, is_test
  ) values (
    restaurant_auth_id, catalog_id_value, 'WayYaam Test Restaurant', 'WayYaam Test Restaurant',
    'e2e.restaurant@wayyaam.ru', '+7 900 000-00-02', 'active', 'e2e-full', 'active',
    false, true, true, 'Грозный', array['Грозный'], 'restaurant', 'restaurant',
    'active', now(), false, true
  )
  on conflict (email) do update set
    owner_user_id = restaurant_auth_id, catalog_id = catalog_id_value,
    company_name = excluded.company_name, owner_name = excluded.owner_name, phone = excluded.phone,
    status = 'active', subscription_status = 'active', legal_activation_status = 'active',
    activated_at = coalesce(public.clients.activated_at, now()), demo_mode = false, is_test = true,
    updated_at = now()
  returning id into restaurant_client_id;

  insert into public.restaurants(
    catalog_id, name, slug, description, delivery_provider,
    allow_dine_in, allow_pickup, allow_delivery, is_active, address_line, lat, lng, is_test
  ) values (
    catalog_id_value, 'WayYaam Test Restaurant', 'wayyaam-test-restaurant',
    'Служебный ресторан WayYaam для автоматического тестирования заказов.', 'platform',
    true, true, true, true, 'Тестовая зона WayYaam', 43.3179000, 45.6945000, true
  )
  on conflict (slug) do update set
    catalog_id = catalog_id_value, name = excluded.name, description = excluded.description,
    allow_dine_in = true, allow_pickup = true, allow_delivery = true, is_active = true,
    address_line = excluded.address_line, lat = excluded.lat, lng = excluded.lng, is_test = true,
    updated_at = now()
  returning id into restaurant_id_value;

  insert into public.restaurant_delivery_settings(
    catalog_id, enable_orders, enable_delivery, enable_pickup, enable_hall_orders,
    use_own_courier, use_platform_drivers, own_courier_wait_minutes,
    fallback_to_platform_drivers, qr_required, minimum_order_amount, free_delivery_from,
    default_preparation_minutes, delivery_radius_km, delivery_area_mode,
    primary_city, service_settlements
  ) values (
    catalog_id_value, true, true, true, true,
    true, true, 1, true, true, 0, 0, 5, 20, 'hybrid', 'Грозный', array['Грозный']
  )
  on conflict (catalog_id) do update set
    enable_orders = true, enable_delivery = true, enable_pickup = true, enable_hall_orders = true,
    use_own_courier = true, use_platform_drivers = true, fallback_to_platform_drivers = true,
    qr_required = true, delivery_area_mode = 'hybrid', primary_city = 'Грозный',
    service_settlements = array['Грозный'], updated_at = now();

  insert into public.restaurant_modules(
    catalog_id, package_code, pos_enabled, warehouse_enabled, recipes_enabled,
    finance_enabled, promotions_enabled, loyalty_enabled,
    max_cashiers, max_devices, max_locations, max_warehouses
  ) values (
    catalog_id_value, 'full', true, true, true, true, true, true, 10, 20, 5, 5
  )
  on conflict (catalog_id) do update set
    package_code = 'full', pos_enabled = true, warehouse_enabled = true, recipes_enabled = true,
    finance_enabled = true, promotions_enabled = true, loyalty_enabled = true,
    max_cashiers = 10, max_devices = 20, max_locations = 5, max_warehouses = 5,
    updated_at = now();

  insert into public.restaurant_payments(restaurant_id, enable_transfer, allow_cash, require_confirmation)
  values(catalog_id_value, false, true, false)
  on conflict (restaurant_id) do update set allow_cash = true, updated_at = now();

  insert into public.categories(catalog_id, name, slug, sort_order)
  values
    (catalog_id_value, 'Бургеры', 'burgers', 10),
    (catalog_id_value, 'Пицца', 'pizza', 20),
    (catalog_id_value, 'Напитки', 'drinks', 30),
    (catalog_id_value, 'Дополнительно', 'extras', 40)
  on conflict (catalog_id, slug) do update set name = excluded.name, is_hidden = false, sort_order = excluded.sort_order;
  select id into burgers_id from public.categories where catalog_id = catalog_id_value and slug = 'burgers';
  select id into pizza_id from public.categories where catalog_id = catalog_id_value and slug = 'pizza';
  select id into drinks_id from public.categories where catalog_id = catalog_id_value and slug = 'drinks';
  select id into extras_id from public.categories where catalog_id = catalog_id_value and slug = 'extras';

  insert into public.products(
    catalog_id, category_id, title, slug, status, price, description, ingredients,
    weight, serving, stock_count, is_unlimited, sort_order
  ) values
    (catalog_id_value, burgers_id, 'Чизбургер', 'cheeseburger', 'active', 350,
      'Булочка, говяжья котлета, сыр, салат, томат, фирменный соус',
      'Булочка, говяжья котлета, сыр, салат, томат, фирменный соус', '300 г', '', 100, true, 10),
    (catalog_id_value, burgers_id, 'Двойной бургер', 'double-burger', 'active', 490,
      'Булочка, две говяжьи котлеты, двойной сыр, салат, томат, соус',
      'Булочка, две говяжьи котлеты, двойной сыр, салат, томат, соус', '420 г', '', 100, true, 20),
    (catalog_id_value, pizza_id, 'Пицца Пепперони', 'pepperoni-pizza', 'active', 590,
      'Тесто, томатный соус, сыр моцарелла, пепперони',
      'Тесто, томатный соус, сыр моцарелла, пепперони', '550 г', '', 100, true, 30),
    (catalog_id_value, pizza_id, 'Пицца Маргарита', 'margherita-pizza', 'active', 490,
      'Тесто, томатный соус, моцарелла, томаты',
      'Тесто, томатный соус, моцарелла, томаты', '500 г', '', 100, true, 40),
    (catalog_id_value, drinks_id, 'Coca-Cola', 'coca-cola', 'active', 150,
      'Coca-Cola 0,5 л', '', '', '0,5 л', 100, true, 50),
    (catalog_id_value, drinks_id, 'Вода', 'water', 'active', 100,
      'Вода 0,5 л', '', '', '0,5 л', 100, true, 60),
    (catalog_id_value, extras_id, 'Сырный соус', 'cheese-sauce', 'active', 70,
      'Сырный соус', '', '', '', 100, true, 70),
    (catalog_id_value, extras_id, 'Картофель фри', 'french-fries', 'active', 190,
      'Картофель фри', '', '150 г', '', 100, true, 80)
  on conflict (catalog_id, slug) do update set
    category_id = excluded.category_id, title = excluded.title, status = 'active', price = excluded.price,
    description = excluded.description, ingredients = excluded.ingredients, weight = excluded.weight,
    serving = excluded.serving, stock_count = 100, is_unlimited = true, sort_order = excluded.sort_order,
    updated_at = now();

  select id into driver_user_id from public.users where auth_user_id = driver_auth_id order by created_at limit 1;
  if driver_user_id is null then
    insert into public.users(auth_user_id, name, phone, role, email, is_test)
    values(driver_auth_id, 'WayYaam Test Driver', '+7 900 000-00-03', 'driver', 'e2e.driver@wayyaam.ru', true)
    returning id into driver_user_id;
  else
    update public.users set name = 'WayYaam Test Driver', phone = '+7 900 000-00-03', role = 'driver',
      email = 'e2e.driver@wayyaam.ru', is_test = true where id = driver_user_id;
  end if;

  select id into driver_id_value from public.drivers where user_id = driver_user_id order by created_at limit 1;
  if driver_id_value is null then
    insert into public.drivers(
      user_id, name, phone, email, vehicle_info, car_number, is_active, is_online,
      status, city_name, service_settlements, is_premium, max_active_deliveries, is_test
    ) values (
      driver_user_id, 'WayYaam Test Driver', '+7 900 000-00-03', 'e2e.driver@wayyaam.ru',
      'WayYaam E2E Vehicle', 'E2E 2026', true, true, 'online', 'Грозный', array['Грозный'], true, 10, true
    ) returning id into driver_id_value;
  else
    update public.drivers set name = 'WayYaam Test Driver', phone = '+7 900 000-00-03',
      email = 'e2e.driver@wayyaam.ru', is_active = true, is_online = true, status = 'online',
      city_name = 'Грозный', service_settlements = array['Грозный'], is_premium = true,
      max_active_deliveries = 10, is_test = true, updated_at = now()
    where id = driver_id_value;
  end if;

  insert into public.restaurant_couriers(
    restaurant_id, driver_id, is_active, is_primary, priority, courier_type
  ) values(restaurant_id_value, driver_id_value, true, true, 1, 'independent')
  on conflict (restaurant_id, driver_id) do update set
    is_active = true, is_primary = true, priority = 1, courier_type = 'independent';

  insert into public.restaurant_tariffs(
    client_id, name, restaurant_commission_amount, driver_commission_amount,
    commission_rules, count_test_orders, version, status, published_at
  ) values(
    restaurant_client_id, 'WayYaam E2E 30/30', 30, 30,
    'Тестовая формула повторяет production, проводки изолированы признаком is_test.',
    true, 'e2e-v1', 'published', now()
  )
  on conflict (client_id, version) do update set
    restaurant_commission_amount = 30, driver_commission_amount = 30,
    count_test_orders = true, status = 'published', published_at = coalesce(public.restaurant_tariffs.published_at, now()),
    updated_at = now();
end;
$$;
