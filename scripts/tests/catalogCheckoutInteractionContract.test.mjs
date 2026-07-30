import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
const appStyles = await readFile(new URL('../../src/app/styles.css', import.meta.url), 'utf8');
const checkoutSource = await readFile(
  new URL('../../src/features/checkout/CheckoutScreen.tsx', import.meta.url),
  'utf8'
);
const clientPlatformSource = await readFile(
  new URL('../../src/pages/client-platform/ClientPlatformApp.tsx', import.meta.url),
  'utf8'
);

test('the product animation targets the lower cart bar and addition remains immediate', () => {
  assert.match(appSource, /data-cart-animation-target/);
  assert.match(appSource, /querySelector\('\[data-cart-animation-target\] \.cart-bar__icon'\)/);
  assert.match(appSource, /add\(product\);[\s\S]*playAddSound\(\);[\s\S]*requestAnimationFrame/);
  assert.match(appSource, /querySelector\('\.product-photo-carousel__slide\.is-active img/);
  assert.match(appSource, /cart-flyer--reverse/);
  assert.match(appSource, /const animationSnapshot = captureCartAnimation\(event\.currentTarget\);[\s\S]*playCartAnimation\(animationSnapshot,\s*true\);[\s\S]*decrement\(product\.id\)/);
});

test('the cart animation preserves the exact visible product photo before quantity changes', () => {
  assert.match(appSource, /data-active-image=\{images\[activeIndex\] \?\? product\.image_url\}/);
  assert.match(appSource, /const animationSnapshot = captureCartAnimation\(event\.currentTarget\);[\s\S]*add\(product\)/);
  assert.match(appSource, /requestAnimationFrame\(\(\) => playCartAnimation\(animationSnapshot\)\)/);
  assert.match(appSource, /carousel\?\.dataset\.activeImage/);
  assert.match(appSource, /const visibleImageRect = carousel\?\.getBoundingClientRect\(\) \?\? image\?\.getBoundingClientRect\(\)/);
  assert.match(appSource, /imageRect:\s*visibleImageRect/);
});

test('product controls suppress native text selection and touch callouts', () => {
  assert.match(appSource, /onDoubleClick=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(appSource, /className=\{quantity > 0 \? 'product-tile__stepper has-quantity'/);
  assert.match(appStyles, /\.product-tile[\s\S]*-webkit-touch-callout:\s*none;[\s\S]*user-select:\s*none;/);
});

test('product photos repeat at both edges and normalize after scrolling', () => {
  assert.match(appSource, /\[images\[images\.length - 1\], \.\.\.images, images\[0\]\]/);
  assert.match(appSource, /product-photo-carousel__slide/);
  assert.match(appSource, /scrollBehavior\s*=\s*'auto'/);
});

test('restaurant footer uses the current WayYaam brand', () => {
  assert.match(appSource, /Сайт создан в WayYaam/);
  assert.match(appSource, /WayYaam\. Все права защищены/);
});

test('the restaurant cart stays visible in the platform main menu', () => {
  assert.match(clientPlatformSource, /useCartStore/);
  assert.match(clientPlatformSource, /PlatformRestaurantCartDock/);
  assert.match(clientPlatformSource, /platform-restaurant-cart-dock/);
  assert.match(clientPlatformSource, /to="\/mangal\/checkout"/);
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
