import { expect, it } from 'vitest';
import { resolveSupabasePublicImageUrl } from '../../src/shared/supabaseBrowserUrl';
const source = 'https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/c/media/image.thumb-v1.webp?x=1';
it.each(['https://wayyaam.ru', 'https://www.wayyaam.ru'])('uses the existing proxy on %s for full and preview photos', (origin) => {
  expect(resolveSupabasePublicImageUrl(source, origin)).toBe(`${origin}/api/storage/v1/object/public/catalog-assets/c/media/image.thumb-v1.webp?x=1`);
  expect(resolveSupabasePublicImageUrl(source.replace('thumb-v1.webp', 'full-v1.jpg'), origin)).toBe(`${origin}/api/storage/v1/object/public/catalog-assets/c/media/image.full-v1.jpg?x=1`);
});
it.each([undefined, 'invalid', 'http://wayyaam.ru', 'https://wayyaam.ru.example.com', 'http://localhost:5173'])('keeps the original URL off production: %s', (origin) => {
  expect(resolveSupabasePublicImageUrl(source, origin)).toBe(source);
});
it.each(['/assets/photo.webp', 'data:image/png;base64,aA==', 'https://api.wayyaam.ru/storage/v1/object/sign/private/x', 'https://api.wayyaam.ru/rest/v1/products', 'https://elsewhere.test/image.jpg'])('does not reroute other media: %s', (url) => {
  expect(resolveSupabasePublicImageUrl(url, 'https://wayyaam.ru')).toBe(url);
});
