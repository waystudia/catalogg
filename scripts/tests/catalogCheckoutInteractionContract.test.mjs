import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = [
  await readFile(new URL('../../src/app/App.tsx', import.meta.url), 'utf8'),
  await readFile(new URL('../../src/features/catalog/ProductTile.tsx', import.meta.url), 'utf8')
].join('\n');
const appStyles = await readFile(new URL('../../src/app/styles.css', import.meta.url), 'utf8');
const catalogCategoryObserverSource = await readFile(
  new URL('../../src/app/useCatalogCategoryObserver.ts', import.meta.url),
  'utf8'
);
const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
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

test('mobile gestures lock single photos and enable only horizontal gallery swipes', () => {
  assert.match(
    indexSource,
    /name="viewport" content="width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no"/
  );
  assert.match(
    appSource,
    /images\.length > 1 \? ' product-photo-carousel--swipeable' : ''/
  );
  assert.match(
    appStyles,
    /\.product-photo-carousel\s*\{[^}]*touch-action:\s*none;/
  );
  assert.match(
    appStyles,
    /\.product-photo-carousel__track\s*\{[^}]*touch-action:\s*none;/
  );
  assert.match(
    appStyles,
    /\.product-photo-carousel--swipeable\s*\{[^}]*touch-action:\s*pan-x;/
  );
  assert.match(
    appStyles,
    /\.product-photo-carousel--swipeable \.product-photo-carousel__track\s*\{[^}]*overflow-x:\s*auto;[^}]*touch-action:\s*pan-x;/
  );
});

test('a clicked catalog category stays active while smooth scrolling reaches its section', () => {
  assert.match(appSource, /lockCategoryUntilVisible\(id, target\);/);
  assert.match(catalogCategoryObserverSource, /const pendingCategoryRef = useRef<string \| null>\(null\);/);
  assert.match(catalogCategoryObserverSource, /pendingCategoryRef\.current = target \? id : null;/);
  assert.match(
    catalogCategoryObserverSource,
    /const pendingCategory = pendingCategoryRef\.current;[\s\S]*pendingEntry\?\.isIntersecting[\s\S]*setActive\(pendingCategory\);[\s\S]*pendingCategoryRef\.current = null;[\s\S]*return;/
  );
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
  assert.match(checkoutSource, /if \(!validateDeliveryDetails\(\)\) return/);
  assert.match(checkoutSource, /className="checkout-validation-errors" role="alert"/);
});

test('customer contacts are required once for hall, takeaway, and delivery before payment', () => {
  const contactStart = checkoutSource.indexOf('className="checkout-customer-details"');
  const paymentStart = checkoutSource.indexOf('className="checkout-payment-method"');
  const deliveryStart = checkoutSource.indexOf('id="checkout-delivery-details"');

  assert.ok(contactStart > deliveryStart, 'customer contacts must not be nested in delivery-only fields');
  assert.ok(contactStart < paymentStart, 'customer contacts must appear before payment');
  assert.match(checkoutSource, /normalizeRussianClientPhone\(event\.target\.value\)/);
  assert.match(checkoutSource, /customerName:\s*clientName\.trim\(\)/);
  assert.match(checkoutSource, /customerPhone:\s*clientPhone\.trim\(\)/);
});

test('order submission stays disabled until contacts and both legal consents are valid', () => {
  assert.match(
    checkoutSource,
    /const isCheckoutContactValid = clientName\.trim\(\)\.length > 0 && isValidRussianClientPhone\(clientPhone\)/
  );
  assert.match(
    checkoutSource,
    /disabled=\{isSubmittingOrder \|\| !restaurant\.whatsapp \|\| !isCheckoutContactValid \|\| !isCheckoutAccountValid \|\| !acceptedOrderData \|\| !acceptedOrderTransfer\}/
  );
  assert.match(checkoutSource, /if \(!validateCheckoutContact\(\)\) return/);
  assert.match(checkoutSource, /if \(!acceptedOrderData \|\| !acceptedOrderTransfer\)/);
});

