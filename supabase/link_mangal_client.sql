-- Link the existing legacy "Мангал" account to the platform-admin clients list.
-- Safe to run multiple times in Supabase SQL Editor.

do $$
declare
  v_owner_user_id uuid := '209613ef-7f87-4c9a-a922-230d7949de9c';
  v_owner_email text := 'mangal.restourant@outlook.com';
  v_company_name text := 'Мангал';
  v_owner_name text := 'Мухаммад Алиев';
  v_phone text := '89228928928';
  v_catalog_slug text := 'mangal';
  v_template_version_id uuid;
  v_catalog_id uuid;
  v_client_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_owner_user_id) then
    raise exception 'Auth user % (%) does not exist. Create the user first in Supabase Auth.', v_owner_email, v_owner_user_id;
  end if;

  select tv.id
    into v_template_version_id
  from public.template_versions tv
  join public.templates t on t.id = tv.template_id
  where t.key = 'restaurant-modern'
    and tv.status = 'published'
  order by tv.version desc
  limit 1;

  if v_template_version_id is null then
    raise exception 'Published restaurant-modern template version was not found.';
  end if;

  insert into public.profiles (id, email, full_name)
  values (v_owner_user_id, v_owner_email, v_owner_name)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;

  if to_regclass('public.admin_user') is not null then
    insert into public.admin_user (user_id, email)
    values (v_owner_user_id, v_owner_email)
    on conflict (user_id) do update set
      email = excluded.email;
  end if;

  insert into public.catalogs (
    template_version_id,
    slug,
    name,
    description,
    status,
    whatsapp,
    language,
    timezone,
    created_by
  )
  values (
    v_template_version_id,
    v_catalog_slug,
    v_company_name,
    'Ресторан Мангал',
    'published',
    v_phone,
    'ru',
    'Europe/Moscow',
    v_owner_user_id
  )
  on conflict (slug) do update set
    template_version_id = excluded.template_version_id,
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    whatsapp = excluded.whatsapp,
    language = excluded.language,
    timezone = excluded.timezone
  returning id into v_catalog_id;

  insert into public.catalog_members (catalog_id, user_id, role)
  values (v_catalog_id, v_owner_user_id, 'owner')
  on conflict (catalog_id, user_id) do update set
    role = excluded.role;

  insert into public.catalog_theme_settings (catalog_id, settings)
  values (v_catalog_id, '{}'::jsonb)
  on conflict (catalog_id) do nothing;

  insert into public.catalog_sections (catalog_id, key, title, sort_order)
  values
    (v_catalog_id, 'hero', 'Главная', 10),
    (v_catalog_id, 'categories', 'Категории', 20),
    (v_catalog_id, 'products', 'Все позиции', 30),
    (v_catalog_id, 'contacts', 'Контакты', 40)
  on conflict (catalog_id, key) do update set
    title = excluded.title,
    sort_order = excluded.sort_order;

  insert into public.clients (
    owner_user_id,
    catalog_id,
    company_name,
    owner_name,
    email,
    phone,
    status,
    plan_code,
    subscription_status,
    subscription_started_at,
    subscription_ends_at,
    created_by
  )
  values (
    v_owner_user_id,
    v_catalog_id,
    v_company_name,
    v_owner_name,
    v_owner_email,
    v_phone,
    'active',
    'trial',
    'trial',
    now(),
    null,
    v_owner_user_id
  )
  on conflict (catalog_id) do update set
    owner_user_id = excluded.owner_user_id,
    company_name = excluded.company_name,
    owner_name = excluded.owner_name,
    email = excluded.email,
    phone = excluded.phone,
    status = excluded.status,
    plan_code = excluded.plan_code,
    subscription_status = excluded.subscription_status
  returning id into v_client_id;

  if exists (select 1 from public.client_subscriptions where client_id = v_client_id) then
    update public.client_subscriptions
    set
      plan_code = 'trial',
      status = 'trial',
      ends_at = null
    where client_id = v_client_id;
  else
    insert into public.client_subscriptions (
      client_id,
      plan_code,
      amount,
      currency_code,
      status,
      started_at,
      ends_at,
      auto_renew,
      note
    )
    values (
      v_client_id,
      'trial',
      0,
      'RUB',
      'trial',
      now(),
      null,
      false,
      'Existing Mangal catalog linked to platform admin.'
    );
  end if;
end $$;
