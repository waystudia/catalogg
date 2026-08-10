import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { qualifiesForFreeDelivery } from './deliveryPricing';

describe('free delivery threshold', () => {
  it('keeps delivery paid by the client below the configured threshold', () => {
    assert.equal(qualifiesForFreeDelivery(1499, 1500), false);
  });

  it('makes delivery free at the configured threshold and above it', () => {
    assert.equal(qualifiesForFreeDelivery(1500, 1500), true);
    assert.equal(qualifiesForFreeDelivery(1700, 1500), true);
  });

  it('does not treat a disabled threshold as free delivery', () => {
    assert.equal(qualifiesForFreeDelivery(1500, 0), false);
  });
});
