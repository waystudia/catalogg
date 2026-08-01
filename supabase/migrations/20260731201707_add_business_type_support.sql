alter table public.clients
  add column if not exists business_type text not null default 'restaurant';

update public.clients
set business_type = 'restaurant'
where business_type not in ('restaurant', 'coffee_shop');

alter table public.clients
  drop constraint if exists clients_business_type_check;

alter table public.clients
  add constraint clients_business_type_check
  check (business_type in ('restaurant', 'coffee_shop'));

-- Public catalogs carry a safe projection of the client's type. This avoids
-- exposing the clients table (which contains personal data) to anonymous users.
alter table public.catalogs
  add column if not exists business_type text not null default 'restaurant';

update public.catalogs as catalog
set business_type = client.business_type
from public.clients as client
where client.catalog_id = catalog.id;

alter table public.catalogs
  drop constraint if exists catalogs_business_type_check;

alter table public.catalogs
  add constraint catalogs_business_type_check
  check (business_type in ('restaurant', 'coffee_shop'));
