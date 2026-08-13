import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync('src/pages/client-platform/ClientPlatformApp.tsx', 'utf8');
const catalogAppSource = fs.readFileSync('src/app/App.tsx', 'utf8');
const apiSource = fs.readFileSync('src/shared/api/clientPlatformApi.ts', 'utf8');
const indexSource = fs.readFileSync('index.html', 'utf8');
const viteConfigSource = fs.readFileSync('vite.config.ts', 'utf8');
const migrationSource = fs
  .readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_secure_client_reviews.sql'))
  .map((name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8'))
  .join('\n');

test('client profile keeps registration fields compact and removes inactive menu entries', () => {
  const profileSource = appSource.slice(appSource.indexOf('function ProfilePage()'), appSource.indexOf('function OrdersPage'));
  assert.equal(profileSource.indexOf('<span>Пароль</span>') < profileSource.indexOf('aria-label="Условия регистрации"'), true);
  assert.doesNotMatch(profileSource, /profile\/payments|Способы оплаты/);
  assert.doesNotMatch(profileSource, /profile\/settings|Настройки/);
  assert.doesNotMatch(profileSource, /Согласия подтверждены/);
  assert.match(profileSource, /await Promise\.allSettled\(\[logoutClientAccount\(\), signOutPlatformAdmin\(\)\]\)/);
});

test('WayYaam branding and phone-specific install guide are published', () => {
  assert.match(indexSource, /<title>WayYaam<\/title>/);
  assert.doesNotMatch(viteConfigSource, /name: 'WayCatalog'|short_name: 'WayCatalog'/);
  assert.match(viteConfigSource, /name: 'WayYaam'/);
  assert.match(appSource, /function PwaInstallGuide/);
  assert.match(appSource, /Чтобы участвовать в конкурсах WayYaam/);
  assert.match(appSource, /beforeinstallprompt/);
  assert.match(appSource, /ios-share\.jpg/);
  assert.match(appSource, /android-install\.jpg/);
  assert.match(appSource, /resolveInstallGuideDevice/);
  assert.doesNotMatch(appSource.slice(appSource.indexOf('function PwaInstallGuide'), appSource.indexOf('function ClientPlatformContent')), /install-guide__close/);
  assert.match(appSource, /Продолжить на сайт/);
});

test('favorites, repeat checkout and reviews expose complete client actions', () => {
  assert.match(appSource, /aria-pressed=\{isFavorite\}/);
  assert.match(appSource, /navigate\(`\$\{orderPathPrefix\}\/checkout`\)/);
  assert.match(appSource, /useCartStore\.setState/);
  assert.match(appSource, /useOrderStore\.getState\(\)\.setOrder/);
  assert.match(appSource, /to=\{`\$\{orderPathPrefix\}\/order\/\$\{order\.id\}`\}/);
  assert.match(appSource, />\s*Подробнее о заказе\s*</);
  assert.match(appSource, /restaurant\.businessType === 'grocery'[\s\S]*`\/r\/\$\{restaurant\.slug\}\/reviews`/);
  assert.match(appSource, /function RestaurantReviewsPage/);
  assert.match(apiSource, /\.from\('client_reviews'\)[\s\S]*\.eq\('is_visible', true\)/);
});

test('review submission is tied to a real client session and order', () => {
  assert.match(migrationSource, /create or replace function public\.submit_client_review/i);
  assert.match(migrationSource, /client_account_sessions/i);
  assert.match(migrationSource, /target_order_id/i);
  assert.match(migrationSource, /unique \(order_id\)/i);
  assert.match(migrationSource, /drop policy if exists "client reviews public insert"/i);
  assert.match(migrationSource, /revoke insert on table public\.client_reviews from anon, authenticated/i);
});

test('the primary restaurant catalog opens the real review list from its rating', () => {
  assert.doesNotMatch(catalogAppSource, /<span><Star \/> <strong>5\.0<\/strong><\/span>/);
  assert.match(catalogAppSource, /function CatalogReviewsScreen/);
  assert.match(catalogAppSource, /routeSection === 'reviews'/);
  assert.match(catalogAppSource, /onClick=\{onReviews\}/);
});
