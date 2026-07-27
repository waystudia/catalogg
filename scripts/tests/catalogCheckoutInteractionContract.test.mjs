import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');

test('the product animation targets the lower cart bar and addition remains immediate', () => {
  assert.match(appSource, /data-cart-animation-target/);
  assert.match(appSource, /querySelector\('\[data-cart-animation-target\] \.cart-bar__icon'\)/);
  assert.match(appSource, /add\(product\);[\s\S]*playAddSound\(\);[\s\S]*requestAnimationFrame/);
});

test('continue on checkout scrolls to the final order review', () => {
  assert.match(appSource, /id="checkout-review"/);
  assert.match(
    appSource,
    /if \(screen === 'checkout'\) \{[\s\S]*getElementById\('checkout-review'\)[\s\S]*scrollIntoView/
  );
});

test('delivery checkout requires customer, address, and map coordinates', () => {
  assert.match(appSource, /deliveryLat === null \|\| deliveryLng === null/);
  assert.match(appSource, /clientPhone\.replace\(\/\\D\/g, ''\)\.length < 10/);
  assert.match(appSource, /if \(!validateDeliveryDetails\(\)\) return/);
  assert.match(appSource, /className="checkout-validation-errors" role="alert"/);
});
