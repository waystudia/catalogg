import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const page = readFileSync(resolve(repoRoot, 'src/features/shared-product-catalog/SharedProductCatalogPage.tsx'), 'utf8');
const scanner = readFileSync(resolve(repoRoot, 'src/features/shared-product-catalog/SharedBarcodeScanner.tsx'), 'utf8');
const platformAdmin = readFileSync(resolve(repoRoot, 'src/pages/platform-admin/PlatformAdminApp.tsx'), 'utf8');
const merchantAdmin = readFileSync(resolve(repoRoot, 'src/pages/catalog-admin/RestaurantAdminShell.tsx'), 'utf8');
const warehouse = readFileSync(resolve(repoRoot, 'src/features/grocery-operations/GroceryWarehousePage.tsx'), 'utf8');

describe('shared product catalog workspace', () => {
  it('keeps the shared form limited to common product data without a price input', () => {
    assert.match(page, /Штрих‑код/);
    assert.match(page, /Название/);
    assert.match(page, /Общая группа/);
    assert.match(page, /Фотография/);
    assert.match(page, /Описание/);
    assert.doesNotMatch(page, /type="number"/);
    assert.doesNotMatch(page, /value=\{price\}/);
  });

  it('supports camera scanning and globally reusable category creation', () => {
    for (const format of ['ean_13', 'ean_8', 'upc_a', 'qr_code']) assert.match(scanner, new RegExp(format));
    assert.match(page, /createSharedProductCategory/);
    assert.match(page, /Добавить для всех/);
    assert.match(page, /доступна всем магазинам/);
  });

  it('is available only inside platform admin and grocery merchant workspaces', () => {
    assert.match(platformAdmin, /route: 'shared-products', label: 'База товаров'/);
    assert.match(platformAdmin, /<SharedProductCatalogPage mode="platform"/);
    assert.match(merchantAdmin, /businessType === 'grocery'/);
    assert.match(merchantAdmin, /<SharedProductCatalogPage mode="merchant" catalogId=\{access\.catalog\.id\}/);
  });

  it('opens the categorized shared catalog from the grocery warehouse', () => {
    assert.match(warehouse, /База товаров/);
    assert.match(warehouse, /onOpenSharedProducts/);
    assert.match(merchantAdmin, /isGrocery \? \([\s\S]*onOpenSharedProducts=\{\(\) => goTo\('shared-products'\)\}/);
    assert.match(page, /aria-label="Общая группа"/);
  });

  it('imports a shared product as a store draft without collecting its price here', () => {
    assert.match(page, /addSharedProductsToCatalog/);
    assert.match(page, /Добавить в магазин/);
    assert.match(page, /добавлен в каталог магазина как черновик/);
  });
});
