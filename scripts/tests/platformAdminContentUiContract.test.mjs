import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../../src/pages/client-platform/ClientPlatformApp.tsx', import.meta.url), 'utf8');
const routesSource = fs.readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(
  new URL('../../supabase/migrations/20260730120000_add_platform_content_pages_and_support.sql', import.meta.url),
  'utf8'
);

test('subscriptions overview is a form-free navigation hub with six sections and recent payments', () => {
  assert.match(appSource, /platform-subscriptions-overview/);
  assert.match(appSource, /Комиссии за месяц/);
  assert.match(appSource, /Согласование цен водителей/);
  assert.match(appSource, /Последние платежи/);
  assert.match(appSource, /Все платежи/);
});

test('settings overview exposes only banners, reusable pages, and support sections', () => {
  assert.match(appSource, /platform-settings-overview/);
  assert.match(appSource, /Баннеры, новости, акции и конкурсы/);
  assert.match(appSource, /Вспомогательные страницы/);
  assert.match(appSource, /Контактные данные службы поддержки/);
});

test('content pages have a database model, banner relation, and a client route', () => {
  assert.match(migrationSource, /create table if not exists public\.platform_content_pages/);
  assert.match(migrationSource, /page_id uuid references public\.platform_content_pages\(id\) on delete set null/);
  assert.match(migrationSource, /unique \(slug\)/);
  assert.match(migrationSource, /grant select on table public\.platform_content_pages to anon/);
  assert.match(migrationSource, /grant select, insert, update, delete on table public\.platform_content_pages to authenticated/);
  assert.match(routesSource, /path="\/pages\/:pageSlug"/);
  assert.match(clientSource, /ContentPageScreen/);
});
