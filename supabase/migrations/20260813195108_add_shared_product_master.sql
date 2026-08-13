-- Shared product master.
--
-- A master product describes a physical product once for the whole platform.
-- public.products remains the catalog-owned offer and keeps price, stock and
-- publication state isolated per merchant.

create schema if not exists private;

create or replace function public.normalize_global_barcode(input_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  compact_value text := regexp_replace(trim(coalesce(input_value, '')), '[[:space:]-]+', '', 'g');
begin
  if compact_value !~ '^[0-9]+$' or length(compact_value) not in (8, 12, 13, 14) then
    return null;
  end if;

  return lpad(compact_value, 14, '0');
end;
$$;

create or replace function public.is_valid_global_barcode(input_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  compact_value text := regexp_replace(trim(coalesce(input_value, '')), '[[:space:]-]+', '', 'g');
  checksum_sum integer := 0;
  position integer;
  check_digit integer;
begin
  if compact_value !~ '^[0-9]+$' or length(compact_value) not in (8, 12, 13, 14) then
    return false;
  end if;

  check_digit := substring(compact_value from length(compact_value) for 1)::integer;
  for position in 1..length(compact_value) - 1 loop
    checksum_sum := checksum_sum
      + substring(compact_value from position for 1)::integer
      * case when (length(compact_value) - position) % 2 = 1 then 3 else 1 end;
  end loop;

  return ((10 - (checksum_sum % 10)) % 10) = check_digit;
end;
$$;

create table if not exists public.master_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.master_categories(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  source_type text not null default 'platform'
    check (source_type in ('merchant', 'platform', 'import')),
  created_by_catalog_id uuid references public.catalogs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.master_categories (id, name, slug, description, status)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Без категории',
  'uncategorized',
  'Временная группа для новых товаров до модерации.',
  'active'
)
on conflict do nothing;

create table if not exists public.master_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.master_categories(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  brand text,
  manufacturer text,
  description text not null default '',
  ingredients text not null default '',
  allergens text[] not null default '{}'::text[],
  country_of_origin text,
  net_content_value numeric(12, 3) check (net_content_value is null or net_content_value > 0),
  net_content_unit text check (
    net_content_unit is null
    or net_content_unit in ('g', 'kg', 'ml', 'l', 'piece')
  ),
  shelf_life text,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'archived')),
  version integer not null default 1 check (version > 0),
  source_type text not null default 'merchant'
    check (source_type in ('merchant', 'platform', 'import')),
  created_by_catalog_id uuid references public.catalogs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_categories_active_name_unique_idx
  on public.master_categories(lower(name))
  where status = 'active';

create table if not exists public.master_product_identifiers (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_products(id) on delete cascade,
  kind text not null default 'gtin' check (kind = 'gtin'),
  display_value text not null check (length(trim(display_value)) > 0),
  normalized_value text not null check (normalized_value ~ '^[0-9]{14}$'),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists master_product_identifiers_normalized_unique_idx
  on public.master_product_identifiers(normalized_value);

create unique index if not exists master_product_identifiers_primary_unique_idx
  on public.master_product_identifiers(master_product_id)
  where is_primary;

create index if not exists master_product_identifiers_product_idx
  on public.master_product_identifiers(master_product_id);

create table if not exists public.master_product_media (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_products(id) on delete cascade,
  role text not null default 'front'
    check (role in ('front', 'back', 'nutrition', 'other')),
  url text not null check (length(trim(url)) > 0),
  storage_path text,
  alt text not null default '',
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  quality_score numeric(5, 4) check (
    quality_score is null or (quality_score >= 0 and quality_score <= 1)
  ),
  processing_status text not null default 'ready'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'verified', 'rejected')),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_by_catalog_id uuid references public.catalogs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists master_product_media_product_sort_idx
  on public.master_product_media(master_product_id, is_primary desc, sort_order, created_at);

create unique index if not exists master_product_media_primary_unique_idx
  on public.master_product_media(master_product_id)
  where is_primary and moderation_status <> 'rejected';

create table if not exists public.product_contributions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  master_product_id uuid references public.master_products(id) on delete set null,
  contribution_type text not null
    check (contribution_type in ('new_product', 'correction', 'new_media')),
  proposed_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(proposed_data) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  review_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists master_products_category_status_title_idx
  on public.master_products(category_id, status, title);

create index if not exists master_products_status_updated_idx
  on public.master_products(status, updated_at desc);

create index if not exists product_contributions_catalog_status_created_idx
  on public.product_contributions(catalog_id, status, created_at desc);

create index if not exists product_contributions_master_status_idx
  on public.product_contributions(master_product_id, status);

alter table public.categories
  add column if not exists master_category_id uuid
    references public.master_categories(id) on delete set null;

alter table public.products
  add column if not exists master_product_id uuid
    references public.master_products(id) on delete set null,
  add column if not exists master_content_version integer,
  add column if not exists content_source text not null default 'local';

alter table public.products drop constraint if exists products_content_source_check;
alter table public.products
  add constraint products_content_source_check
  check (content_source in ('local', 'master', 'master_override'));

alter table public.products drop constraint if exists products_master_content_version_check;
alter table public.products
  add constraint products_master_content_version_check
  check (
    (master_product_id is null and master_content_version is null and content_source = 'local')
    or
    (master_product_id is not null and master_content_version is not null and master_content_version > 0)
  );

alter table public.product_images
  add column if not exists master_media_id uuid
    references public.master_product_media(id) on delete set null;

create unique index if not exists categories_catalog_master_category_unique_idx
  on public.categories(catalog_id, master_category_id)
  where master_category_id is not null;

create unique index if not exists products_catalog_master_product_unique_idx
  on public.products(catalog_id, master_product_id)
  where master_product_id is not null;

create unique index if not exists product_images_product_master_media_unique_idx
  on public.product_images(product_id, master_media_id)
  where master_media_id is not null;

create index if not exists products_catalog_normalized_barcode_idx
  on public.products(catalog_id, public.normalize_global_barcode(barcode))
  where nullif(trim(barcode), '') is not null;

create or replace function private.enforce_shared_listing_publishable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.master_product_id is not null
    and new.status in ('active'::public.product_status, 'sold_out'::public.product_status)
    and new.price <= 0
  then
    raise exception 'shared_product_price_required'
      using hint = 'Set the catalog price before publishing a shared product.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_shared_listing_publishable on public.products;
create trigger products_shared_listing_publishable
before insert or update of master_product_id, status, price
on public.products
for each row execute function private.enforce_shared_listing_publishable();

drop trigger if exists master_categories_updated_at on public.master_categories;
create trigger master_categories_updated_at before update on public.master_categories
for each row execute function public.set_updated_at();

drop trigger if exists master_products_updated_at on public.master_products;
create trigger master_products_updated_at before update on public.master_products
for each row execute function public.set_updated_at();

drop trigger if exists master_product_media_updated_at on public.master_product_media;
create trigger master_product_media_updated_at before update on public.master_product_media
for each row execute function public.set_updated_at();

drop trigger if exists product_contributions_updated_at on public.product_contributions;
create trigger product_contributions_updated_at before update on public.product_contributions
for each row execute function public.set_updated_at();

alter table public.master_categories enable row level security;
alter table public.master_products enable row level security;
alter table public.master_product_identifiers enable row level security;
alter table public.master_product_media enable row level security;
alter table public.product_contributions enable row level security;

drop policy if exists "master categories public read active" on public.master_categories;
create policy "master categories public read active"
on public.master_categories for select
using (status = 'active' or public.is_platform_admin());

drop policy if exists "platform admins manage master categories" on public.master_categories;
create policy "platform admins manage master categories"
on public.master_categories for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "master products public read verified" on public.master_products;
create policy "master products public read verified"
on public.master_products for select to anon
using (status = 'verified');

drop policy if exists "master products authenticated read available" on public.master_products;
create policy "master products authenticated read available"
on public.master_products for select to authenticated
using (status in ('pending', 'verified') or public.is_platform_admin());

drop policy if exists "platform admins manage master products" on public.master_products;
create policy "platform admins manage master products"
on public.master_products for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "master identifiers read visible product" on public.master_product_identifiers;
create policy "master identifiers read visible product"
on public.master_product_identifiers for select
using (
  exists (
    select 1
    from public.master_products product
    where product.id = master_product_identifiers.master_product_id
  )
);

drop policy if exists "platform admins manage master identifiers" on public.master_product_identifiers;
create policy "platform admins manage master identifiers"
on public.master_product_identifiers for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "master media read visible product" on public.master_product_media;
create policy "master media read visible product"
on public.master_product_media for select
using (
  exists (
    select 1
    from public.master_products product
    where product.id = master_product_media.master_product_id
  )
);

drop policy if exists "platform admins manage master media" on public.master_product_media;
create policy "platform admins manage master media"
on public.master_product_media for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "contributors read own catalog proposals" on public.product_contributions;
create policy "contributors read own catalog proposals"
on public.product_contributions for select to authenticated
using (
  public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  )
  or public.is_platform_admin()
);

