import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupabaseBrowserUrl, resolveSupabasePublicImageUrl } from './supabaseBrowserUrl';

test('WayYaam browser uses its HTTPS API proxy on either public hostname', () => {
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'https://wayyaam.ru'), 'https://wayyaam.ru/api');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru/', 'https://www.wayyaam.ru'), 'https://www.wayyaam.ru/api');
});
test('local, alternate project and missing configuration keep their existing endpoints', () => {
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'http://localhost:5173'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'https://wayyaam.ru.example.com'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'http://wayyaam.ru'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://other.supabase.co', 'https://wayyaam.ru'), 'https://other.supabase.co');
  assert.equal(resolveSupabaseBrowserUrl(undefined, 'https://wayyaam.ru'), undefined);
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru'), 'https://api.wayyaam.ru');
});

// Public photo requests need the same established production proxy as the SDK.
test('routes public Storage images through the established production proxy only', () => {
  const source = 'https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/c/media/photo.thumb-v1.webp?x=1';
  assert.equal(resolveSupabasePublicImageUrl(source, 'https://wayyaam.ru'), 'https://wayyaam.ru/api/storage/v1/object/public/catalog-assets/c/media/photo.thumb-v1.webp?x=1');
  assert.equal(resolveSupabasePublicImageUrl(source, 'https://www.wayyaam.ru'), 'https://www.wayyaam.ru/api/storage/v1/object/public/catalog-assets/c/media/photo.thumb-v1.webp?x=1');
  for (const origin of [undefined, 'http://localhost:5173', 'http://wayyaam.ru', 'https://wayyaam.ru.example.com', 'invalid']) assert.equal(resolveSupabasePublicImageUrl(source, origin), source);
  for (const url of ['/assets/photo.webp', 'data:image/png;base64,aA==', 'https://api.wayyaam.ru/storage/v1/object/sign/private/x', 'https://api.wayyaam.ru/rest/v1/products', 'https://elsewhere.test/image.jpg']) assert.equal(resolveSupabasePublicImageUrl(url, 'https://wayyaam.ru'), url);
});
