import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspaceSource = await readFile(
  new URL('../../src/features/restaurant-admin/RestaurantAdminWorkspace.tsx', import.meta.url),
  'utf8'
);
const scannerSource = await readFile(
  new URL('../../src/pages/scanner/ScannerPage.tsx', import.meta.url),
  'utf8'
);
const driverSource = await readFile(
  new URL('../../src/pages/driver/DriverApp.tsx', import.meta.url),
  'utf8'
);
const migrationSql = await readFile(
  new URL('../../supabase/migrations/20260731075103_expose_restaurant_billing_tariff.sql', import.meta.url),
  'utf8'
);
const customTariffMigrationSql = await readFile(
  new URL('../../supabase/migrations/20260731075441_fix_restaurant_custom_tariff_subject.sql', import.meta.url),
  'utf8'
);

test('restaurant finance shows gross receipts and reads the configured platform tariff', () => {
  assert.match(workspaceSource, /getCurrentRestaurantBillingTariff\(catalogSlug\)/);
  assert.match(workspaceSource, /calculateRestaurantFinance\(monthOrders, billingTariff\)/);
  assert.doesNotMatch(workspaceSource, /monthRevenue \* 0\.07/);
  assert.match(migrationSql, /get_current_restaurant_billing_tariff/);
  assert.match(migrationSql, /settings\.restaurant_tariff_fixed/);
  assert.match(customTariffMigrationSql, /target_client_id/);
  assert.match(customTariffMigrationSql, /subject_id in \(target_client_id::text, target_catalog_id::text\)/);
});

test('successful restaurant QR scan opens the matching order and closes the driver QR screen', () => {
  assert.match(scannerSource, /getRestaurantOrderIdForDelivery\(parsed\.deliveryId\)/);
  assert.match(scannerSource, /navigate\(`\/\$\{slug \|\| 'mangal'\}\/order\/\$\{encodeURIComponent\(orderId\)\}`/);
  assert.match(workspaceSource, /onConfirmed=\{\(orderId\) =>/);
  assert.match(driverSource, /if \(delivery\?\.pickupQrConfirmed\) \{[\s\S]*navigate\('\/driver\/active', \{ replace: true \}\)/);
  assert.match(migrationSql, /get_restaurant_order_id_for_delivery/);
});
