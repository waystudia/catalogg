import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPublicOrderNumber } from './publicOrderNumber';

describe('public order number', () => {
  it('uses one stable restaurant-prefixed number for the same order id', () => {
    const orderId = '08477b65-8258-4e81-af2c-22de5f8cecfa';

    assert.equal(formatPublicOrderNumber(orderId, 'mangal'), formatPublicOrderNumber(orderId, 'Мангал'));
    assert.match(formatPublicOrderNumber(orderId, 'Мангал'), /^M\d{4}$/);
  });

  it('does not expose a raw UUID fragment', () => {
    assert.doesNotMatch(
      formatPublicOrderNumber('08477b65-8258-4e81-af2c-22de5f8cecfa', 'Мангал'),
      /08477B65/
    );
  });
});
