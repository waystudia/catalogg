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
  ['02-user-agreement', '2.0', '6 августа 2026 года', 'a6d0e28e0abb186ee879339a4a2b624eb6d99a5ca2fc8d3362b5ca12b9cca8b0'],
  ['09-restaurant-offer', '3.0', '18 августа 2026 года', '6a43ac2c59af2526dbdf1e3668ab0c2d75d768fefb0d0adbc17c482f1ed7f43c'],
  ['10-driver-offer', '2.0', '6 августа 2026 года', '0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f']
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
  assert.match(releasesSource, /user_agreement:[\s\S]*version: '2\.0'[\s\S]*a6d0e28e/);
  assert.match(releasesSource, /restaurant_offer:[\s\S]*version: '3\.0'[\s\S]*6a43ac2c/);
  assert.match(releasesSource, /driver_offer:[\s\S]*version: '2\.0'[\s\S]*0c0f5c66/);
  assert.match(releasesSource, /driver_consent:[\s\S]*version: '1\.0'[\s\S]*d69209f4/);
  assert.match(releasesSource, /client_consent:[\s\S]*version: '1\.0'[\s\S]*582d9449/);
  assert.match(clientAccountSource, /legalDocumentReleases\[code\]/);
  assert.match(clientAccountSource, /target_document_version:\s*release\.version/);
  assert.match(clientAccountSource, /target_document_sha256:\s*release\.sha256/);
});

test('restaurant and driver activation screens name their linked document releases', () => {
  assert.doesNotMatch(restaurantActivationSource, /редакции 1\.0 от 31 июля 2026 года/);
  assert.match(restaurantActivationSource, /Версия \{document\.version\} · SHA-256 сохранён/);
  assert.match(driverActivationSource, /legalDocumentReleases\.driver_offer\.version/);
  assert.match(driverActivationSource, /legalDocumentReleases\.driver_consent\.version/);
  assert.equal(sha256('public/legal/06-driver-consent.html'), 'd69209f4c9829694f512d4da6c0947d6a5bbaf0d5c15b84068d42360d9bdbb39');
});
