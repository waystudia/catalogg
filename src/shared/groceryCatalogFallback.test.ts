import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getGroceryCatalogFallback } from './groceryCatalogFallback';

describe('grocery catalog fallback', () => {
  it('keeps Finik grocery-specific when the live catalog is delayed', () => {
    const fallback = getGroceryCatalogFallback(' Finik ');

    assert.equal(fallback?.restaurant.business_type, 'grocery');
    assert.equal(fallback?.restaurant.name, 'Финик');
    assert.ok(fallback?.products.length && fallback.products.length >= 50);
    assert.equal(fallback?.products.some((product) => product.title === 'Шашлык из баранины'), false);
    assert.equal(fallback?.products.some((product) => product.title === 'Чеченский чай'), false);
  });

  it('does not replace any other business catalog', () => {
    assert.equal(getGroceryCatalogFallback('mangal'), null);
    assert.equal(getGroceryCatalogFallback('flowers'), null);
  });
});
