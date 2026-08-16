import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  new URL('../../supabase/migrations/20260816125639_add_restaurant_commission_plans.sql', import.meta.url),
  'utf8'
);

test('seeds the two requested commission plans without assigning existing restaurants', () => {
  assert.match(migration, /'restaurant-percent-2-min-30-max-150'[\s\S]*'capped_percent', 2, 30, 150, 0/);
  assert.match(migration, /'restaurant-fixed-30'[\s\S]*'fixed', 0, 0, null, 30/);
  assert.doesNotMatch(migration, /insert into public\.restaurant_commission_plan_assignments/);
});

test('caps the percentage plan at both exact boundaries', () => {
  assert.match(migration, /greatest\([\s\S]*target_minimum_amount[\s\S]*least\([\s\S]*target_maximum_amount[\s\S]*target_order_amount[\s\S]*target_percent_rate[\s\S]*\/ 100/);
  assert.match(migration, /when target_calculation_type = 'fixed' then greatest\(coalesce\(target_fixed_amount, 0\), 0\)/);
});

test('keeps the published restaurant tariff as the fallback and snapshots the selected plan', () => {
  assert.match(migration, /select tariff\.id, tariff\.restaurant_commission_amount/);
  assert.match(migration, /commission := coalesce\([\s\S]*commission[\s\S]*restaurant_order_commission[\s\S]*30/);
  assert.match(migration, /commission_plan_code, reason, amount, is_test/);
  assert.match(migration, /target_plan_code, 'restaurant_order_commission', commission/);
});

test('restricts plan management to platform administrators', () => {
  assert.match(migration, /alter table public\.restaurant_commission_plans enable row level security/);
  assert.match(migration, /alter table public\.restaurant_commission_plan_assignments enable row level security/);
  assert.match(migration, /for all to authenticated[\s\S]*public\.is_platform_admin\(\)/);
  assert.match(migration, /revoke all on public\.restaurant_commission_plans from public, anon, authenticated/);
});
