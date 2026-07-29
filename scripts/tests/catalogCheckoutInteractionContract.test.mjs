import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
const checkoutSource = await readFile(
  new URL('../../src/features/checkout/CheckoutScreen.tsx', import.meta.url),
  'utf8'
);

test('the product animation targets the lower cart bar and addition remains immediate', () => {
  assert.match(appSource, /data-cart-animation-target/);
  assert.match(appSource, /querySelector\('\[data-cart-animation-target\] \.cart-bar__icon'\)/);
  assert.match(appSource, /add\(product\);[\s\S]*playAddSound\(\);[\s\S]*requestAnimationFrame/);
});

test('continue on checkout scrolls to the final order review', () => {
  assert.match(checkoutSource, /id="checkout-review"/);
  assert.match(
    appSource,
    /if \(screen === 'checkout'\) \{[\s\S]*getElementById\('checkout-review'\)[\s\S]*scrollIntoView/
  );
});

test('delivery checkout requires customer, address, and map coordinates', () => {
  assert.match(checkoutSource, /deliveryLat === null \|\| deliveryLng === null/);
  assert.match(checkoutSource, /clientPhone\.replace\(\/\\D\/g, ''\)\.length < 10/);
  assert.match(checkoutSource, /if \(!validateDeliveryDetails\(\)\) return/);
  assert.match(checkoutSource, /className="checkout-validation-errors" role="alert"/);
});