test('successful checkout persists the profile and consent, then clears the cart before opening WhatsApp', () => {
  assert.match(checkoutSource, /saveClientProfile\(\{ name: profileName, phone: profilePhone \}\)/);
  const saveProfileIndex = checkoutSource.indexOf('saveClientProfile({ name: profileName, phone: profilePhone });');
  const orderPayloadIndex = checkoutSource.indexOf('const orderPayload: CreateRestaurantOrderFromCartInput');
  assert.ok(saveProfileIndex > 0 && saveProfileIndex < orderPayloadIndex);

  const consentIndex = checkoutSource.indexOf('recordOrderConsent();');
  const clearIndex = checkoutSource.indexOf('clearCart();');
  const submitIndex = checkoutSource.indexOf('onSubmitOrder();');
  const whatsappIndex = checkoutSource.indexOf('openCreatedOrderWhatsapp(buildWhatsappHref(orderId));');

  assert.ok(consentIndex > 0);
  assert.ok(clearIndex > consentIndex);
  assert.ok(submitIndex > clearIndex);
  assert.ok(whatsappIndex > submitIndex);
});

test('order consent is restored by legal-document version without exposing legal evidence in the profile card', () => {
  assert.match(checkoutSource, /orderConsent\?\.version === CLIENT_ORDER_CONSENT_VERSION/);
  assert.match(checkoutSource, /useState\(hasCurrentOrderConsent\)/);
  assert.doesNotMatch(clientPlatformSource, /Согласия подтверждены \{displayConsentDate\}/);
});

test('catalog removes the redundant order-information chip row and sauces have a safe fallback', () => {
  assert.doesNotMatch(appSource, /aria-label="Информация о заказе"/);
  assert.match(appSource, /categorySuggestions\.length > 0[\s\S]*isSauceCategory[\s\S]*isSauceProduct\(product\)/);
});

test('upsell modal covers sticky catalog UI and uses compact two-column mobile controls', () => {
  assert.match(appStyles, /\.flow-backdrop\s*\{[^}]*z-index:\s*60;/);
  assert.match(appStyles, /\.flow-modal > \.primary-wide,[\s\S]*min-height:\s*50px;[\s\S]*font-size:\s*16px;/);
  assert.match(appStyles, /@media \(max-width: 360px\)[\s\S]*\.flow-products\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
});

test('upsell quantities support several products and the sauce fallback can be selected', () => {
  const upsellSource = appSource.slice(appSource.indexOf('function UpsellReminder'), appSource.indexOf('function AdminPanel'));
  assert.match(upsellSource, /const items = useCartStore\(\(state\) => state\.items\)/);
  assert.match(upsellSource, /const quantity = getProductCartQuantity\(items, product\.id\)/);
  assert.match(upsellSource, /<span>\{quantity\}<\/span>/);
  assert.doesNotMatch(upsellSource, /<span>1<\/span>/);
  assert.match(upsellSource, /disabled=\{!hasSelectedSuggestions\}/);
  assert.match(appSource, /isProductInCategory\(product, category\.id\) \|\|[\s\S]*isSauceCategory\(category\)[\s\S]*isSauceProduct\(product\)/);
});

test('checkout creates or opens the client account in place and clears both cart stores after success', () => {
  assert.doesNotMatch(checkoutSource, /navigate\(buildClientAuthPath\(/);
  assert.match(checkoutSource, /registerClientAccount/);
  assert.match(checkoutSource, /loginClientAccount/);
  assert.match(checkoutSource, /autoComplete="new-password"/);
  assert.match(checkoutSource, /clearClientPlatformCart\(catalogSlug\);/);
  assert.match(checkoutSource, /Аккаунт с этим номером уже существует/);
});

test('the platform cart uses the live restaurant cart and hides zero-quantity snapshots', () => {
  const cartPageSource = clientPlatformSource.slice(
    clientPlatformSource.indexOf('function PlatformCartPage'),
    clientPlatformSource.indexOf('function EmptyState')
  );
  assert.match(cartPageSource, /const restaurantCartItems = useCartStore\(\(state\) => state\.items\)/);
  assert.match(cartPageSource, /selectCartCount\(restaurantCartItems\)/);
  assert.match(cartPageSource, /selectCartTotal\(restaurantCartItems\)/);
  assert.match(cartPageSource, /summary\.quantity <= 0/);
});
