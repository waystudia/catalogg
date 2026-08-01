import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientsApi = readFileSync(new URL('../../src/shared/api/clientsApi.ts', import.meta.url), 'utf8');
const templatesApi = readFileSync(new URL('../../src/shared/api/templatesApi.ts', import.meta.url), 'utf8');
const adminApp = readFileSync(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8');
const templatesPage = readFileSync(new URL('../../src/features/platform-admin-templates/PlatformTemplatesPage.tsx', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../../src/pages/platform-admin/platform-admin.css', import.meta.url), 'utf8');

test('catalog templates never inflate client or active catalog statistics', () => {
  assert.match(clientsApi, /select\('id, name, slug, status, logo_url, business_type, is_template, created_at'\)/);
  assert.match(clientsApi, /catalog\.is_template !== true/);
});

test('template deletion is explicit, confirmed, and can only target a template catalog', () => {
  assert.match(templatesApi, /export async function deleteRestaurantTemplate/);
  assert.match(templatesApi, /\.eq\('id', catalogId\)[\s\S]*\.eq\('is_template', true\)[\s\S]*\.select\('id'\)/);
  assert.match(templatesPage, /window\.confirm\([\s\S]*Удалить шаблон/);
  assert.match(templatesPage, /deleteRestaurantTemplate\(template\.templateVersionId\)/);
  assert.match(templatesPage, /aria-label=\{`Удалить шаблон/);
  assert.match(adminApp, /<PlatformTemplatesPage templates=\{templatesQuery\.data \?\? \[\]\} \/>/);
});

test('mobile client search and template cards stay inside the viewport', () => {
  assert.match(adminCss, /\.clients-page \.search-field \{[^}]*overflow: hidden;[^}]*padding: 0/);
  assert.match(adminCss, /@media \(max-width: 767px\)[\s\S]*\.platform-template-card \{[\s\S]*flex-direction: column/);
  assert.match(adminCss, /\.platform-template-create input \{[\s\S]*box-sizing: border-box/);
});
