import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClientDish } from '../../features/client-platform/types';
import { buildClientOrderItems, resolveClientOrderRpcName } from './clientPlatformOrderPayload';

const product = (overrides: Partial<ClientDish>): ClientDish => ({
  id: '11111111-1111-4111-8111-111111111111',
  restaurantSlug: 'finik',
  categorySlug: 'fruit',
  name: 'Товар',
  description: '',
  price: 100,
  imageUrl: '',
  tags: [],
  isPopular: false,
  stockCount: 10,
  stockQuantity: 10,
  isUnlimited: false,
  saleUnit: 'piece',
  quantityUnit: 'piece',
  priceBasisQuantity: 1,
  minimumQuantity: 1,
  quantityStep: 1,
  allowSubstitution: true,
  sku: 'SKU-1',
  barcode: '',
  ...overrides
});

describe('client platform weighted order payload', () => {
  it('keeps piece quantity compatible with the established restaurant RPC', () => {
    const items = buildClientOrderItems(
      [{ dishId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
      [product({})]
    );

    assert.deepEqual(items, [{
      product_id: '11111111-1111-4111-8111-111111111111',
      quantity: 2,
      options: []
    }]);
    assert.equal(resolveClientOrderRpcName(items), 'create_client_platform_restaurant_order');
  });

  it('routes a piece-only grocery cart through authoritative grocery stock', () => {
    const items = buildClientOrderItems(
      [{ dishId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
      [product({})]
    );

    assert.equal(resolveClientOrderRpcName(items, 'grocery'), 'create_client_platform_catalog_order');
  });

  it('sends exact grams through the isolated catalog-order RPC', () => {
    const items = buildClientOrderItems(
      [{ dishId: '22222222-2222-4222-8222-222222222222', quantity: 750 }],
      [product({
        id: '22222222-2222-4222-8222-222222222222',
        saleUnit: 'weight',
        quantityUnit: 'gram',
        priceBasisQuantity: 1000,
        minimumQuantity: 250,
        quantityStep: 50,
        stockQuantity: 8_000
      })]
    );

    assert.deepEqual(items, [{
      product_id: '22222222-2222-4222-8222-222222222222',
      quantity: 1,
      requested_quantity: 750,
      options: []
    }]);
    assert.equal(resolveClientOrderRpcName(items), 'create_client_platform_catalog_order');
  });
});
