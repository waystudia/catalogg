import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8');
const subscriptionsSource = fs.readFileSync(new URL('../../src/shared/api/subscriptionsApi.ts', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../../src/pages/client-platform/ClientPlatformApp.tsx', import.meta.url), 'utf8');
const clientCss = fs.readFileSync(new URL('../../src/pages/client-platform/client-platform.css', import.meta.url), 'utf8');
const adminCss = fs.readFileSync(new URL('../../src/pages/platform-admin/platform-admin.css', import.meta.url), 'utf8');
const routesSource = fs.readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(
  new URL('../../supabase/migrations/20260730120000_add_platform_content_pages_and_support.sql', import.meta.url),
  'utf8'
);
const bannerDurationMigrationSource = fs.readFileSync(
  new URL('../../supabase/migrations/20260809094923_add_platform_banner_display_duration.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readdirSync(new URL('../../supabase/migrations', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  .join('\n');

test('subscriptions overview is a form-free navigation hub with six sections and recent payments', () => {
  assert.match(appSource, /platform-subscriptions-overview/);
  assert.match(appSource, /Комиссии за месяц/);
  assert.match(appSource, /Согласование цен водителей/);
  assert.match(appSource, /Последние платежи/);
  assert.match(appSource, /Все платежи/);
});

test('restaurant and driver tariffs support percent and fixed commission modes', () => {
  assert.match(appSource, /Тип тарифа ресторана/);
  assert.match(appSource, /Тип тарифа водителя/);
  assert.match(appSource, /value="percent">Процент/);
  assert.match(appSource, /value="fixed">Фиксированная сумма/);
  assert.match(subscriptionsSource, /restaurant_tariff_type/);
  assert.match(subscriptionsSource, /restaurant_tariff_fixed/);
  assert.match(subscriptionsSource, /driver_tariff_type/);
  assert.match(subscriptionsSource, /driver_tariff_fixed/);
  assert.match(migrationSql, /add column if not exists restaurant_tariff_type/);
  assert.match(migrationSql, /add column if not exists driver_tariff_type/);
  assert.match(migrationSql, /when resolved_tariff_type = 'fixed' then resolved_tariff_fixed/);
  assert.match(migrationSql, /else payout \* resolved_tariff_percent \/ 100/);
  assert.match(subscriptionsSource, /restaurant_tariff_type:\s*input\.restaurantTariffType/);
  assert.match(subscriptionsSource, /driver_tariff_fixed:\s*input\.driverFixedFee/);
});

test('mobile subscription metric labels wrap inside their cards', () => {
  assert.match(adminCss, /\.platform-overview-metrics small\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(adminCss, /\.platform-overview-metrics article\s*\{[\s\S]*min-width:\s*0/);
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

test('client banners stay horizontal and place text actions above full-bleed media', () => {
  assert.match(clientCss, /\.promo-band\s*\{[\s\S]*aspect-ratio:\s*8\s*\/\s*3/);
  assert.match(clientCss, /\.promo-band\s*\{[\s\S]*max-height:\s*280px/);
  assert.match(clientCss, /\.promo-band\s*>\s*\.promo-band__media\s*\{[\s\S]*position:\s*absolute/);
  assert.match(clientCss, /\.promo-band\s*>\s*div,[\s\S]*\.promo-band\s*>\s*a\s*\{[\s\S]*z-index:\s*2/);
  assert.match(adminCss, /\.platform-banner-media-preview\s*\{[\s\S]*aspect-ratio:\s*8\s*\/\s*3/);
  assert.match(clientCss, /\.promo-band strong[\s\S]*text-shadow:/);
  assert.match(clientCss, /\.promo-band a[\s\S]*background:\s*rgba\(/);
  assert.match(clientCss, /\.promo-band a[\s\S]*backdrop-filter:\s*blur/);
});

test('banner editor controls text and button placement independently', () => {
  assert.match(appSource, /Расположение текста/);
  assert.match(appSource, /Расположение кнопки/);
  assert.match(appSource, /contentPosition/);
  assert.match(appSource, /buttonPosition/);
  assert.match(clientSource, /promo-band__copy--\$\{banner\.contentPosition\}/);
  assert.match(clientSource, /promo-band__action--\$\{banner\.buttonPosition\}/);
});

test('banner editor exposes per-banner timing and four downloadable layout templates', () => {
  assert.match(appSource, /Время показа, секунд/);
  assert.match(appSource, /Шаблоны баннера/);
  assert.match(appSource, /Скачать PNG 1600×600/);
  assert.match(appSource, /bannerLayoutTemplates\.map/);
  assert.match(clientSource, /displayDurationMs:\s*activeBanner\?\.displayDurationMs/);
  assert.match(bannerDurationMigrationSource, /add column if not exists display_duration_ms integer not null default 5000/);
  assert.match(bannerDurationMigrationSource, /display_duration_ms between 2000 and 60000/);
});

test('content page editor offers text, image, and hybrid starter templates', () => {
  assert.match(appSource, /Шаблоны страницы/);
  assert.match(appSource, /platformPageTemplates\.map/);
  assert.match(appSource, /buildPlatformPageTemplate/);
  assert.match(appSource, /Заменить текущие блоки шаблоном/);
});

test('carousel waits for scroll settling and resets cloned slides without animation', () => {
  assert.match(clientSource, /getPromoLoopResetIndex/);
  assert.match(clientSource, /scrollBehavior\s*=\s*'auto'/);
  assert.match(clientSource, /requestAnimationFrame/);
});

test('a centered video completes once before the carousel advances', () => {
  assert.match(clientSource, /getPromoAutoAdvanceDelay/);
  assert.match(clientSource, /onEnded=\{\(\)\s*=>/);
  assert.doesNotMatch(clientSource, /<video[^>]*\sloop(?:\s|\/|>)/);
});

test('active banners reject draft pages before a broken client link is saved', () => {
  assert.match(appSource, /validatePlatformBannerTarget/);
  assert.match(appSource, /disabled=\{isActive && page\.status !== 'published'\}/);
  assert.match(appSource, /bannerUsageCount:\s*page\?\.bannerUsageCount\s*\?\?\s*0/);
});
