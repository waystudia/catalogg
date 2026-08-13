import { describe, expect, it } from 'vitest';
import {
  findSharedProductByBarcode,
  type SharedProduct
} from '../../src/entities/sharedProducts';

const makeProduct = (overrides: Partial<SharedProduct> = {}): SharedProduct => ({
  id: 'product-1',
  title: 'Coca-Cola Original Taste',
  brand: null,
  description: null,
  ingredients: null,
  allergens: [],
  countryOfOrigin: null,
  netContentValue: null,
  netContentUnit: null,
  categoryId: null,
  categoryName: null,
  barcode: '5449000054227',
  normalizedBarcode: '05449000054227',
  imageUrl: null,
  version: 1,
  status: 'verified',
  ...overrides
});

describe('shared product barcode uniqueness', () => {
  it('matches the persisted normalized barcode even if the display value is unavailable', () => {
    const product = makeProduct({ barcode: '' });

    expect(findSharedProductByBarcode([product], '5449-0000-5422-7')).toBe(product);
  });

  it('falls back to normalizing the product display barcode', () => {
    const product = makeProduct({ normalizedBarcode: '' });

    expect(findSharedProductByBarcode([product], '5449 0000 5422 7')).toBe(product);
  });

  it('does not report a conflict for an invalid or different barcode', () => {
    const product = makeProduct();
    const malformedProduct = makeProduct({ barcode: 'not-a-barcode', normalizedBarcode: '' });

    expect(findSharedProductByBarcode([product], 'not-a-barcode')).toBeNull();
    expect(findSharedProductByBarcode([malformedProduct], 'also-invalid')).toBeNull();
    expect(findSharedProductByBarcode([product], '036000291452')).toBeNull();
  });
});
