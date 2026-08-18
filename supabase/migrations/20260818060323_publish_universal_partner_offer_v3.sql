-- Publish the universal business-partner offer without interrupting existing
-- active clients. Individual commercial terms remain client-specific tariff
-- records and are fingerprinted in every immutable acceptance.

create extension if not exists pgcrypto;

alter table public.restaurant_tariffs
  alter column restaurant_commission_amount drop default,
  alter column driver_commission_amount drop default;

comment on column public.restaurant_tariffs.restaurant_commission_amount is
  'Explicitly agreed partner commission. No platform default is applied.';
comment on column public.restaurant_tariffs.driver_commission_amount is
  'Explicitly agreed delivery commission. No platform default is applied.';

alter table public.legal_acceptances
  add column if not exists tariff_snapshot_hash text;

update public.legal_acceptances
set tariff_snapshot_hash = encode(
  digest(convert_to(tariff_snapshot_json::text, 'UTF8'), 'sha256'),
  'hex'
)
where tariff_snapshot_hash is null;

alter table public.legal_acceptances
  alter column tariff_snapshot_hash set not null;

alter table public.legal_acceptances
  drop constraint if exists legal_acceptances_tariff_snapshot_hash_check;
alter table public.legal_acceptances
  add constraint legal_acceptances_tariff_snapshot_hash_check
  check (tariff_snapshot_hash ~ '^[0-9a-f]{64}$');

create or replace function public.set_legal_acceptance_tariff_snapshot_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  calculated_hash text;
begin
  calculated_hash := encode(
    digest(convert_to(new.tariff_snapshot_json::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.tariff_snapshot_hash is not null
     and new.tariff_snapshot_hash <> calculated_hash then
    raise exception 'tariff_snapshot_hash_mismatch';
  end if;
  new.tariff_snapshot_hash := calculated_hash;
  return new;
end;
$$;

revoke all on function public.set_legal_acceptance_tariff_snapshot_hash() from public, anon, authenticated;

drop trigger if exists legal_acceptances_tariff_snapshot_hash on public.legal_acceptances;
create trigger legal_acceptances_tariff_snapshot_hash
before insert on public.legal_acceptances
for each row execute function public.set_legal_acceptance_tariff_snapshot_hash();

create or replace function public.current_published_legal_bundle_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select bundle.id
  from public.legal_document_bundles bundle
  where bundle.status = 'published'
    and coalesce(bundle.effective_from, '-infinity'::timestamptz) <= now()
    and coalesce(bundle.effective_to, 'infinity'::timestamptz) > now()
    and not exists (
      select 1
      from unnest(array['restaurant_contract', 'privacy_policy']) required_type
      where not exists (
        select 1
        from public.legal_document_bundle_items item
        join public.legal_documents document on document.id = item.document_id
        where item.bundle_id = bundle.id
          and item.required
          and document.document_type = required_type
          and document.status = 'published'
      )
    )
  order by bundle.effective_from desc nulls last, bundle.created_at desc
  limit 1;
$$;

revoke all on function public.current_published_legal_bundle_id() from public;

insert into public.legal_documents(
  document_type, title, version, content_html, pdf_url, file_name,
  file_hash, file_size, mime_type, status, published_at, effective_from,
  requires_reacceptance
)
values
  (
    'restaurant_contract',
    'Универсальный договор-оферта для бизнес-партнёров',
    '3.0',
    '',
    '/legal/09-restaurant-offer.html',
    '09-restaurant-offer.html',
    '6a43ac2c59af2526dbdf1e3668ab0c2d75d768fefb0d0adbc17c482f1ed7f43c',
    28702,
    'text/html',
    'published',
    now(),
    '2026-08-18 00:00:00+03'::timestamptz,
    false
  ),
  (
    'privacy_policy',
    'Политика обработки персональных данных',
    '1.0',
    '',
    '/legal/01-personal-data-policy.html',
    '01-personal-data-policy.html',
    'fa70e84a1452cff0e5c7effd08d28356c1ee5a3f80b220d05e5dc6bc5ad0be45',
    17431,
    'text/html',
    'published',
    now(),
    '2026-07-31 00:00:00+03'::timestamptz,
    false
  )
on conflict (document_type, version) do update
set title = excluded.title,
    content_html = excluded.content_html,
    pdf_url = excluded.pdf_url,
    file_name = excluded.file_name,
    file_hash = excluded.file_hash,
    file_size = excluded.file_size,
    mime_type = excluded.mime_type,
    status = excluded.status,
    published_at = coalesce(public.legal_documents.published_at, excluded.published_at),
    effective_from = excluded.effective_from,
    requires_reacceptance = excluded.requires_reacceptance;

insert into public.legal_document_bundles(
  version, title, status, effective_from, requires_reacceptance, published_at
)
values (
  '3.0',
  'Подключение бизнес-партнёра 3.0',
  'published',
  '2026-08-18 00:00:00+03'::timestamptz,
  false,
  now()
)
on conflict (version) do update
set title = excluded.title,
    status = excluded.status,
    effective_from = excluded.effective_from,
    requires_reacceptance = excluded.requires_reacceptance,
    published_at = coalesce(public.legal_document_bundles.published_at, excluded.published_at);

insert into public.legal_document_bundle_items(bundle_id, document_id, sort_order, required)
select bundle.id, document.id, item.sort_order, true
from public.legal_document_bundles bundle
join (
  values ('restaurant_contract'::text, '3.0'::text, 10),
         ('privacy_policy'::text, '1.0'::text, 20)
) item(document_type, version, sort_order) on true
join public.legal_documents document
  on document.document_type = item.document_type
 and document.version = item.version
where bundle.version = '3.0'
on conflict (bundle_id, document_id) do update
set sort_order = excluded.sort_order,
    required = excluded.required;

comment on column public.legal_acceptances.tariff_snapshot_hash is
  'SHA-256 of the immutable JSONB snapshot of individually agreed commercial terms.';
