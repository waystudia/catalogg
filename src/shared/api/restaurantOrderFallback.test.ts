import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldIncludeRestaurantDemoOrders } from './restaurantOrderFallback';

describe('restaurant order fallback boundary', () => {
  it('never injects the Mangal order into a grocery business', () => {
    assert.equal(shouldIncludeRestaurantDemoOrders('finik'), false);
    assert.equal(shouldIncludeRestaurantDemoOrders('mangal'), true);
  });
});
