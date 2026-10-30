import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('checkout follows the customer sequence in source and keyboard order', () => {
  const source = readFileSync(new URL('../../src/features/checkout/CheckoutScreen.tsx', import.meta.url), 'utf8');
  const markers = ['className="checkout-customer-details"', 'id="checkout-delivery-details"', 'id="checkout-review"', 'className="checkout-comment-card"', 'className="checkout-payment-method"', 'className="checkout-submit-card"'];
  const positions = markers.map((marker) => source.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.doesNotMatch(source, /Чтобы отправить заказ:/);
});
