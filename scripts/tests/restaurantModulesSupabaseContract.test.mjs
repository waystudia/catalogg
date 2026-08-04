import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) => name.endsWith('_restaurant_modules.sql'));
const ownerReadMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith('_restaurant_module_owner_read_access.sql'));

describe('restaurant module entitlement contract', () => {
  it('adds a default-off module table without rewriting existing order or catalog tables', () => {
    assert.ok(migrationName, 'restaurant modules migration is missing');
    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /create table public\.restaurant_modules/i);
    for (const column of ['pos_enabled', 'warehouse_enabled', 'recipes_enabled', 'finance_enabled', 'promotions_enabled', 'loyalty_enabled']) {
      assert.match(sql, new RegExp(`${column}\\s+boolean\\s+not null\\s+default false`, 'i'));
    }
    assert.match(sql, /alter table public\.restaurant_modules enable row level security/i);
    assert.match(sql, /grant select, insert, update, delete on table public\.restaurant_modules to authenticated/i);
    assert.doesNotMatch(sql, /drop table|truncate table|delete from public\.(orders|catalogs|products)/i);
  });

  it('allows platform admins to manage rows and restaurant members to read only their catalog row', () => {
    assert.ok(migrationName, 'restaurant modules migration is missing');
    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /for select\s+to authenticated\s+using \([\s\S]*public\.is_platform_admin\(\)[\s\S]*catalog_members/i);
    assert.match(sql, /for insert\s+to authenticated\s+with check \(\(select public\.is_platform_admin\(\)\)\)/i);
    assert.match(sql, /for update\s+to authenticated\s+using \(\(select public\.is_platform_admin\(\)\)\)\s+with check \(\(select public\.is_platform_admin\(\)\)\)/i);
    assert.match(sql, /for delete\s+to authenticated\s+using \(\(select public\.is_platform_admin\(\)\)\)/i);
  });

  it('keeps the platform page isolated and filters restaurant reads by catalog id', () => {
    const app = readFileSync(resolve(repoRoot, 'src/pages/platform-admin/PlatformAdminApp.tsx'), 'utf8');
    const api = readFileSync(resolve(repoRoot, 'src/shared/api/restaurantModulesApi.ts'), 'utf8');

    assert.match(app, /<PlatformRestaurantModulesPage/);
    assert.match(app, /Модули ресторанов/);
    assert.match(api, /\.eq\('catalog_id', catalogId\)/);
  });

  it('lets the active restaurant owner read only the module row for the owned catalog', () => {
    assert.ok(ownerReadMigrationName, 'restaurant module owner read migration is missing');
    const sql = readFileSync(resolve(migrationsDir, ownerReadMigrationName), 'utf8');

    assert.match(sql, /for select\s+to authenticated\s+using/i);
    assert.match(sql, /client\.catalog_id\s*=\s*restaurant_modules\.catalog_id/i);
    assert.match(sql, /client\.owner_user_id\s*=\s*\(select auth\.uid\(\)\)/i);
    assert.doesNotMatch(sql, /for (insert|update|delete)|drop table|truncate|delete from/i);
  });
});
