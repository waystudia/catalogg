import { describe, expect, it } from 'vitest';
import {
  calculateCatalogLineAmount,
  normalizeCatalogSaleConfiguration,
  normalizeRequestedQuantity,
  type CatalogSaleConfiguration
} from '../../src/entities/catalogSale';

const weightedDates: CatalogSaleConfiguration = {
  saleUnit: 'weight',
  quantityUnit: 'gram',
  priceBasisQuantity: 1000,
  minimumQuantity: 100,
  quantityStep: 50,
  stockQuantity: 12_500,
  isUnlimited: false
};

describe('catalog sale quantities', () => {
  it('keeps piece products on indivisible one-piece quantities', () => {
    expect(normalizeCatalogSaleConfiguration({
      saleUnit: 'piece',
      quantityUnit: 'gram',
      priceBasisQuantity: 1000,
      minimumQuantity: 0,
      quantityStep: 0,
      stockQuantity: 8.8,
      isUnlimited: false
    })).toEqual({
      saleUnit: 'piece',
      quantityUnit: 'piece',
      priceBasisQuantity: 1,
      minimumQuantity: 1,
      quantityStep: 1,
      stockQuantity: 8,
      isUnlimited: false
    });
  });

  it('stores weighted requests as aligned whole grams', () => {
    expect(normalizeCatalogSaleConfiguration(weightedDates)).toEqual(weightedDates);
    expect(normalizeRequestedQuantity(weightedDates, 126)).toBe(150);
    expect(normalizeRequestedQuantity(weightedDates, 74)).toBe(100);
    expect(normalizeRequestedQuantity(weightedDates, 12_501)).toBe(12_500);
  });

  it('uses safe weighted defaults when imported numeric settings are empty or invalid', () => {
    expect(normalizeCatalogSaleConfiguration({
      ...weightedDates,
      priceBasisQuantity: 500,
      minimumQuantity: 250,
      quantityStep: 25,
      stockQuantity: 999.9
    })).toEqual({
      ...weightedDates,
      priceBasisQuantity: 500,
      minimumQuantity: 250,
      quantityStep: 25,
      stockQuantity: 999
    });
    expect(normalizeCatalogSaleConfiguration({
      ...weightedDates,
      priceBasisQuantity: 0,
      minimumQuantity: Number.NaN,
      quantityStep: -5,
      stockQuantity: Number.POSITIVE_INFINITY
    })).toEqual({
      ...weightedDates,
      priceBasisQuantity: 1000,
      minimumQuantity: 100,
      quantityStep: 50,
      stockQuantity: 0
    });
  });

  it('keeps exact finite-stock boundaries and reports less than the minimum as unavailable', () => {
    expect(normalizeRequestedQuantity({ ...weightedDates, stockQuantity: 150 }, 150)).toBe(150);
    expect(normalizeRequestedQuantity({ ...weightedDates, stockQuantity: 100 }, 150)).toBe(100);
    expect(normalizeRequestedQuantity({ ...weightedDates, stockQuantity: 99 }, 100)).toBe(0);
  });

  it('does not cap an unlimited weighted product by a stale stock value', () => {
    expect(normalizeRequestedQuantity({ ...weightedDates, stockQuantity: 0, isUnlimited: true }, 375)).toBe(400);
  });

  it('calculates a weighted line from the authoritative price basis without float drift', () => {
    expect(calculateCatalogLineAmount({
      unitPrice: 289,
      requestedQuantity: 350,
      priceBasisQuantity: 1000
    })).toBe(101);
    expect(calculateCatalogLineAmount({
      unitPrice: 120,
      requestedQuantity: 3,
      priceBasisQuantity: 1
    })).toBe(360);
  });

  it('rejects invalid price and quantity inputs instead of silently creating a free line', () => {
    expect(calculateCatalogLineAmount({
      unitPrice: 0,
      requestedQuantity: 100,
      priceBasisQuantity: 1000
    })).toBe(0);
    expect(() => calculateCatalogLineAmount({
      unitPrice: -1,
      requestedQuantity: 100,
      priceBasisQuantity: 1000
    })).toThrow('invalid_unit_price');
    expect(() => calculateCatalogLineAmount({
      unitPrice: 100,
      requestedQuantity: 0,
      priceBasisQuantity: 1000
    })).toThrow('invalid_requested_quantity');
    expect(() => calculateCatalogLineAmount({
      unitPrice: 100,
      requestedQuantity: 100,
      priceBasisQuantity: 0
    })).toThrow('invalid_price_basis_quantity');
    expect(() => calculateCatalogLineAmount({
      unitPrice: Number.MAX_SAFE_INTEGER,
      requestedQuantity: 2,
      priceBasisQuantity: 1
    })).toThrow('invalid_line_amount');
  });
});
