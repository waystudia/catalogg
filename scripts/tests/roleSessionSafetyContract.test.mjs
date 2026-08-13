import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('role back buttons preserve the active account session', async () => {
  const restaurant = await read('src/app/App.tsx');
  const driver = await read('src/pages/driver/DriverApp.tsx');
  const driverHeader = driver.slice(driver.indexOf('function DriverHeader'), driver.indexOf('function DriverHomeScreen'));

  assert.match(restaurant, /getRestaurantCatalogBackTarget\(\{ catalogSlug, isAdmin, routeSection \}\)/);
  assert.match(driver, /navigate\(getDriverBackTarget\(location\.pathname\)\)/);
  assert.doesNotMatch(driverHeader, /signOutDriver/);
});

test('restaurant, driver, and super admin sign-out actions require confirmation', async () => {
  const driver = await read('src/pages/driver/DriverApp.tsx');
  const platform = await read('src/pages/platform-admin/PlatformAdminApp.tsx');
  const restaurantWorkspace = await read('src/features/restaurant-admin/RestaurantAdminWorkspace.tsx');
  const catalogAdmin = await read('src/pages/catalog-admin/CatalogAdminApp.tsx');

  assert.match(driver, /confirmRoleSignOut\('водителя'\)/);
  assert.match(platform, /confirmRoleSignOut\('суперадминистратора'\)/);
  assert.match(restaurantWorkspace, /confirmRoleSignOut\('заведения'\)/);
  assert.match(catalogAdmin, /confirmRoleSignOut\('заведения'\)/);
});

test('restaurant sign-out clears its scoped browser session before redirecting', async () => {
  const supabase = await read('src/shared/supabase.ts');

  assert.match(supabase, /getSupabaseAuthFallbackStorageKeys\('restaurant-admin'\)/);
  assert.match(supabase, /authStorage\.removeItem/);
  assert.match(supabase, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
});

test('role sessions use the Safari-compatible storage adapter for persistence and handoff', async () => {
  const supabase = await read('src/shared/supabase.ts');
  const authScope = await read('src/shared/supabaseAuthScope.ts');
  const navigation = await read('src/shared/appNavigation.ts');
  const delivery = await read('src/shared/api/deliveryApi.ts');

  assert.match(supabase, /storage: authStorage/);
  assert.match(authScope, /\['localStorage', 'sessionStorage'\]/);
  assert.match(authScope, /waycatalog-auth-session-fallback:/);
  assert.match(authScope, /sessionStorage\.getItem\(markerKey\) === '1'/);
  assert.match(authScope, /export const getSupabaseAuthStorage/);
  assert.match(authScope, /storage\.setItem\(targetKey, session\)/);
  assert.match(authScope, /storage\.removeItem\(key\)/);
  assert.match(navigation, /window\.history\.replaceState/);
  assert.match(navigation, /replaceState\(window\.history\.state, '', buildRoleAppUrl\(path\)\)/);
  assert.match(navigation, /window\.location\.reload\(\)/);
  assert.doesNotMatch(navigation, /buildRoleAppUrl\(path, window\.location\.search\)/);
  assert.match(delivery, /getSupabaseAuthStorage\(\)\.removeItem\(getSupabaseAuthStorageKey\('driver'\)\)/);
});

test('sign-out controls are placed in settings rather than persistent navigation', async () => {
  const platform = await read('src/pages/platform-admin/PlatformAdminApp.tsx');
  const restaurantShell = await read('src/pages/catalog-admin/RestaurantAdminShell.tsx');
  const restaurantWorkspace = await read('src/features/restaurant-admin/RestaurantAdminWorkspace.tsx');
  const app = await read('src/app/App.tsx');

  const platformSidebar = platform.slice(platform.indexOf('function PlatformSidebar'), platform.indexOf('function PlatformMobileNav'));
  const platformSettings = platform.slice(platform.indexOf('function PlatformSettingsPage'), platform.indexOf('function PlatformBannerEditor'));
  assert.doesNotMatch(platformSidebar, /Выйти/);
  assert.match(platformSettings, /<span>Выйти<\/span>/);
  assert.doesNotMatch(restaurantShell.slice(0, restaurantShell.indexOf('function DashboardPage')), /restaurant-admin-nav__item[\s\S]*Выход/);
  assert.doesNotMatch(restaurantWorkspace, /restaurant-admin-sidebar__exit/);
  assert.doesNotMatch(app.slice(app.indexOf('function AdminPanel'), app.indexOf('function SettingsHome')), /Выход/);
});