drop policy if exists "contributors submit own catalog proposals" on public.product_contributions;
create policy "contributors submit own catalog proposals"
on public.product_contributions for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  )
);

drop policy if exists "platform admins manage product proposals" on public.product_contributions;
create policy "platform admins manage product proposals"
on public.product_contributions for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function private.create_shared_product_category(
  target_catalog_id uuid,
  target_name text,
  target_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_platform_admin boolean := public.is_platform_admin();
  normalized_name text := regexp_replace(trim(coalesce(target_name, '')), '[[:space:]]+', ' ', 'g');
  selected_category_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required';
  end if;

  if not actor_is_platform_admin and (
    target_catalog_id is null
    or not public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin', 'editor']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_editor_required';
  end if;

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'shared_category_name_invalid';
  end if;

  if target_parent_id is not null and not exists (
    select 1
    from public.master_categories parent
    where parent.id = target_parent_id
      and parent.status = 'active'
  ) then
    raise exception 'shared_parent_category_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(normalized_name), 1));

  select category.id
  into selected_category_id
  from public.master_categories category
  where lower(category.name) = lower(normalized_name)
    and category.status = 'active'
  order by category.created_at
  limit 1;

  if selected_category_id is not null then
    return selected_category_id;
  end if;

  selected_category_id := gen_random_uuid();

  insert into public.master_categories (
    id,
    parent_id,
    name,
    slug,
    source_type,
    created_by_catalog_id,
    created_by
  )
  values (
    selected_category_id,
    target_parent_id,
    normalized_name,
    'shared-' || left(replace(selected_category_id::text, '-', ''), 24),
    case when actor_is_platform_admin then 'platform' else 'merchant' end,
    target_catalog_id,
    actor_id
  );

  if target_catalog_id is not null then
    insert into public.audit_logs (
      catalog_id,
      actor_id,
      action,
      entity_table,
      entity_id,
      payload
    )
    values (
      target_catalog_id,
      actor_id,
      'shared_category_created',
      'master_categories',
      selected_category_id,
      jsonb_build_object('name', normalized_name, 'parent_id', target_parent_id)
    );
  end if;

  return selected_category_id;
end;
$$;

create or replace function public.create_shared_product_category(
  target_catalog_id uuid,
  target_name text,
  target_parent_id uuid default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_shared_product_category(
    target_catalog_id,
    target_name,
    target_parent_id
  );
$$;

create or replace function private.submit_shared_product(
  target_catalog_id uuid,
  target_barcode text,
  target_title text,
  target_master_category_id uuid default null,
  target_product_data jsonb default '{}'::jsonb,
  target_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_barcode text := public.normalize_global_barcode(target_barcode);
  display_barcode text := regexp_replace(trim(coalesce(target_barcode, '')), '[[:space:]-]+', '', 'g');
  selected_category_id uuid;
  selected_master_product_id uuid;
  existing_product_title text;
  actor_is_platform_admin boolean := public.is_platform_admin();
begin
  if actor_id is null then
    raise exception 'authentication_required';
  end if;

  if not actor_is_platform_admin and (
    target_catalog_id is null
    or not public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin', 'editor']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_editor_required';
  end if;

  if not public.is_valid_global_barcode(target_barcode) or normalized_barcode is null then
    raise exception 'invalid_global_barcode';
  end if;

  if length(trim(coalesce(target_title, ''))) = 0 then
    raise exception 'product_title_required';
  end if;

  if jsonb_typeof(coalesce(target_product_data, '{}'::jsonb)) <> 'object' then
    raise exception 'product_data_must_be_object';
  end if;

  -- Serialize first-writer creation for this GTIN. The lock only lasts for
  -- this short transaction and prevents two stores creating duplicate masters.
  perform pg_advisory_xact_lock(hashtextextended(normalized_barcode, 0));

  select identifier.master_product_id, product.title
  into selected_master_product_id, existing_product_title
  from public.master_product_identifiers identifier
  join public.master_products product on product.id = identifier.master_product_id
  where identifier.normalized_value = normalized_barcode;

  if selected_master_product_id is not null then
    raise exception 'shared_barcode_already_exists'
      using detail = selected_master_product_id::text,
            hint = existing_product_title;
  end if;

  if selected_master_product_id is null then
    select category.id
    into selected_category_id
    from public.master_categories category
    where category.id = target_master_category_id
      and category.status = 'active';

    selected_category_id := coalesce(
      selected_category_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    );

    insert into public.master_products (
      category_id,
      title,
      brand,
      manufacturer,
      description,
      ingredients,
      allergens,
      country_of_origin,
      net_content_value,
      net_content_unit,
      shelf_life,
      attributes,
      status,
      source_type,
      created_by_catalog_id,
      created_by,
      verified_by,
      verified_at
    )
    values (
      selected_category_id,
      trim(target_title),
      nullif(trim(target_product_data->>'brand'), ''),
      nullif(trim(target_product_data->>'manufacturer'), ''),
      coalesce(target_product_data->>'description', ''),
      coalesce(target_product_data->>'ingredients', ''),
      case
        when jsonb_typeof(target_product_data->'allergens') = 'array'
        then array(select jsonb_array_elements_text(target_product_data->'allergens'))
        else '{}'::text[]
      end,
      nullif(trim(target_product_data->>'country_of_origin'), ''),
      case
        when coalesce(target_product_data->>'net_content_value', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
        then (target_product_data->>'net_content_value')::numeric
        else null
      end,
      case
        when target_product_data->>'net_content_unit' in ('g', 'kg', 'ml', 'l', 'piece')
        then target_product_data->>'net_content_unit'
        else null
      end,
      nullif(trim(target_product_data->>'shelf_life'), ''),
      case
        when jsonb_typeof(target_product_data->'attributes') = 'object'
        then target_product_data->'attributes'
        else '{}'::jsonb
      end,
      case when actor_is_platform_admin then 'verified' else 'pending' end,
      case when actor_is_platform_admin then 'platform' else 'merchant' end,
      target_catalog_id,
      actor_id,
      case when actor_is_platform_admin then actor_id else null end,
      case when actor_is_platform_admin then now() else null end
    )
    returning id into selected_master_product_id;

    insert into public.master_product_identifiers (
      master_product_id,
      display_value,
      normalized_value,
      is_primary
    )
    values (
      selected_master_product_id,
      display_barcode,
      normalized_barcode,
      true
    )
    on conflict do nothing;

  end if;

  if nullif(trim(coalesce(target_image_url, '')), '') is not null
    and not exists (
      select 1
      from public.master_product_media media
      where media.master_product_id = selected_master_product_id
        and media.url = trim(target_image_url)
    )
  then
    insert into public.master_product_media (
      master_product_id,
      role,
      url,
      alt,
      processing_status,
      moderation_status,
      is_primary,
      created_by_catalog_id,
      created_by
    )
    values (
      selected_master_product_id,
      'front',
      trim(target_image_url),
      trim(target_title),
      'ready',
      case when actor_is_platform_admin then 'verified' else 'pending' end,
      not exists (
        select 1
        from public.master_product_media media
        where media.master_product_id = selected_master_product_id
          and media.is_primary
          and media.moderation_status <> 'rejected'
      ),
      target_catalog_id,
      actor_id
    );
  end if;

  if target_catalog_id is not null then
    insert into public.product_contributions (
      catalog_id,
      master_product_id,
      contribution_type,
      proposed_data,
      created_by
    )
    values (
      target_catalog_id,
      selected_master_product_id,
      'new_product',
      jsonb_build_object(
        'barcode', display_barcode,
        'normalized_barcode', normalized_barcode,
        'title', trim(target_title),
        'master_category_id', target_master_category_id,
        'product', coalesce(target_product_data, '{}'::jsonb),
        'image_url', nullif(trim(coalesce(target_image_url, '')), '')
      ),
      actor_id
    );
  end if;

  return selected_master_product_id;
end;
$$;

create or replace function public.submit_shared_product(
  target_catalog_id uuid,
  target_barcode text,
  target_title text,
  target_master_category_id uuid default null,
  target_product_data jsonb default '{}'::jsonb,
  target_image_url text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_shared_product(
    target_catalog_id,
    target_barcode,
    target_title,
    target_master_category_id,
    target_product_data,
    target_image_url
  );
$$;

create or replace function public.lookup_shared_product_by_barcode(target_barcode text)
returns table (
  id uuid,
  title text,
  brand text,
  description text,
  ingredients text,
  allergens text[],
  country_of_origin text,
  net_content_value numeric,
  net_content_unit text,
  category_id uuid,
  category_name text,
  barcode text,
  normalized_barcode text,
  image_url text,
  version integer,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    product.id,
    product.title,
    product.brand,
    product.description,
    product.ingredients,
    product.allergens,
    product.country_of_origin,
    product.net_content_value,
    product.net_content_unit,
    category.id,
    category.name,
    identifier.display_value,
    identifier.normalized_value,
    primary_media.url,
    product.version,
    product.status
  from public.master_product_identifiers identifier
  join public.master_products product on product.id = identifier.master_product_id
  join public.master_categories category on category.id = product.category_id
  left join lateral (
    select media.url
    from public.master_product_media media
    where media.master_product_id = product.id
      and media.processing_status = 'ready'
      and media.moderation_status in ('pending', 'verified')
    order by media.is_primary desc, media.sort_order, media.created_at
    limit 1
  ) primary_media on true
  where identifier.normalized_value = public.normalize_global_barcode(target_barcode)
    and public.is_valid_global_barcode(target_barcode)
    and product.status in ('pending', 'verified')
  limit 1;
$$;

create or replace function public.search_shared_products(
  target_query text default '',
  target_category_id uuid default null,
  target_limit integer default 50,
  target_offset integer default 0
)
returns table (
  id uuid,
  title text,
  brand text,
  description text,
  ingredients text,
  allergens text[],
  country_of_origin text,
  net_content_value numeric,
  net_content_unit text,
  category_id uuid,
  category_name text,
  barcode text,
  normalized_barcode text,
  image_url text,
  version integer,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    product.id,
    product.title,
    product.brand,
    product.description,
    product.ingredients,
    product.allergens,
    product.country_of_origin,
    product.net_content_value,
    product.net_content_unit,
    category.id,
    category.name,
    identifier.display_value,
    identifier.normalized_value,
    primary_media.url,
    product.version,
    product.status
  from public.master_products product
  join public.master_categories category on category.id = product.category_id
  join lateral (
    select value.display_value, value.normalized_value
    from public.master_product_identifiers value
    where value.master_product_id = product.id
    order by value.is_primary desc, value.created_at
    limit 1
  ) identifier on true
  left join lateral (
    select media.url
    from public.master_product_media media
    where media.master_product_id = product.id
      and media.processing_status = 'ready'
      and media.moderation_status in ('pending', 'verified')
    order by media.is_primary desc, media.sort_order, media.created_at
    limit 1
  ) primary_media on true
  where product.status <> 'archived'
    and (target_category_id is null or product.category_id = target_category_id)
    and (
      length(trim(coalesce(target_query, ''))) = 0
      or product.title ilike '%' || trim(target_query) || '%'
      or coalesce(product.brand, '') ilike '%' || trim(target_query) || '%'
      or identifier.display_value = regexp_replace(trim(target_query), '[[:space:]-]+', '', 'g')
      or identifier.normalized_value = public.normalize_global_barcode(target_query)
    )
  order by product.updated_at desc, product.title
  limit least(greatest(coalesce(target_limit, 50), 1), 100)
  offset greatest(coalesce(target_offset, 0), 0);
$$;

create or replace function public.bulk_add_shared_products_to_catalog(
  target_catalog_id uuid,
  target_master_product_ids uuid[]
)
returns table (
  master_product_id uuid,
  product_id uuid,
  created boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requested_master_id uuid;
  master_record record;
  local_category_id uuid;
  local_product_id uuid;
  created_product boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if not public.is_catalog_member(
    target_catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  ) then
    raise exception 'catalog_editor_required';
  end if;

  if coalesce(cardinality(target_master_product_ids), 0) = 0 then
    return;
  end if;

  if cardinality(target_master_product_ids) > 500 then
    raise exception 'shared_product_batch_limit_exceeded';
  end if;

  for requested_master_id in
    select distinct requested_id
    from unnest(target_master_product_ids) as requested(requested_id)
    where requested_id is not null
  loop
    select
      product.id,
      product.category_id,
      product.title,
      product.description,
      product.ingredients,
      product.net_content_value,
      product.net_content_unit,
      product.version,
      identifier.display_value as barcode,
      identifier.normalized_value as normalized_barcode
    into master_record
    from public.master_products product
    join public.master_product_identifiers identifier
      on identifier.master_product_id = product.id
      and identifier.is_primary
    where product.id = requested_master_id
      and product.status in ('pending', 'verified');

    if master_record.id is null then
      continue;
    end if;

    insert into public.categories (
      catalog_id,
      master_category_id,
      name,
      slug,
      description,
      is_hidden
    )
    select
      target_catalog_id,
      category.id,
      category.name,
      'shared-' || replace(category.id::text, '-', ''),
      category.description,
      false
    from public.master_categories category
    where category.id = master_record.category_id
    on conflict do nothing;

    select category.id
    into local_category_id
    from public.categories category
    where category.catalog_id = target_catalog_id
      and category.master_category_id = master_record.category_id;

    select product.id
    into local_product_id
    from public.products product
    where product.catalog_id = target_catalog_id
      and product.master_product_id = requested_master_id;

    created_product := false;

    if local_product_id is null then
      select product.id
      into local_product_id
      from public.products product
      where product.catalog_id = target_catalog_id
        and product.master_product_id is null
        and public.normalize_global_barcode(product.barcode) = master_record.normalized_barcode
      order by product.created_at
      limit 1;

      if local_product_id is not null then
        update public.products
        set
          master_product_id = requested_master_id,
          master_content_version = master_record.version,
          content_source = 'master_override',
          category_id = coalesce(category_id, local_category_id)
        where id = local_product_id
          and catalog_id = target_catalog_id;
      end if;
    end if;

    if local_product_id is null then
      insert into public.products (
        catalog_id,
        category_id,
        master_product_id,
        master_content_version,
        content_source,
        title,
        slug,
        barcode,
        status,
        price,
        description,
        ingredients,
        weight,
        stock_count,
        stock_quantity
      )
      values (
        target_catalog_id,
        local_category_id,
        requested_master_id,
        master_record.version,
        'master',
        master_record.title,
        'shared-' || replace(requested_master_id::text, '-', ''),
        master_record.barcode,
        'draft'::public.product_status,
        0,
        master_record.description,
        master_record.ingredients,
        concat_ws(' ', master_record.net_content_value, master_record.net_content_unit),
        0,
        0
      )
      on conflict do nothing
      returning id into local_product_id;

      created_product := local_product_id is not null;

      if local_product_id is null then
        select product.id
        into local_product_id
        from public.products product
        where product.catalog_id = target_catalog_id
          and product.master_product_id = requested_master_id;
      end if;
    end if;

    if local_product_id is null then
      continue;
    end if;

    insert into public.product_images (
      catalog_id,
      product_id,
      master_media_id,
      url,
      alt,
      sort_order
    )
    select
      target_catalog_id,
      local_product_id,
      media.id,
      media.url,
      coalesce(nullif(media.alt, ''), master_record.title),
      media.sort_order
    from public.master_product_media media
    where media.master_product_id = requested_master_id
      and media.processing_status = 'ready'
      and media.moderation_status in ('pending', 'verified')
    on conflict do nothing;

    master_product_id := requested_master_id;
    product_id := local_product_id;
    created := created_product;
    return next;
  end loop;
end;
$$;

revoke all on table public.master_categories from public, anon, authenticated;
revoke all on table public.master_products from public, anon, authenticated;
revoke all on table public.master_product_identifiers from public, anon, authenticated;
revoke all on table public.master_product_media from public, anon, authenticated;
revoke all on table public.product_contributions from public, anon, authenticated;

grant select on table public.master_categories to anon, authenticated;
grant select on table public.master_products to anon, authenticated;
grant select on table public.master_product_identifiers to anon, authenticated;
grant select on table public.master_product_media to anon, authenticated;
grant select, insert on table public.product_contributions to authenticated;

grant insert, update, delete on table public.master_categories to authenticated;
grant insert, update, delete on table public.master_products to authenticated;
grant insert, update, delete on table public.master_product_identifiers to authenticated;
grant insert, update, delete on table public.master_product_media to authenticated;
grant update, delete on table public.product_contributions to authenticated;

grant all on table public.master_categories to service_role;
grant all on table public.master_products to service_role;
grant all on table public.master_product_identifiers to service_role;
grant all on table public.master_product_media to service_role;
grant all on table public.product_contributions to service_role;

revoke all on function public.normalize_global_barcode(text) from public, anon, authenticated;
revoke all on function public.is_valid_global_barcode(text) from public, anon, authenticated;
revoke all on function public.lookup_shared_product_by_barcode(text) from public, anon, authenticated;
revoke all on function public.search_shared_products(text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.create_shared_product_category(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.submit_shared_product(uuid, text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.bulk_add_shared_products_to_catalog(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.submit_shared_product(uuid, text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.create_shared_product_category(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.enforce_shared_listing_publishable() from public, anon, authenticated;
revoke all on schema private from public;

grant usage on schema private to authenticated, service_role;
grant execute on function private.create_shared_product_category(uuid, text, uuid)
  to authenticated, service_role;
grant execute on function private.submit_shared_product(uuid, text, text, uuid, jsonb, text)
  to authenticated, service_role;
grant execute on function public.normalize_global_barcode(text)
  to authenticated, service_role;
grant execute on function public.is_valid_global_barcode(text)
  to authenticated, service_role;
grant execute on function public.lookup_shared_product_by_barcode(text)
  to authenticated, service_role;
grant execute on function public.search_shared_products(text, uuid, integer, integer)
  to authenticated, service_role;
grant execute on function public.create_shared_product_category(uuid, text, uuid)
  to authenticated, service_role;
grant execute on function public.submit_shared_product(uuid, text, text, uuid, jsonb, text)
  to authenticated, service_role;
grant execute on function public.bulk_add_shared_products_to_catalog(uuid, uuid[])
  to authenticated, service_role;
