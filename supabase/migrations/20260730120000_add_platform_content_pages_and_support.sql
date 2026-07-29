alter table public.platform_settings
  add column if not exists support_phone text not null default '',
  add column if not exists support_email text not null default '',
  add column if not exists support_telegram text not null default '',
  add column if not exists support_hours text not null default '',
  add column if not exists support_hint text not null default '';

create table if not exists public.platform_content_pages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'inactive')),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

alter table public.platform_banners
  add column if not exists name text not null default '',
  add column if not exists page_id uuid references public.platform_content_pages(id) on delete set null,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.platform_banners drop constraint if exists platform_banners_kind_check;
alter table public.platform_banners
  add constraint platform_banners_kind_check check (kind in ('banner', 'contest', 'promo', 'news'));

create index if not exists platform_content_pages_status_idx
  on public.platform_content_pages(status, updated_at desc);
create index if not exists platform_banners_page_id_idx
  on public.platform_banners(page_id);

alter table public.platform_content_pages enable row level security;

grant select on table public.platform_content_pages to anon;
grant select, insert, update, delete on table public.platform_content_pages to authenticated;
grant select, insert, update, delete on table public.platform_content_pages to service_role;

drop policy if exists "platform content pages public read published" on public.platform_content_pages;
create policy "platform content pages public read published" on public.platform_content_pages
for select to anon
using (status = 'published');

drop policy if exists "platform content pages authenticated read" on public.platform_content_pages;
create policy "platform content pages authenticated read" on public.platform_content_pages
for select to authenticated
using (status = 'published' or public.is_platform_admin());

drop policy if exists "platform content pages admins manage" on public.platform_content_pages;
drop policy if exists "platform content pages admins insert" on public.platform_content_pages;
create policy "platform content pages admins insert" on public.platform_content_pages
for insert to authenticated
with check (public.is_platform_admin());

drop policy if exists "platform content pages admins update" on public.platform_content_pages;
create policy "platform content pages admins update" on public.platform_content_pages
for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform content pages admins delete" on public.platform_content_pages;
create policy "platform content pages admins delete" on public.platform_content_pages
for delete to authenticated
using (public.is_platform_admin());
