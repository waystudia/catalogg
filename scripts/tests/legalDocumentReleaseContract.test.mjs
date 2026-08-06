import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const sha256 = (path) => createHash('sha256').update(read(path)).digest('hex');

const releasesSource = read('src/shared/legalDocuments.ts');
const clientAccountSource = read('src/shared/api/clientAccountApi.ts');
const catalogAdminSource = read('src/pages/catalog-admin/CatalogAdminApp.tsx');
const driverAdminSource = read('src/features/platform-admin-drivers/PlatformDriversPage.tsx');

const releaseDocuments = [
  ['02-user-agreement', 'a6d0e28e0abb186ee879339a4a2b624eb6d99a5ca2fc8d3362b5ca12b9cca8b0'],
  ['09-restaurant-offer', '2f130f153776feb1127823776bb3b9c9dd953d3257745e48a0987a9c15d36eac'],
  ['10-driver-offer', '0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f']
];

test('the three published legal documents are the reviewed 2.0 release with exact evidence hashes', () => {
  for (const [fileName, expectedHash] of releaseDocuments) {
    const html = read(`public/legal/${fileName}.html`);
    assert.match(html, /Редакция:<\/strong> 2\.0 от 6 августа 2026 года/);
    assert.equal(sha256(`public/legal/${fileName}.html`), expectedHash);
    assert.equal(html, read(`docs/legal/html/${fileName}.html`));
  }
});

test('registration records each accepted document with its own version and SHA-256', () => {
  assert.match(releasesSource, /user_agreement:[\s\S]*version: '2\.0'[\s\S]*a6d0e28e/);
  assert.match(releasesSource, /restaurant_offer:[\s\S]*version: '2\.0'[\s\S]*2f130f15/);
  assert.match(releasesSource, /driver_offer:[\s\S]*version: '2\.0'[\s\S]*0c0f5c66/);
  assert.match(releasesSource, /client_consent:[\s\S]*version: '1\.0'[\s\S]*582d9449/);
  assert.match(clientAccountSource, /legalDocumentReleases\[code\]/);
  assert.match(clientAccountSource, /target_document_version:\s*release\.version/);
  assert.match(clientAccountSource, /target_document_sha256:\s*release\.sha256/);
});

test('restaurant and driver cabinet copy names the linked offer release 2.0', () => {
  assert.doesNotMatch(catalogAdminSource, /редакции 1\.0 от 31 июля 2026 года/);
  assert.match(catalogAdminSource, /legalDocumentReleases\.restaurant_offer\.version/);
  assert.match(driverAdminSource, /legalDocumentReleases\.driver_offer\.version/);
});
