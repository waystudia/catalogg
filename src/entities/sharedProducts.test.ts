import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findSharedProductByBarcode,
  isValidGlobalBarcode,
  normalizeGlobalBarcode,
  type SharedProduct
} from './sharedProducts';

const product: SharedProduct = {
  id: 'product-1',
  title: 'Coca-Cola Original Taste',
  brand: 'Coca-Cola',
  description: null,
  ingredients: null,
  allergens: [],
  countryOfOrigin: null,
  netContentValue: 500,
  netContentUnit: 'ml',
  categoryId: 'drinks',
  categoryName: 'Напитки',
  barcode: '5449000054227',
  normalizedBarcode: '05449000054227',
  imageUrl: null,
  version: 1,
  status: 'verified'
};

describe('shared product barcode normalization', () => {
  it('normalizes EAN and UPC values to the same 14-digit GTIN key', () => {
    assert.equal(normalizeGlobalBarcode('5449000054227'), '05449000054227');
    assert.equal(normalizeGlobalBarcode(' 036000291452 '), '00036000291452');
    assert.equal(normalizeGlobalBarcode('0360-0029-1452'), '00036000291452');
  });

  it('accepts valid GTIN check digits and rejects malformed identifiers', () => {
    assert.equal(isValidGlobalBarcode('5449000054227'), true);
    assert.equal(isValidGlobalBarcode('036000291452'), true);
    assert.equal(isValidGlobalBarcode('5449000054228'), false);
    assert.equal(isValidGlobalBarcode('store-123'), false);
    assert.equal(isValidGlobalBarcode('12345'), false);
  });

  it('finds the existing product before another card can use the same barcode', () => {
    assert.equal(findSharedProductByBarcode([product], '5449-0000-5422-7'), product);
    assert.equal(findSharedProductByBarcode([product], '036000291452'), null);
    assert.equal(findSharedProductByBarcode([product], 'not-a-barcode'), null);
  });
});
