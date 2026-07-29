import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(
  new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url),
  'utf8'
);
const bannerStorageMigration = readFileSync(
  new URL('../../supabase/migrations/20260729175435_add_platform_banner_media_storage.sql', import.meta.url),
  'utf8'
);

test('restaurant profile back navigation returns to the restaurant settings tab', () => {
  assert.match(appSource, /const openRestaurantSettingsHub = useCallback/);
  assert.match(appSource, /const targetPath = `\/\$\{catalogSlug\}\/settings`/);
  assert.match(appSource, /if \(screen === 'settings'\) return openRestaurantSettingsHub\(\)/);
  assert.match(appSource, /onBack=\{openRestaurantSettingsHub\}/);
});

test('superadmin dashboard uses the compact six-card dashboard composition', () => {
  assert.match(platformAdminSource, /variant="dashboard"/);
  assert.match(platformAdminSource, /label: 'Долг клиентов'/);
  assert.match(platformAdminSource, /<DebtControlPanel stats=\{statsQuery\.data\} \/>/);
  assert.match(platformAdminSource, /<RestaurantRevenueSummary stats=\{statsQuery\.data\} \/>/);
});

test('banner media storage is public-read and platform-admin-write only', () => {
  assert.match(bannerStorageMigration, /'platform-banner-media'/);
  assert.match(bannerStorageMigration, /for select\s+to public/);
  assert.match(bannerStorageMigration, /for insert\s+to authenticated/);
  assert.match(bannerStorageMigration, /public\.is_platform_admin\(\)/);
  assert.match(platformAdminSource, /accept="image\/\*,video\/mp4,video\/webm,video\/quicktime"/);
});
