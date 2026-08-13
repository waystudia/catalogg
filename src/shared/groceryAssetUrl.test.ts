import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GROCERY_CATALOG_ASSET_VERSION, versionGroceryCatalogAssetUrl } from './groceryAssetUrl';

describe('grocery catalog asset URL', () => {
  it('adds the current version to a stored grocery product image', () => {
    assert.equal(
      versionGroceryCatalogAssetUrl('/assets/template-grocery/products/medjool-dates.webp'),
      `/assets/template-grocery/products/medjool-dates.webp?v=${GROCERY_CATALOG_ASSET_VERSION}`
    );
  });

  it('replaces an older grocery asset version and preserves other parameters', () => {
    assert.equal(
      versionGroceryCatalogAssetUrl('/assets/template-grocery/products/medjool-dates.webp?fit=cover&v=old#photo'),
      `/assets/template-grocery/products/medjool-dates.webp?fit=cover&v=${GROCERY_CATALOG_ASSET_VERSION}#photo`
    );
  });

  it('does not modify merchant uploads or unrelated assets', () => {
    assert.equal(
      versionGroceryCatalogAssetUrl('https://api.wayyaam.ru/storage/v1/object/public/catalog/photo.webp'),
      'https://api.wayyaam.ru/storage/v1/object/public/catalog/photo.webp'
    );
    assert.equal(versionGroceryCatalogAssetUrl('/assets/finik/logo.png'), '/assets/finik/logo.png');
  });
});
