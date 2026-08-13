import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const appSource = read('src/app/App.tsx');
const checkoutSource = read('src/features/checkout/CheckoutScreen.tsx');
const catalogSource = read('src/shared/supabase.ts');
const storeSource = read('src/features/stores.ts');
const catalogAdminSource = read('src/pages/catalog-admin/CatalogAdminApp.tsx');

test('grocery weight metadata stays generic and renders a usable weight stepper', () => {
  const mapper = catalogSource.slice(
    catalogSource.indexOf('const mapPlatformProduct'),
    catalogSource.indexOf('const mapPlatformCabin')
  );

  assert.doesNotMatch(mapper, /value\.sale_unit === 'weight'[\s\S]*pricing_type:\s*'per_kg'/);
  assert.match(appSource, /isWeightPricedProduct\(product\)/);
  assert.match(appSource, /businessType === 'confectionery' \? 'Вес торта' : 'Вес товара'/);
  assert.match(appSource, /className="product-weight-stepper"/);
  assert.doesNotMatch(appSource, /aria-label="Вес торта"[\s\S]{0,500}<select/);
});

test('checkout creates the platform order even when WhatsApp is not configured', () => {
  assert.match(checkoutSource, /disabled=\{isSubmittingOrder\}/);
  assert.doesNotMatch(checkoutSource, /if \(!restaurant\.whatsapp\) \{\s*return;/);
  assert.match(checkoutSource, /restaurant\.whatsapp \? buildWhatsappHref\(orderId\) : ''/);
  assert.match(checkoutSource, /checkoutBlockingReasons/);
  assert.match(appSource, /navigate\(`\/\$\{catalogSlug\}\/order\/\$\{orderId\}`\)/);
});

test('persisted carts are scoped to one merchant', () => {
  assert.match(storeSource, /catalogSlug:\s*string \| null/);
  assert.match(storeSource, /setCatalogScope/);
  assert.match(storeSource, /state\.catalogSlug === catalogSlug[\s\S]*items: \[\]/);
  assert.match(appSource, /setCartCatalogScope\(catalogSlug\)/);
});

test('modern businesses accept legal documents only in the audited activation flow', () => {
  assert.doesNotMatch(catalogAdminSource, /ConsentModal|consent-modal|confirmPersonalDataConsent/);
  assert.doesNotMatch(catalogAdminSource, /access\.firstLogin|access\.consentGiven/);
});
