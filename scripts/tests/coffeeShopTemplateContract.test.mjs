import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20260731210838_add_coffee_shop_template.sql', import.meta.url);

test('coffee shop template is additive, has a readable slug, and preserves restaurant data', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /template_type text not null default 'restaurant'/);
  assert.match(sql, /check \(template_type in \('restaurant', 'coffee_shop'\)\)/);
  assert.match(sql, /'coffee-shop'/);
  assert.match(sql, /Популярное[\s\S]*Классический кофе[\s\S]*Авторский кофе[\s\S]*Десерты/);
  assert.match(sql, /Эспрессо[\s\S]*Капучино[\s\S]*Латте[\s\S]*Флэт уайт/);
  assert.match(sql, /product_option_groups[\s\S]*Объём[\s\S]*Молоко[\s\S]*Сироп/);
  assert.match(sql, /sum\(option_row\.price_delta\)/);
  assert.doesNotMatch(sql, /delete from public\.clients|truncate public\./i);
});

test('client creation exposes optional coffee demo seeding without duplicating the app', async () => {
  const [form, types, createClient, multiBusinessMigration] = await Promise.all([
    readFile(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/shared/api/platformTypes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/functions/create-client/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/20260812172641_add_multi_business_foundation.sql', import.meta.url), 'utf8')
  ]);
  assert.match(form, /Заполнить демонстрационным меню/);
  assert.match(types, /templateType: BusinessType/);
  assert.match(types, /seedDemoMenu\?: boolean/);
  assert.match(createClient, /requested_business_type: payload\.businessType/);
  assert.match(createClient, /requested_seed_demo_menu: payload\.seedDemoMenu === true/);
  assert.match(multiBusinessMigration, /template_type = requested_business_type/);
  assert.match(multiBusinessMigration, /not requested_seed_demo_menu/);
});

test('editing a coffee product preserves modifier identities used by saved carts and orders', async () => {
  const source = await readFile(new URL('../../src/shared/supabase.ts', import.meta.url), 'utf8');
  assert.match(source, /uuidPattern\.test\(group\.id\) \? group\.id : crypto\.randomUUID\(\)/);
  assert.match(source, /id: uuidPattern\.test\(option\.id\) \? option\.id : crypto\.randomUUID\(\)/);
});

test('every demo product has its own generated WebP and Storage publishing stays admin-only', async () => {
  const [assets, policy, storageMigration] = await Promise.all([
    readdir(new URL('../../public/assets/template-coffee-shop/products/', import.meta.url), { recursive: true }),
    readFile(new URL('../../supabase/migrations/20260731215816_allow_platform_admin_catalog_asset_upload.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/20260731220937_use_coffee_shop_storage_assets.sql', import.meta.url), 'utf8')
  ]);
  assert.equal(assets.filter((name) => name.endsWith('.webp')).length, 81);
  assert.match(policy, /to authenticated[\s\S]*public\.is_platform_admin\(\)/);
  assert.match(storageMigration, /storage\/v1\/object\/public\/catalog-assets/);
  assert.match(storageMigration, /product\.slug[\s\S]*'\.webp'/);
});

test('coffee modifier groups and options can be hidden without deleting them', async () => {
  const [migration, editor, catalog] = await Promise.all([
    readFile(new URL('../../supabase/migrations/20260731222142_add_product_modifier_visibility.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/dish-editor/DishForm.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/App.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(migration, /product_option_groups[\s\S]*is_active boolean not null default true/);
  assert.match(migration, /product_options[\s\S]*is_active boolean not null default true/);
  assert.match(editor, /Показывать[\s\S]*Видим/);
  assert.match(catalog, /filter\(\(group\) => group\.isActive !== false\)/);
  assert.match(catalog, /filter\(\(option\) => option\.isActive !== false\)/);
});
