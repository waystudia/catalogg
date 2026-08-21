import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const sha256 = (path) => createHash('sha256').update(read(path)).digest('hex');

const releasesSource = read('src/shared/legalDocuments.ts');
const clientAccountSource = read('src/shared/api/clientAccountApi.ts');
const restaurantActivationSource = read('src/features/restaurant-activation/RestaurantActivationPage.tsx');
const driverActivationSource = read('src/pages/driver/DriverApp.tsx');

const releaseDocuments = [
  ['01-personal-data-policy', '3.0', '18 августа 2026 года', 'f4af642654e6cdcd48205e35d1e8506a5552b34c2ea18a25f250fc79238288f8'],
  ['02-user-agreement', '3.0', '18 августа 2026 года', '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'],
  ['03-cookie-policy', '3.1', '19 августа 2026 года', '7f3022a64a308cf0b4829ac362b827e67c209e00a22a4592d06420552872a2b6'],
  ['08-order-data-transfer-consent', '3.1', '21 августа 2026 года', 'bce5eb5088bbce6cda7b1f316d17955e7406803777eeeaef056e83f918d87455'],
  ['09-restaurant-offer', '3.0', '18 августа 2026 года', '6a43ac2c59af2526dbdf1e3668ab0c2d75d768fefb0d0adbc17c482f1ed7f43c'],
  ['10-driver-offer', '3.0', '18 августа 2026 года', 'b64b00570e8c52cafa76b531f97637d121d8db22770d6e01261139906a104e2f']
];

test('published legal documents match their reviewed release metadata and evidence hashes', () => {
  for (const [fileName, version, publishedAt, expectedHash] of releaseDocuments) {
    const html = read(`public/legal/${fileName}.html`);
    assert.match(html, new RegExp(`Редакция:<\\/strong> ${version.replace('.', '\\.')} от ${publishedAt}`));
    assert.equal(sha256(`public/legal/${fileName}.html`), expectedHash);
    assert.equal(html, read(`docs/legal/html/${fileName}.html`));
  }
});

test('registration records each accepted document with its own version and SHA-256', () => {
  assert.match(releasesSource, /user_agreement:[\s\S]*version: '3\.0'[\s\S]*3759c66b/);
  assert.match(releasesSource, /restaurant_offer:[\s\S]*version: '3\.0'[\s\S]*6a43ac2c/);
  assert.match(releasesSource, /driver_offer:[\s\S]*version: '3\.0'[\s\S]*b64b0057/);
  assert.match(releasesSource, /driver_consent:[\s\S]*version: '3\.0'[\s\S]*b2b3a117/);
  assert.match(releasesSource, /client_consent:[\s\S]*version: '3\.0'[\s\S]*feb54a97/);
  assert.match(releasesSource, /advertising_consent:[\s\S]*version: '3\.0'[\s\S]*749116fa/);
  assert.match(releasesSource, /order_transfer_consent:[\s\S]*version: '3\.1'[\s\S]*bce5eb50/);
  assert.match(clientAccountSource, /legalDocumentReleases\[code\]/);
  assert.match(clientAccountSource, /target_document_version:\s*release\.version/);
  assert.match(clientAccountSource, /target_document_sha256:\s*release\.sha256/);
});

test('restaurant and driver activation screens name their linked document releases', () => {
  assert.doesNotMatch(restaurantActivationSource, /редакции 1\.0 от 31 июля 2026 года/);
  assert.match(restaurantActivationSource, /Версия \{document\.version\} · SHA-256 сохранён/);
  assert.match(driverActivationSource, /legalDocumentReleases\.driver_offer\.version/);
  assert.match(driverActivationSource, /legalDocumentReleases\.driver_consent\.version/);
  assert.equal(sha256('public/legal/06-driver-consent.html'), 'b2b3a117ac0ed8aed794db4f4cb3b7555a7fced40109d07d3f36f790b48c4fd6');
});
